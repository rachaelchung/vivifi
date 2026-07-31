"""Syllabus ingestion pipeline.

Two responsibilities live here:

1. `extract_pdf_text` — pull raw text out of an uploaded PDF using pdfplumber.
   The result is held in memory only; the SPEC forbids persisting raw syllabus
   text past commit.

2. `extract_syllabus` — hand raw text (or paste-text input) to Claude and
   parse a structured `SyllabusExtraction` out of the response. The prompt
   encodes every extraction rule from SPEC §Syllabus Ingestion Pipeline
   (exam-vs-assignment classification, recurring expansion, boilerplate
   filter, default-Overall fallback, English translation, verbatim
   office-hour locations).
"""

from __future__ import annotations

import io
import json
import logging
import re
from datetime import date
from typing import Any

import pdfplumber
from anthropic import Anthropic
from pydantic import ValidationError

from app.config import get_settings
from app.schemas.syllabus import SyllabusExtraction

logger = logging.getLogger(__name__)


class SyllabusIngestError(Exception):
    """Raised when the ingestion pipeline can't produce a valid extraction.

    Includes a human-readable message that surfaces to the client.
    """


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Return the concatenated text of every page in the PDF.

    pdfplumber can fail (or return empty text) on scanned images with no OCR;
    that scenario is what the "incomplete extraction" banner is for on the
    review screen. We do not do OCR in MVP.
    """
    pages_text: list[str] = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    pages_text.append(page_text)
    except Exception as exc:
        logger.exception("pdfplumber failed to open uploaded PDF")
        raise SyllabusIngestError(
            "That PDF couldn't be read. If it's a scan, try the paste-text option."
        ) from exc

    return "\n\n".join(pages_text).strip()


_SYSTEM_PROMPT = """You are Vivifi's syllabus parser. Read the syllabus text a
student uploaded and return a single JSON object matching the schema below.

Rules you MUST follow:

1. Return ONLY a JSON object. No prose, no code fence, no leading or trailing
   text. The very first character of your response must be `{` and the very
   last character must be `}`.

2. For `assignments[].kind`, use "exam" when the syllabus uses words like
   exam, midterm, final, test, or quiz. Otherwise use "assignment".

3. **Expand recurring assignments.** If the syllabus specifies a recurring item
   ("weekly reading responses due every Sunday", "biweekly problem sets on
   Fridays") AND the semester's start_date and end_date are both provided in
   the context, expand the range into concrete-dated rows (e.g. 14 rows for a
   weekly item over 14 weeks, each with the same points_possible and
   category_name). If the semester dates are missing, return a SINGLE row with
   `due_date: null` and a name that hints at the recurrence (e.g. "Weekly
   reading response (recurring — set dates manually)").

4. **Default grade category fallback.** If the syllabus states no grade
   weightings at all (e.g. "grades based on effort, quizzes, and participation"
   without percentages), return exactly:
       "grade_categories": [{"name": "Overall", "weight_pct": 100,
                             "drop_lowest_n": 0}]
   and set every assignment's category_name to "Overall".

5. For `office_hours[].location`, preserve exactly what the syllabus states:
   a room ("GHC 5219"), a Zoom URL ("https://cmu.zoom.us/j/12345"), or a
   hybrid ("GHC 5219 + zoom.us/j/12345"). Do NOT paraphrase or shorten URLs.
   If a host has a persistent personal Zoom link mentioned once alongside
   their name, put that URL on that host's `zoom_link` (in
   office_hour_hosts[]) rather than repeating it on every block.

6. Every `office_hours[].host_name` MUST exactly match one of the `name`
   values in `office_hour_hosts[]`. If you name a host on a block, add them
   to the roster.

7. For `notes`, **skip generic university boilerplate**: Title IX statements,
   generic academic integrity language, disability accommodations sections,
   drop/withdraw deadlines, and any content that would appear identically
   across most syllabi at the school. **Only include course-specific content**
   the instructor is emphasizing: unusual late-work policy, particular
   attendance rules, laptop/phone rules, communication expectations, unique
   exam structure, required non-textbook materials, etc. If nothing
   course-specific is worth surfacing, return an empty `notes` array.

   **Be concise:**
   - `heading`: 2–5 words, title-case, no trailing punctuation.
   - `body`: 1–2 short sentences, ~200 characters max. Paraphrase in your
     own words rather than quoting the syllabus verbatim. Preserve concrete
     numbers, deadlines, thresholds, and product/tool names exactly as the
     syllabus states them.
   - Prefer fewer high-signal notes over many verbose ones. When in doubt,
     leave a note out.

8. If the syllabus does not state a grading scale, return an empty
   `grading_scale` array — the frontend will fall back to a standard 10-point
   scale that the user can edit.

9. Category weights should sum to 100 when the syllabus states them
   explicitly. If they don't sum to 100 in the source, return the numbers as
   written and let the user reconcile on the review screen.

10. All output text is in English. If the syllabus is in another language,
    translate values to English while preserving proper nouns, room codes,
    URLs, and course codes verbatim.

11. `day_of_week` is 0-indexed with Monday = 0 and Sunday = 6.

12. All times (`start_time`, `end_time`) are strings in 24-hour "HH:MM"
    format. Convert "2:30pm" to "14:30".

Schema:

{
  "course": {
    "name": string,
    "code": string | null,
    "instructor_name": string | null,
    "instructor_email": string | null
  },
  "grade_categories": [
    {"name": string, "weight_pct": number, "drop_lowest_n": number}
  ],
  "grading_scale": [
    {"letter": string, "min_pct": number}
  ],
  "assignments": [
    {"name": string, "kind": "assignment"|"exam",
     "due_date": "YYYY-MM-DD" | null,
     "category_name": string | null,
     "points_possible": number}
  ],
  "office_hour_hosts": [
    {"name": string, "role": "Professor"|"TA"|"Learning Assistant",
     "email": string | null, "zoom_link": string | null}
  ],
  "office_hours": [
    {"day_of_week": 0-6, "start_time": "HH:MM", "end_time": "HH:MM",
     "location": string | null, "host_name": string}
  ],
  "class_meetings": [
    {"day_of_week": 0-6, "start_time": "HH:MM", "end_time": "HH:MM",
     "location": string | null}
  ],
  "notes": [
    {"heading": string, "body": string}
  ]
}
"""


def _build_user_message(
    raw_text: str, semester_start: date | None, semester_end: date | None
) -> str:
    context_lines: list[str] = []
    if semester_start:
        context_lines.append(f"Semester start_date: {semester_start.isoformat()}")
    if semester_end:
        context_lines.append(f"Semester end_date: {semester_end.isoformat()}")
    if not context_lines:
        context_lines.append(
            "Semester dates: unknown — for any recurring items, follow rule 3."
        )

    context = "\n".join(context_lines)
    return (
        f"CONTEXT:\n{context}\n\n"
        f"SYLLABUS TEXT (verbatim):\n<<<\n{raw_text}\n>>>\n\n"
        "Return the JSON now."
    )


# Grab the first balanced JSON object anywhere in Claude's response. Belt and
# suspenders for the "only JSON, please" prompt.
_JSON_OBJECT_RE = re.compile(r"\{[\s\S]*\}")


def _parse_claude_json(raw: str) -> dict[str, Any]:
    """Extract and parse the JSON object from Claude's response."""
    stripped = raw.strip()
    if stripped.startswith("```"):
        # tolerate ```json ... ``` fences
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)

    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        match = _JSON_OBJECT_RE.search(stripped)
        if match is None:
            raise SyllabusIngestError(
                "The AI returned something we couldn't parse. Try uploading again."
            )
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise SyllabusIngestError(
                "The AI returned malformed JSON. Try uploading again."
            ) from exc


