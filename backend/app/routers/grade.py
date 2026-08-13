"""Current-grade and prediction endpoints.

Two endpoints, both under `/courses/{slug}`:

- `GET /grade` — computed current grade + category breakdown + resolved target.
- `POST /predict` — natural-language query → structured answer.

The math itself lives in `app.services.grade_math` (unit-tested, no ORM
coupling). This router is a thin adapter:

1. Pull the entities out of the DB, convert to the math module's dataclasses.
2. Ask `plan_prediction` (heuristic + Claude planner) for a compute plan.
3. Route the plan into the math engine (`predict_entry_needed`,
   `predict_category_needed`, `anchor_scenarios`, `apply_reweight`).
4. Shape the deterministic answer into a `PredictResponse`.

The planning layer never does arithmetic — every number the UI sees comes
from `grade_math`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    Assignment,
    GradebookEntry,
    GradeCategory,
    GradeScaleBand,
    User,
)
from app.routers._common import get_owned_course
from app.schemas.predict import (
    CategoryEarnedRead,
    CurrentGradeResponse,
    PredictRequest,
    PredictResponse,
    ReweightAppliedRead,
    ReweightScaledRead,
    ScenarioLegRead,
    ScenarioRead,
)
from app.services import grade_math as gm
from app.services.predict import (
    PredictionPlan,
    TargetSpec,
    plan_prediction,
)

router = APIRouter(prefix="/courses/{course_slug}", tags=["grade"])


# --- state loading + serialization ----------------------------------------


def _load_grade_state(
    db: Session, course_id: int
) -> tuple[list[gm.EntryInput], list[gm.CategoryInput], list[gm.ScaleBand]]:
    entries_orm = db.execute(
        select(GradebookEntry).where(GradebookEntry.course_id == course_id)
    ).scalars().all()
    cats_orm = db.execute(
        select(GradeCategory).where(GradeCategory.course_id == course_id)
    ).scalars().all()
    bands_orm = db.execute(
        select(GradeScaleBand).where(GradeScaleBand.course_id == course_id)
    ).scalars().all()

    # Pull assignment due dates so scenario ordering can be chronological.
    assignments = db.execute(
        select(Assignment).where(Assignment.course_id == course_id)
    ).scalars().all()
    due_by_assignment_id = {a.id: a.due_date for a in assignments}

    entries = [
        gm.EntryInput(
            id=e.id,
            category_id=e.category_id,
            points_earned=e.points_earned,
            points_possible=e.points_possible,
            hidden=e.hidden,
            name=e.name,
            due_date=(
                due_by_assignment_id[e.source_assignment_id].isoformat()
                if e.source_assignment_id
                and due_by_assignment_id.get(e.source_assignment_id) is not None
                else None
            ),
        )
        for e in entries_orm
    ]
    cats = [
        gm.CategoryInput(
            id=c.id,
            name=c.name,
            weight_pct=c.weight_pct,
            drop_lowest_n=c.drop_lowest_n,
        )
        for c in cats_orm
    ]
    bands = [gm.ScaleBand(letter=b.letter, min_pct=b.min_pct) for b in bands_orm]
    return entries, cats, bands


def _serialize_scenarios(scenarios: list[gm.Scenario]) -> list[ScenarioRead]:
    return [
        ScenarioRead(
            id=s.id,
            label=s.label,
            description=s.description,
            anchor_pct=s.anchor_pct,
            solve_pct=s.solve_pct,
            resulting_grade_pct=s.resulting_grade_pct,
            resulting_letter=s.resulting_letter,
            reachable=s.reachable,
            already_locked_in=s.already_locked_in,
            legs=[
                ScenarioLegRead(entry_name=l.entry_name, role=l.role, pct=l.pct)
                for l in s.legs
            ],
        )
        for s in scenarios
    ]


def _serialize_reweight(info: gm.ReweightInfo) -> ReweightAppliedRead:
    return ReweightAppliedRead(
        new_category_name=info.new_category_name,
        new_weight_pct=info.new_weight_pct,
        scaled=[
            ReweightScaledRead(
                name=n, original_weight_pct=orig, scaled_weight_pct=scaled
            )
            for (n, orig, scaled) in info.scaled
        ],
    )


# --- endpoints -------------------------------------------------------------


@router.get("/grade", response_model=CurrentGradeResponse)
def get_current_grade(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CurrentGradeResponse:
    course = get_owned_course(db, course_slug, current_user)
    entries, cats, bands = _load_grade_state(db, course.id)
    cg = gm.compute_current_grade(entries, cats, bands)

    target_pct: float | None = None
    if course.target_grade:
        target_pct = gm.resolve_target(course.target_grade, bands)

    return CurrentGradeResponse(
        percentage=cg.percentage,
        letter=cg.letter,
        breakdown=[
            CategoryEarnedRead(
                category_id=b.category_id,
                name=b.name,
                weight_pct=b.weight_pct,
                earned_pct=b.earned_pct,
                has_grades=b.has_grades,
            )
            for b in cg.breakdown
        ],
        target=course.target_grade,
        target_pct=target_pct,
    )


@router.post("/predict", response_model=PredictResponse)
def predict(
    course_slug: str,
    payload: PredictRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PredictResponse:
    course = get_owned_course(db, course_slug, current_user)
    entries, cats, bands = _load_grade_state(db, course.id)
    current = gm.compute_current_grade(entries, cats, bands)

    plan = plan_prediction(
        payload.query,
        categories=cats,
        entries=entries,
        bands=bands,
        current_grade=current,
    )

    response = _dispatch_plan(
        plan=plan,
        entries=entries,
        cats=cats,
        bands=bands,
    )

    # Prepend Claude's narrative context (never numbers — those come from
    # the math engine) so the UI can render both.
    if plan.narrative_prefix:
        response.explanation = _prepend_prefix(
            plan.narrative_prefix, response.explanation
        )
    return response


# --- plan dispatch ---------------------------------------------------------


def _dispatch_plan(
    *,
    plan: PredictionPlan,
    entries: list[gm.EntryInput],
    cats: list[gm.CategoryInput],
    bands: list[gm.ScaleBand],
) -> PredictResponse:
    if plan.action == "unknown":
        return _unknown_response()

    if plan.action == "current_grade":
        return _respond_current_grade(entries, cats, bands)

    # "predict" and "reweight" both flow through the same solver — reweight
    # just applies a temporary state modification first.
    reweight_applied: ReweightAppliedRead | None = None
    synthetic_entry_id: int | None = None
    synthetic_entry_name: str | None = None
    if plan.reweight is not None:
        try:
            entries, cats, synthetic, info = gm.apply_reweight(
                entries,
                cats,
                plan.reweight.new_category_name,
                plan.reweight.new_weight_pct,
            )
        except ValueError as exc:
            return _unknown_response(hint=str(exc))
        reweight_applied = _serialize_reweight(info)
        synthetic_entry_id = synthetic.id
        synthetic_entry_name = plan.reweight.new_category_name

    target_pct = _resolve_target_spec(plan.target, bands)
    target_display = _target_display(plan.target)
    if target_pct is None or target_pct <= 0:
        return PredictResponse(
            kind="unknown",
            answer=None,
            letter=None,
            reachable=None,
            already_locked_in=None,
            target=target_display,
            reweight_applied=reweight_applied,
            explanation=(
                f"I couldn't match {target_display!r} to a grade on your "
                "scale — try a specific number like 90 or a letter that "
                "appears in your grading scale."
                if target_display
                else "I couldn't figure out what grade you were asking about."
            ),
        )

    # For "passing" targets, always inject a short context line naming the
    # resolved bar (heuristic path has no Claude narrative_prefix).
    if plan.target and plan.target.kind == "passing" and not plan.narrative_prefix:
        passing_letter = gm.letter_for(target_pct, bands)
        if passing_letter:
            plan.narrative_prefix = (
                f"Passing here means a {passing_letter} "
                f"({_fmt_num(target_pct)}%)"
            )
        else:
            plan.narrative_prefix = f"Passing here means {_fmt_num(target_pct)}%"

    # Route by focus.
    if (
        plan.focus.mode == "specific_entry"
        and plan.focus.entry_name
        and _find_entry(entries, plan.focus.entry_name) is not None
    ):
        entry = _find_entry(entries, plan.focus.entry_name)
        assert entry is not None
        response = _respond_needed_on_entry(
            entry=entry,
            target_pct=target_pct,
            target_display=target_display,
            entries=entries,
            cats=cats,
            bands=bands,
        )
    elif (
        plan.focus.mode == "specific_category"
        and plan.focus.category_name
        and _find_category(cats, plan.focus.category_name) is not None
    ):
        cat = _find_category(cats, plan.focus.category_name)
        assert cat is not None
        response = _respond_needed_on_category(
            cat=cat,
            target_pct=target_pct,
            target_display=target_display,
            entries=entries,
            cats=cats,
            bands=bands,
        )
    else:
        # any_remaining. For a reweight, the synthetic new item is what the
        # student is really asking about — solve for that; anchor everything
        # else that's still ungraded.
        response = _respond_scenarios(
            target_pct=target_pct,
            target_display=target_display,
            entries=entries,
            cats=cats,
            bands=bands,
            mentioned_entry_id=synthetic_entry_id,
            target_entry_name=synthetic_entry_name,
        )

    if reweight_applied is not None:
        response.reweight_applied = reweight_applied
        # Tag so the UI can distinguish reweight-driven answers.
        if response.kind == "scenarios":
            response.kind = "reweight_scenarios"
        elif response.kind in ("needed_on_entry", "needed_on_category"):
            response.kind = "reweight"

    return response


# --- response helpers ------------------------------------------------------


def _respond_current_grade(
    entries: list[gm.EntryInput],
    cats: list[gm.CategoryInput],
    bands: list[gm.ScaleBand],
) -> PredictResponse:
    cg = gm.compute_current_grade(entries, cats, bands)
    if cg.percentage is None:
        return PredictResponse(
            kind="current_grade",
            answer=None,
            letter=None,
            reachable=None,
            already_locked_in=None,
            explanation=(
                "No grades yet — enter a few gradebook entries first and "
                "I'll compute your current."
            ),
        )
    return PredictResponse(
        kind="current_grade",
        answer=cg.percentage,
        letter=cg.letter,
        current_pct=cg.percentage,
        current_letter=cg.letter,
        reachable=None,
        already_locked_in=None,
        explanation=(
            f"Your current grade is {_fmt_num(cg.percentage)}%"
            + (f" ({cg.letter})" if cg.letter else "")
            + "."
        ),
    )


def _respond_needed_on_entry(
    *,
    entry: gm.EntryInput,
    target_pct: float,
    target_display: str | None,
    entries: list[gm.EntryInput],
    cats: list[gm.CategoryInput],
    bands: list[gm.ScaleBand],
) -> PredictResponse:
    """Single-entry prediction, upgraded to a scenarios table when other
    ungraded items exist that would materially affect the answer."""
    ungraded = gm.list_ungraded_entries(entries, cats)
    other_ungraded = [u for u in ungraded if u.id != entry.id]
    if other_ungraded:
        return _respond_scenarios(
            target_pct=target_pct,
            target_display=target_display,
            entries=entries,
            cats=cats,
            bands=bands,
            mentioned_entry_id=entry.id,
            target_entry_name=entry.name,
        )

    result = gm.predict_entry_needed(
        target_pct=target_pct,
        entry=entry,
        entries=entries,
        categories=cats,
        entry_name=entry.name,
    )
    return PredictResponse(
        kind="needed_on_entry",
        answer=result.needed_pct,
        letter=None,
        reachable=result.reachable,
        already_locked_in=result.already_locked_in,
        target=target_display,
        target_pct=target_pct,
        target_entry_name=entry.name,
        needed_points=result.needed_points,
        explanation=result.explanation,
    )


def _respond_needed_on_category(
    *,
    cat: gm.CategoryInput,
    target_pct: float,
    target_display: str | None,
    entries: list[gm.EntryInput],
    cats: list[gm.CategoryInput],
    bands: list[gm.ScaleBand],
) -> PredictResponse:
    """Category-level prediction. Upgrades to scenarios if there are ungraded
    entries in OTHER categories (the naive formula assumes those finish at
    their current earned — which is misleading if they've never been graded)."""
    ungraded = gm.list_ungraded_entries(entries, cats)
    ungraded_in_other_cats = [u for u in ungraded if u.category_id != cat.id]
    ungraded_in_this_cat = [u for u in ungraded if u.category_id == cat.id]

    if ungraded_in_other_cats:
        return _respond_scenarios(
            target_pct=target_pct,
            target_display=target_display,
            entries=entries,
            cats=cats,
            bands=bands,
            mentioned_entry_id=(
                ungraded_in_this_cat[0].id if ungraded_in_this_cat else None
            ),
            target_entry_name=cat.name,
        )

    result = gm.predict_category_needed(
        target_pct=target_pct,
        target_category_id=cat.id,
        entries=entries,
        categories=cats,
    )
    return PredictResponse(
        kind="needed_on_category",
        answer=result.needed_pct,
        letter=None,
        reachable=result.reachable,
        already_locked_in=result.already_locked_in,
        target=target_display,
        target_pct=target_pct,
        target_category_name=cat.name,
        explanation=result.explanation,
    )


def _respond_scenarios(
    *,
    target_pct: float,
    target_display: str | None,
    entries: list[gm.EntryInput],
    cats: list[gm.CategoryInput],
    bands: list[gm.ScaleBand],
    mentioned_entry_id: int | None,
    target_entry_name: str | None,
) -> PredictResponse:
    """Multi-item scenarios. Degrades gracefully when the course doesn't have
    2+ ungraded items:

    - 0 ungraded → the class is over; return a current-grade response with a
      reachability verdict against the requested target.
    - 1 ungraded → single-entry prediction on that one item (whether the user
      named it or not).
    - 2+ ungraded → the actual scenarios table.
    """
    scenarios, anchor_entries, solve_entries = gm.anchor_scenarios(
        target_pct=target_pct,
        entries=entries,
        categories=cats,
        bands=bands,
        mentioned_entry_id=mentioned_entry_id,
    )
    if scenarios:
        anchor_display = ", ".join(e.name for e in anchor_entries) or "the next item"
        solve_display = ", ".join(e.name for e in solve_entries) or "the rest"
        explanation = (
            f"You still have multiple items ahead ({anchor_display} + "
            f"{solve_display}). Each scenario below is one viable path to "
            f"{_fmt_target(target_display, target_pct)}."
        )
        return PredictResponse(
            kind="scenarios",
            answer=None,
            letter=None,
            reachable=None,
            already_locked_in=None,
            target=target_display,
            target_pct=target_pct,
            target_entry_name=target_entry_name,
            explanation=explanation,
            scenarios=_serialize_scenarios(scenarios),
        )

    # 0 or 1 ungraded — fall through to a sensible single-answer.
    ungraded = gm.list_ungraded_entries(entries, cats)
    if not ungraded:
        cg = gm.compute_current_grade(entries, cats, bands)
        current_pct = cg.percentage or 0.0
        reached = current_pct + 1e-6 >= target_pct
        verdict = (
            f"That's at or above the {_fmt_target(target_display, target_pct)} "
            "threshold — you made it."
            if reached
            else f"That's below the {_fmt_target(target_display, target_pct)} "
            "threshold, and the class is over."
        )
        return PredictResponse(
            kind="current_grade",
            answer=cg.percentage,
            letter=cg.letter,
            current_pct=cg.percentage,
            current_letter=cg.letter,
            reachable=reached,
            already_locked_in=reached,
            target=target_display,
            target_pct=target_pct,
            explanation=(
                f"Your final grade is {_fmt_num(current_pct)}%"
                + (f" ({cg.letter})" if cg.letter else "")
                + f". {verdict}"
            ),
        )

    # Exactly one ungraded entry remains → solve for it directly.
    only = ungraded[0]
    return _respond_needed_on_entry(
        entry=only,
        target_pct=target_pct,
        target_display=target_display,
        entries=entries,
        cats=cats,
        bands=bands,
    )


# --- utilities -------------------------------------------------------------


def _resolve_target_spec(
    spec: TargetSpec | None, bands: list[gm.ScaleBand]
) -> float | None:
    if spec is None:
        return None
    if spec.kind == "pct":
        try:
            return float(spec.value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
    if spec.kind == "letter":
        if spec.value is None:
            return None
        return gm.resolve_target(str(spec.value), bands)
    if spec.kind == "passing":
        return gm.resolve_passing_pct(bands)
    return None


def _target_display(spec: TargetSpec | None) -> str | None:
    if spec is None:
        return None
    if spec.kind == "letter":
        return str(spec.value) if spec.value is not None else None
    if spec.kind == "pct":
        try:
            return _fmt_num(float(spec.value))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
    if spec.kind == "passing":
        return "passing"
    return None


def _fmt_target(target_display: str | None, target_pct: float) -> str:
    if target_display is None:
        return f"{_fmt_num(target_pct)}%"
    # If display is already numeric-looking, just show it once.
    if target_display.replace(".", "").isdigit():
        return f"{_fmt_num(target_pct)}%"
    if target_display == "passing":
        return f"passing ({_fmt_num(target_pct)}%)"
    return f"{target_display} ({_fmt_num(target_pct)}%)"


def _fmt_num(n: float) -> str:
    r = round(n, 2)
    if r == int(r):
        return str(int(r))
    return f"{r:g}"


def _find_entry(
    entries: list[gm.EntryInput], name: str
) -> gm.EntryInput | None:
    return next((e for e in entries if e.name == name), None)


def _find_category(
    cats: list[gm.CategoryInput], name: str
) -> gm.CategoryInput | None:
    return next((c for c in cats if c.name == name), None)


def _prepend_prefix(prefix: str, body: str) -> str:
    p = prefix.strip()
    if not p:
        return body
    # Strip trailing colons/semicolons (Claude sometimes ends the prefix
    # with ":" as if leading into a list) and end with a full stop.
    p = p.rstrip(":;,")
    if not p.endswith((".", "!", "?")):
        p += "."
    return f"{p} {body}"


def _unknown_response(hint: str | None = None) -> PredictResponse:
    return PredictResponse(
        kind="unknown",
        answer=None,
        letter=None,
        reachable=None,
        already_locked_in=None,
        target=None,
        explanation=(
            hint
            or (
                "I couldn't understand that. Try 'what do I need on the final "
                "to get an A?' or 'what's my grade?'."
            )
        ),
    )
