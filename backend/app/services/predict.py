"""Prediction query planner.

SPEC: the prediction UI is a **query box, not a chat**. The student types a
question and gets a structured answer — a number, a scenarios table, a
reachability verdict — never a conversational reply.

Two-stage design:

1. **Fast heuristic parser** for the two most distinctive query shapes:
   - "what's my (current) grade" — trivially safe to classify.
   - "<name> is worth X%, what do I need for a Y" — reweight declaration,
     also very distinctive.
   Both are cheap, unit-tested, and work without an `ANTHROPIC_API_KEY`.

2. **Claude fallback** for everything else. Claude receives the *full* course
   state (categories with weights, entries with scores, grading scale,
   current grade) alongside the raw student question and returns a
   **compute plan**. Claude never adds or divides — the deterministic math
   engine in `grade_math.py` turns the plan into numbers.

The plan schema is intentionally small (4 actions, a few enums for target
and focus) so Claude has room to reason about intent without room to
hallucinate arithmetic.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Literal

from anthropic import Anthropic

from app.config import get_settings
from app.services import grade_math as gm

logger = logging.getLogger(__name__)


# --- plan schema -----------------------------------------------------------


TargetKind = Literal["letter", "pct", "passing"]


@dataclass
class TargetSpec:
    """What grade the student is targeting.

    - ``letter``: an exact scale letter (e.g. "A", "A-"). Resolved via
      the course's ``GradeScaleBand`` list.
    - ``pct``: a numeric percent (0-100).
    - ``passing``: the lowest non-F band on the course scale. `value` is None.
    """

    kind: TargetKind
    value: str | float | None = None


FocusMode = Literal["specific_entry", "specific_category", "any_remaining"]


@dataclass
class FocusSpec:
    """Which item(s) the student wants the math to solve for.

    - ``specific_entry``: student named an entry (e.g. "the final exam").
      ``entry_name`` must exactly match an existing entry.
    - ``specific_category``: student named a category (e.g. "the papers
      average"). ``category_name`` must exactly match.
    - ``any_remaining``: student didn't name a specific item, or their
      phrasing implies "the rest of the class" ("am I on track", "can I
      still pass"). The math engine uses the chronologically-nearest
      ungraded entry as the anchor.
    """

    mode: FocusMode = "any_remaining"
    entry_name: str | None = None
    category_name: str | None = None


@dataclass
class ReweightSpec:
    """Ad-hoc reweighting — the student announced a new weighted item that
    isn't in the syllabus ("my final is worth 20%")."""

    new_category_name: str
    new_weight_pct: float


PlanAction = Literal["current_grade", "predict", "reweight", "unknown"]


@dataclass
class PredictionPlan:
    """The structured output of the planning layer. The router consumes it,
    runs the deterministic math, and produces a `PredictResponse`."""

    action: PlanAction
    target: TargetSpec | None = None
    focus: FocusSpec = field(default_factory=FocusSpec)
    reweight: ReweightSpec | None = None
    # Optional 0-15 word context sentence that the router prepends to the
    # explanation. Should NOT contain numbers Claude didn't derive from the
    # provided state. Example: "Passing here means a D (60%)."
    narrative_prefix: str = ""


# --- heuristics ------------------------------------------------------------


# Tightened: requires "my" or "current" adjacent to "grade" so questions
# like "what's the highest grade I could still get" don't get mis-classified
# as current-grade queries. Everything else goes to Claude, which has the
# full state and can reason properly.
_CURRENT_PATTERNS = [
    re.compile(
        r"\b(?:what[''\u2019]?s?|what\s+is|show|give\s+me|tell\s+me)"
        r"\s+(?:me\s+)?"
        r"(?:my\s+(?:current\s+)?|(?:the\s+)?current\s+)grade\b",
        re.IGNORECASE,
    ),
]


# Passing / failing reachability — distinctive enough that we shouldn't
# depend on Claude getting `{kind: "passing"}` right (a wrong `{pct: 0}`
# or letter "F" previously made the math solve for a 0% target).
_PASS_PATTERNS = [
    re.compile(
        r"\b(?:"
        r"can\s+i\s+still\s+pass"
        r"|can\s+i\s+pass"
        r"|am\s+i\s+(?:still\s+)?passing"
        r"|will\s+i\s+(?:still\s+)?pass"
        r"|am\s+i\s+failing"
        r"|am\s+i\s+going\s+to\s+fail"
        r"|do\s+i\s+still\s+pass"
        r")\b",
        re.IGNORECASE,
    ),
]


# Reweight is very distinctive — a weight declaration + target ask in the
# same query. Non-greedy on the extra-word portion so the trigger phrase
# claims "is worth" instead of the name gobbling "is" as an extra word.
_REWEIGHT_PATTERNS = [
    re.compile(
        r"\b(?:my\s+|the\s+)?"
        r"(?P<name>[A-Za-z][A-Za-z\-]*(?:\s+[A-Za-z][A-Za-z\-]*){0,3}?)"
        r"\s+(?:is\s+worth|weighs?|counts?\s+for|counts?\s+as|worth)"
        r"\s+(?P<pct>\d{1,2}(?:\.\d+)?)\s*%?"
        r"(?:\s+of\s+(?:the\s+|my\s+|our\s+)?(?:grade|final|course))?"
        r"[,.\s]*"
        r"(?:what|how\s*much|score)\s+(?:do\s+i\s+need|to\s+get)?"
        r"[^?]*?(?:to\s+(?:get|hit|earn|make|reach|score|land)|for)\s+(?:an?\s+)?"
        r"(?P<target_val>[A-F][+-]?|\d{1,3}(?:\.\d+)?)\??",
        re.IGNORECASE,
    ),
]


def parse_query_heuristic(query: str) -> PredictionPlan | None:
    """Fast path for the distinctive shapes. Returns None otherwise so
    the caller sends the query (plus full state) to Claude."""
    q = query.strip()

    for pat in _CURRENT_PATTERNS:
        if pat.search(q):
            return PredictionPlan(action="current_grade")

    for pat in _PASS_PATTERNS:
        if pat.search(q):
            return PredictionPlan(
                action="predict",
                target=TargetSpec(kind="passing"),
                focus=FocusSpec(mode="any_remaining"),
            )

    for pat in _REWEIGHT_PATTERNS:
        m = pat.search(q)
        if not m:
            continue
        try:
            pct = float(m.group("pct"))
        except (TypeError, ValueError):
            continue
        if not (0 < pct < 100):
            continue
        name = _normalize_new_category_name(m.group("name"))
        target = _classify_target_str(m.group("target_val").strip())
        return PredictionPlan(
            action="reweight",
            target=target,
            reweight=ReweightSpec(new_category_name=name, new_weight_pct=pct),
            focus=FocusSpec(mode="any_remaining"),
        )

    return None


def _normalize_new_category_name(raw: str) -> str:
    """Clean up a heuristic-captured name into a display name."""
    cleaned = re.sub(r"^(the|my|our|a|an)\s+", "", raw, flags=re.IGNORECASE).strip()
    if not cleaned:
        return "Final"
    lowered = cleaned.lower()
    if lowered in ("exam", "test", "midterm", "quiz"):
        return "Final Exam"
    if lowered == "final":
        return "Final"
    return cleaned.title()


def _classify_target_str(raw: str) -> TargetSpec:
    """Numeric string → pct target; letter → letter target."""
    stripped = raw.strip()
    try:
        return TargetSpec(kind="pct", value=float(stripped))
    except ValueError:
        return TargetSpec(kind="letter", value=stripped)


# --- Claude fallback -------------------------------------------------------


_SYSTEM_PROMPT = """You are Vivifi's grade-question planner.

You NEVER do arithmetic. The deterministic math engine handles every number.
Your job is to produce a small JSON plan that tells the engine what to
compute for the student's question, given the full course state.

Output shape (return ONLY this JSON, first char `{`, last char `}`):

{
  "action": "current_grade" | "predict" | "reweight" | "unknown",
  "target": null
          | { "kind": "letter", "value": "A" | "A-" | "B+" | ... }
          | { "kind": "pct",    "value": <number 0-100> }
          | { "kind": "passing" },
  "focus": {
    "mode": "specific_entry" | "specific_category" | "any_remaining",
    "entry_name":    <exact match from the provided entries list, or null>,
    "category_name": <exact match from the provided categories list, or null>
  },
  "reweight": null | {
    "new_category_name": "<short display name>",
    "new_weight_pct":    <number strictly between 0 and 100>
  },
  "narrative_prefix": "<0-15 word context sentence, or empty string>"
}

ACTIONS:

- "current_grade": student just wants their current grade number
  ("what's my grade", "how am I doing overall").
  → target = null, focus.mode = "any_remaining", reweight = null.

- "predict": student wants to know what score to hit, or whether a target
  grade is still reachable, or what to aim for. This covers a wide range:
  "what do I need on X for a Y", "am I on track for an A", "can I still
  pass", "what should I aim for on my next test", "is a B+ still possible".
  → target must be non-null.

- "reweight": student announced a NEW weighted item that isn't already in
  the categories list, AND asked a prediction question against it.
  ("my final is worth 20%, what do I need to get an A")
  → reweight must be non-null. target must be non-null.

- "unknown": query is off-topic, ambiguous, or missing the info needed to
  answer (e.g. asks for prediction but names no target).

TARGET RULES:

- "am I passing" / "can I still pass" / "am I failing" → target =
  { "kind": "passing" }. NEVER invent a specific letter or number for
  passing — the engine derives it from the course's grading scale.
- NEVER use { "kind": "pct", "value": 0 } or letter "F" as a target.
  Those make the math solve for a failing bar and produce nonsense.
- Letter targets: copy the letter EXACTLY as the student typed
  (don't correct "A" to "A-"). If they said "A" and the scale has both
  "A" and "A-", use "A".
- Numeric targets: use the number they typed (must be > 0).

FOCUS RULES:

- specific_entry: student named a real gradebook entry that appears in the
  entries list (e.g. "the final exam", "hw3", "test 2"). Match EXACTLY.
- specific_category: student named a real category from the categories
  list (e.g. "the exam average", "papers"). Match EXACTLY.
- any_remaining: student didn't name a specific item, OR their phrasing
  implies "the rest of the class". Use this for reachability queries like
  "am I on track for A" or "can I still pass".
- If nothing in the provided lists matches with reasonable confidence,
  fall back to any_remaining with null names — don't invent names.

REWEIGHT RULES:

- ONLY set "reweight" when the student EXPLICITLY announced a NEW weight
  for an item that isn't already in the categories list (e.g. "my final
  is worth 20%"). Otherwise leave it null.
- If the announced item already appears in the categories list, treat the
  query as a normal "predict" — the item already has its real weight.
- new_weight_pct must be strictly between 0 and 100 exclusive.

NARRATIVE_PREFIX RULES:

- Optional 0-15 word context sentence, or "". Prepended to the engine's
  explanation. Example: "Passing here means a D (60%)."
- Do NOT include numbers you derived yourself. Only reference numbers that
  appear in the provided state or that follow trivially from the grading
  scale (like "passing = D (60%)").
- Do NOT include a numeric answer. The engine writes those.

RESPONSE FORMAT:

The first character of your response MUST be `{` and the last must be `}`.
No markdown fences, no leading prose, no trailing commentary.
"""


def parse_query_claude(
    query: str,
    *,
    categories: list[gm.CategoryInput],
    entries: list[gm.EntryInput],
    bands: list[gm.ScaleBand],
    current_grade: gm.CurrentGrade,
) -> PredictionPlan:
    """Give Claude the full state + raw question, get a PredictionPlan back.

    Falls back to `PredictionPlan(action="unknown")` if the API call fails
    or the response can't be parsed as JSON.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        return PredictionPlan(action="unknown")

    client = Anthropic(api_key=settings.anthropic_api_key)
    user_message = _format_state_for_claude(
        query, categories, entries, bands, current_grade
    )

    try:
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=768,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
    except Exception:
        logger.exception("Anthropic call failed for prediction plan")
        return PredictionPlan(action="unknown")

    text_parts: list[str] = []
    for block in response.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(getattr(block, "text", ""))
    combined = "".join(text_parts).strip()

    return _parse_plan_json(combined, categories, entries)


def _format_state_for_claude(
    query: str,
    categories: list[gm.CategoryInput],
    entries: list[gm.EntryInput],
    bands: list[gm.ScaleBand],
    current_grade: gm.CurrentGrade,
) -> str:
    scale_lines = "\n".join(
        f"- {b.letter}: {_fmt_num(b.min_pct)}%+"
        for b in sorted(bands, key=lambda b: -b.min_pct)
    ) or "(none)"
    cat_lines = "\n".join(
        f"- {c.name} ({_fmt_num(c.weight_pct)}%)" for c in categories
    ) or "(none)"

    entry_lines_parts = []
    for e in entries:
        cat_name = next(
            (c.name for c in categories if c.id == e.category_id),
            "(uncategorized)",
        )
        if e.hidden:
            state = "hidden (excluded from math)"
        elif e.points_earned is None:
            state = f"—/{_fmt_num(e.points_possible)} (ungraded)"
        else:
            state = f"{_fmt_num(e.points_earned)}/{_fmt_num(e.points_possible)}"
        due = f" — due {e.due_date}" if e.due_date else ""
        name = e.name or "(unnamed)"
        entry_lines_parts.append(f"- {name} [{cat_name}]: {state}{due}")
    entry_lines = "\n".join(entry_lines_parts) or "(none yet)"

    if current_grade.percentage is not None:
        current_line = (
            f"Current grade: {_fmt_num(current_grade.percentage)}% "
            f"({current_grade.letter or '—'})"
        )
    else:
        current_line = "Current grade: no grades yet"

    return (
        f"Grading scale:\n{scale_lines}\n\n"
        f"Categories:\n{cat_lines}\n\n"
        f"Gradebook entries:\n{entry_lines}\n\n"
        f"{current_line}\n\n"
        f"Student's question:\n{query.strip()}\n\n"
        f"Return the JSON plan."
    )


def _fmt_num(n: float) -> str:
    r = round(n, 2)
    if r == int(r):
        return str(int(r))
    return f"{r:g}"


def _parse_plan_json(
    raw: str,
    categories: list[gm.CategoryInput],
    entries: list[gm.EntryInput],
) -> PredictionPlan:
    """Parse Claude's JSON response into a `PredictionPlan`. Any malformed
    field degrades that field's default rather than blowing up the whole
    plan; a completely-unrecoverable response degrades to `action="unknown"`.
    """
    stripped = raw.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)

    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", stripped)
        if not match:
            return PredictionPlan(action="unknown")
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return PredictionPlan(action="unknown")

    if not isinstance(data, dict):
        return PredictionPlan(action="unknown")

    action_raw = str(data.get("action", "unknown")).strip()
    if action_raw not in ("current_grade", "predict", "reweight", "unknown"):
        action_raw = "unknown"
    action: PlanAction = action_raw  # type: ignore[assignment]

    narrative = _coerce_optional_str(data.get("narrative_prefix")) or ""
    target = _parse_target_json(data.get("target"))
    focus = _parse_focus_json(data.get("focus"), categories, entries)
    reweight = _parse_reweight_json(data.get("reweight"))

    # Guard: predict / reweight require a target.
    if action in ("predict", "reweight") and target is None:
        action = "unknown"
    # Guard: reweight requires a reweight spec.
    if action == "reweight" and reweight is None:
        action = "unknown"

    return PredictionPlan(
        action=action,
        target=target,
        focus=focus,
        reweight=reweight,
        narrative_prefix=narrative,
    )


def _parse_target_json(raw: object) -> TargetSpec | None:
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind", "")).strip()
    if kind not in ("letter", "pct", "passing"):
        return None
    if kind == "passing":
        return TargetSpec(kind="passing", value=None)
    value = raw.get("value")
    if kind == "letter":
        if not isinstance(value, str) or not value.strip():
            return None
        letter = value.strip()
        # F / Fail is not a prediction target — treat as "passing" intent
        # rather than solving for a 0% bar (which produces nonsense negatives).
        if letter.upper().startswith("F"):
            return TargetSpec(kind="passing", value=None)
        return TargetSpec(kind="letter", value=letter)
    pct: float | None = None
    if isinstance(value, (int, float)):
        pct = float(value)
    elif isinstance(value, str):
        try:
            pct = float(value.strip().rstrip("%").strip())
        except ValueError:
            return None
    if pct is None:
        return None
    # A 0% (or negative) target is never a real student ask — usually Claude
    # confusing "failing" with a numeric zero. Coerce to passing.
    if pct <= 0:
        return TargetSpec(kind="passing", value=None)
    return TargetSpec(kind="pct", value=pct)


def _parse_focus_json(
    raw: object,
    categories: list[gm.CategoryInput],
    entries: list[gm.EntryInput],
) -> FocusSpec:
    if not isinstance(raw, dict):
        return FocusSpec()
    mode = str(raw.get("mode", "any_remaining")).strip()
    if mode not in ("specific_entry", "specific_category", "any_remaining"):
        return FocusSpec()

    entry_name = _coerce_optional_str(raw.get("entry_name"))
    category_name = _coerce_optional_str(raw.get("category_name"))

    entry_names = {e.name for e in entries}
    category_names = {c.name for c in categories}

    if mode == "specific_entry":
        if entry_name is None or entry_name not in entry_names:
            return FocusSpec(mode="any_remaining")
        return FocusSpec(mode="specific_entry", entry_name=entry_name)
    if mode == "specific_category":
        if category_name is None or category_name not in category_names:
            return FocusSpec(mode="any_remaining")
        return FocusSpec(mode="specific_category", category_name=category_name)
    return FocusSpec(mode="any_remaining")


def _parse_reweight_json(raw: object) -> ReweightSpec | None:
    if not isinstance(raw, dict):
        return None
    name = _coerce_optional_str(raw.get("new_category_name"))
    pct_raw = raw.get("new_weight_pct")
    try:
        pct = float(pct_raw) if pct_raw is not None else None
    except (TypeError, ValueError):
        return None
    if not name or pct is None or not (0 < pct < 100):
        return None
    return ReweightSpec(new_category_name=name, new_weight_pct=pct)


def _coerce_optional_str(v: object) -> str | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        r = round(float(v), 4)
        return str(int(r)) if r == int(r) else str(r)
    if isinstance(v, str):
        s = v.strip()
        return s or None
    return None


# --- public entry point ----------------------------------------------------


def plan_prediction(
    query: str,
    *,
    categories: list[gm.CategoryInput],
    entries: list[gm.EntryInput],
    bands: list[gm.ScaleBand],
    current_grade: gm.CurrentGrade,
) -> PredictionPlan:
    """Two-stage plan: heuristic first, then Claude with full state.

    The heuristic covers only the two most distinctive shapes:
      - "what's my (current) grade"
      - "<name> is worth X%, what do I need to get Y" (reweight)

    Everything else goes to Claude, which sees the entire course state and
    returns a compute plan. Claude never does math — the deterministic
    engine (`grade_math.py`) turns the plan into numbers.
    """
    fast = parse_query_heuristic(query)
    if fast is not None and fast.action != "unknown":
        return fast

    return parse_query_claude(
        query,
        categories=categories,
        entries=entries,
        bands=bands,
        current_grade=current_grade,
    )
