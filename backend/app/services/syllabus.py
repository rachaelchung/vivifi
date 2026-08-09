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
   office-hour locations). Before schema validation, multi-instructor email
   dumps are sanitized onto `office_hour_hosts` so EmailStr does not reject
   the payload.
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

7. **Single course-level instructor contact; roster for everyone else.**
   `course.instructor_email` MUST be a single email address or null — never
   a comma-separated list. `course.instructor_name` is a short display string
   for the course card (one name, or joined like "Taylor / Koz" is fine).
   When the syllabus lists multiple instructors / section-dependent professors:
   - Put EVERY instructor on `office_hour_hosts[]` with role "Professor" and
     their own email (one email per host).
   - Set `course.instructor_email` to null (the student will fill in their
     section's contact on the review screen).
   - Do the same for any host `email` field: one address or null, never a list.

8. For `notes`, **skip generic university boilerplate**: Title IX statements,
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

9. If the syllabus does not state a grading scale, return an empty
   `grading_scale` array — the frontend will fall back to a standard 10-point
   scale that the user can edit.

10. Category weights should sum to 100 when the syllabus states them
    explicitly. If they don't sum to 100 in the source, return the numbers as
    written and let the user reconcile on the review screen.

11. All output text is in English. If the syllabus is in another language,
    translate values to English while preserving proper nouns, room codes,
    URLs, and course codes verbatim.

12. `day_of_week` is 0-indexed with Monday = 0 and Sunday = 6.

13. All times (`start_time`, `end_time`) are strings in 24-hour "HH:MM"
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

# Loose email token finder for sanitizing Claude dumps like
# "a@x.edu, b@y.edu" before EmailStr validation.
_EMAIL_TOKEN_RE = re.compile(
    r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"
)

_NAME_SPLIT_RE = re.compile(r"\s*(?:,|/|&|\band\b)\s*", re.IGNORECASE)


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


def _emails_in(value: object) -> list[str]:
    """Pull email-shaped tokens out of a string (order-preserving, unique)."""
    if not isinstance(value, str) or not value.strip():
        return []
    seen: set[str] = set()
    out: list[str] = []
    for match in _EMAIL_TOKEN_RE.findall(value):
        key = match.lower()
        if key not in seen:
            seen.add(key)
            out.append(match)
    return out


def _single_email_or_none(value: object) -> str | None:
    """Return value only when the whole string is exactly one email."""
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None
    emails = _emails_in(stripped)
    if len(emails) == 1 and stripped == emails[0]:
        return emails[0]
    return None


def _split_instructor_names(name: object) -> list[str]:
    """Split a display name that lists multiple people, else [name]."""
    if not isinstance(name, str) or not name.strip():
        return []
    stripped = name.strip()
    parts = [p.strip() for p in _NAME_SPLIT_RE.split(stripped) if p.strip()]
    if len(parts) > 1:
        return parts
    return [stripped]


def _host_emails(hosts: list[Any]) -> set[str]:
    found: set[str] = set()
    for host in hosts:
        if isinstance(host, dict):
            email = host.get("email")
            if isinstance(email, str) and email.strip():
                found.add(email.strip().lower())
    return found


def _ensure_professor_hosts(
    hosts: list[dict[str, Any]],
    emails: list[str],
    names: list[str],
) -> None:
    """Append Professor hosts for emails not already on the roster."""
    existing = _host_emails(hosts)
    for idx, email in enumerate(emails):
        if email.lower() in existing:
            continue
        if idx < len(names):
            host_name = names[idx]
        else:
            host_name = email.split("@", 1)[0]
        hosts.append(
            {
                "name": host_name,
                "role": "Professor",
                "email": email,
                "zoom_link": None,
            }
        )
        existing.add(email.lower())


def sanitize_extraction_dict(parsed: dict[str, Any]) -> dict[str, Any]:
    """Normalize Claude JSON that would otherwise fail EmailStr validation.

    Course-level `instructor_email` and each host `email` must be a single
    address or null. Multi-instructor dumps (comma-separated emails, etc.)
    are moved onto `office_hour_hosts` as Professors, and the course email
    is cleared so the student can set their section contact on review.
    """
    course = parsed.get("course")
    if not isinstance(course, dict):
        course = {}
        parsed["course"] = course

    hosts_raw = parsed.get("office_hour_hosts")
    hosts: list[dict[str, Any]] = (
        [h for h in hosts_raw if isinstance(h, dict)]
        if isinstance(hosts_raw, list)
        else []
    )
    parsed["office_hour_hosts"] = hosts

    # --- course instructor email -------------------------------------------
    course_email_raw = course.get("instructor_email")
    course_emails = _emails_in(course_email_raw)
    single = _single_email_or_none(course_email_raw)

    if single is not None:
        course["instructor_email"] = single
    elif len(course_emails) > 1:
        names = _split_instructor_names(course.get("instructor_name"))
        _ensure_professor_hosts(hosts, course_emails, names)
        course["instructor_email"] = None
        # Keep a readable joined display name when Claude only listed one.
        if len(names) <= 1 and len(course_emails) > 1:
            # Prefer existing name; otherwise join local-parts.
            if not (isinstance(course.get("instructor_name"), str) and course["instructor_name"].strip()):
                course["instructor_name"] = " / ".join(
                    e.split("@", 1)[0] for e in course_emails
                )
    else:
        # Zero or one token that isn't a clean single email (placeholders).
        course["instructor_email"] = None

    # --- host emails (may also be comma-lists) -----------------------------
    expanded: list[dict[str, Any]] = []
    for host in hosts:
        email_raw = host.get("email")
        single_host = _single_email_or_none(email_raw)
        if single_host is not None:
            host["email"] = single_host
            expanded.append(host)
            continue

        host_emails = _emails_in(email_raw)
        if not host_emails:
            host["email"] = None
            expanded.append(host)
            continue

        # First email stays on this host; extras become additional Professors.
        host["email"] = host_emails[0]
        expanded.append(host)
        base_name = host.get("name") if isinstance(host.get("name"), str) else ""
        extra_names = _split_instructor_names(base_name)
        for idx, email in enumerate(host_emails[1:], start=1):
            if email.lower() in _host_emails(expanded):
                continue
            name = (
                extra_names[idx]
                if idx < len(extra_names)
                else email.split("@", 1)[0]
            )
            expanded.append(
                {
                    "name": name,
                    "role": host.get("role") or "Professor",
                    "email": email,
                    "zoom_link": None,
                }
            )

    parsed["office_hour_hosts"] = expanded
    return parsed


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

    parsed = sanitize_extraction_dict(_parse_claude_json(combined))

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