def extract_syllabus(
    raw_text: str,
    *,
    semester_start: date | None,
    semester_end: date | None,
    course_name_hint: str | None = None,
) -> SyllabusExtraction:
    """Call Claude and return a validated `SyllabusExtraction`.

    Raises `SyllabusIngestError` on failure — the router turns that into a
    user-visible HTTP error.
    """
    if not raw_text.strip():
        raise SyllabusIngestError(
            "No readable text found in that syllabus. If it's a scan, try "
            "pasting the text instead."
        )

    settings = get_settings()
    if not settings.anthropic_api_key:
        raise SyllabusIngestError(
            "Syllabus extraction is not configured yet — the server is missing "
            "an ANTHROPIC_API_KEY."
        )

    client = Anthropic(api_key=settings.anthropic_api_key)

    hint_line = (
        f"The student named this course '{course_name_hint}'. Prefer that if "
        "the syllabus header is ambiguous.\n\n"
        if course_name_hint
        else ""
    )
    user_message = hint_line + _build_user_message(
        raw_text, semester_start, semester_end
    )

    try:
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=8192,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
    except Exception as exc:
        logger.exception("Anthropic call failed")
        raise SyllabusIngestError(
            "The AI extraction service returned an error. Try again in a moment."
        ) from exc

    # The v1 messages API returns a list of content blocks; join text ones.
    text_parts: list[str] = []
    for block in response.content:
        block_type = getattr(block, "type", None)
        if block_type == "text":
            text_parts.append(getattr(block, "text", ""))

    combined = "".join(text_parts).strip()
    if not combined:
        raise SyllabusIngestError("The AI returned an empty response. Try again.")

    parsed = _parse_claude_json(combined)

    try:
        return SyllabusExtraction.model_validate(parsed)
    except ValidationError as exc:
        logger.warning("Claude returned JSON that failed schema validation: %s", exc)
        raise SyllabusIngestError(
            "The AI's response didn't match the expected shape. Try again — "
            "or paste the syllabus text if this keeps happening."
        ) from exc


def looks_incomplete(extraction: SyllabusExtraction) -> bool:
    """Heuristic for the review screen's "this looks incomplete" banner.

    SPEC: "fewer than 3 assignments and empty office hours" is a strong signal
    the PDF was a scan or the extraction went sideways.
    """
    return len(extraction.assignments) < 3 and len(extraction.office_hours) == 0
