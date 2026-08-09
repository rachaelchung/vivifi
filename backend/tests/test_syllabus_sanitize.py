"""Unit tests for syllabus extraction sanitization.

Covers the multi-instructor / multi-email dumps that EmailStr would otherwise
reject (e.g. "a@x.edu, b@y.edu" on course.instructor_email).
"""

from __future__ import annotations

from app.schemas.syllabus import SyllabusExtraction
from app.services.syllabus import sanitize_extraction_dict


def _minimal(**overrides: object) -> dict:
    base: dict = {
        "course": {
            "name": "Intro to Systems",
            "code": "15-213",
            "instructor_name": None,
            "instructor_email": None,
        },
        "grade_categories": [{"name": "Overall", "weight_pct": 100, "drop_lowest_n": 0}],
        "grading_scale": [],
        "assignments": [],
        "office_hour_hosts": [],
        "office_hours": [],
        "class_meetings": [],
        "notes": [],
    }
    course_over = overrides.pop("course", None)
    if isinstance(course_over, dict):
        base["course"] = {**base["course"], **course_over}
    base.update(overrides)
    return base


def test_multi_course_emails_move_to_hosts_and_clear_course_email() -> None:
    raw = _minimal(
        course={
            "name": "Intro to Systems",
            "instructor_name": "Matthew Taylor, Koz",
            "instructor_email": "mdtaylor@andrew.cmu.edu, koz@andrew.cmu.edu",
        }
    )
    cleaned = sanitize_extraction_dict(raw)

    assert cleaned["course"]["instructor_email"] is None
    assert cleaned["course"]["instructor_name"] == "Matthew Taylor, Koz"
    hosts = cleaned["office_hour_hosts"]
    assert len(hosts) == 2
    assert hosts[0]["email"] == "mdtaylor@andrew.cmu.edu"
    assert hosts[0]["name"] == "Matthew Taylor"
    assert hosts[0]["role"] == "Professor"
    assert hosts[1]["email"] == "koz@andrew.cmu.edu"
    assert hosts[1]["name"] == "Koz"
    assert hosts[1]["role"] == "Professor"

    SyllabusExtraction.model_validate(cleaned)


def test_single_valid_course_email_preserved() -> None:
    raw = _minimal(
        course={
            "instructor_name": "Prof. Taylor",
            "instructor_email": "mdtaylor@andrew.cmu.edu",
        }
    )
    cleaned = sanitize_extraction_dict(raw)
    assert cleaned["course"]["instructor_email"] == "mdtaylor@andrew.cmu.edu"
    assert cleaned["office_hour_hosts"] == []
    SyllabusExtraction.model_validate(cleaned)


def test_placeholder_course_email_becomes_null() -> None:
    raw = _minimal(course={"instructor_email": "TBD"})
    cleaned = sanitize_extraction_dict(raw)
    assert cleaned["course"]["instructor_email"] is None
    SyllabusExtraction.model_validate(cleaned)


def test_host_comma_list_expands_into_extra_hosts() -> None:
    raw = _minimal(
        office_hour_hosts=[
            {
                "name": "Taylor / Koz",
                "role": "Professor",
                "email": "mdtaylor@andrew.cmu.edu, koz@andrew.cmu.edu",
                "zoom_link": None,
            }
        ]
    )
    cleaned = sanitize_extraction_dict(raw)
    hosts = cleaned["office_hour_hosts"]
    assert len(hosts) == 2
    assert hosts[0]["email"] == "mdtaylor@andrew.cmu.edu"
    assert hosts[1]["email"] == "koz@andrew.cmu.edu"
    assert hosts[1]["role"] == "Professor"
    SyllabusExtraction.model_validate(cleaned)


def test_does_not_duplicate_existing_host_email() -> None:
    raw = _minimal(
        course={
            "instructor_name": "Taylor / Koz",
            "instructor_email": "mdtaylor@andrew.cmu.edu, koz@andrew.cmu.edu",
        },
        office_hour_hosts=[
            {
                "name": "Matthew Taylor",
                "role": "Professor",
                "email": "mdtaylor@andrew.cmu.edu",
                "zoom_link": None,
            }
        ],
    )
    cleaned = sanitize_extraction_dict(raw)
    hosts = cleaned["office_hour_hosts"]
    emails = [h["email"] for h in hosts]
    assert emails.count("mdtaylor@andrew.cmu.edu") == 1
    assert "koz@andrew.cmu.edu" in emails
    SyllabusExtraction.model_validate(cleaned)
