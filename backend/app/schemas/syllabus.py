"""Pydantic schemas for the syllabus ingestion pipeline.

The `SyllabusExtraction` shape is used both:
- as the response of `POST /courses/{slug}/syllabus` (Claude's parse of the raw
  syllabus), and
- as the request body of `POST /courses/{slug}/syllabus/commit` (what the user
  confirmed on the Syllabus Review screen).

Keeping one shape for both directions means the review screen is a pure
edit-in-place experience: same JSON in, same JSON out.
"""

from __future__ import annotations

from datetime import date, time
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class ExtractedCourseMeta(BaseModel):
    name: str = Field(default="", max_length=200)
    code: str | None = Field(default=None, max_length=40)
    instructor_name: str | None = Field(default=None, max_length=200)
    instructor_email: EmailStr | None = None

    @field_validator("code", "instructor_name", mode="before")
    @classmethod
    def _empty_to_none(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return None
        return v


class ExtractedGradeCategory(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    weight_pct: float = Field(ge=0, le=100)
    drop_lowest_n: int = Field(default=0, ge=0)


class ExtractedGradeScaleBand(BaseModel):
    letter: str = Field(min_length=1, max_length=8)
    min_pct: float = Field(ge=0, le=100)


AssignmentKind = Literal["assignment", "exam"]


class ExtractedAssignment(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: AssignmentKind = "assignment"
    due_date: date | None = None
    category_name: str | None = Field(default=None, max_length=120)
    points_possible: float = Field(default=100.0, ge=0)

    @field_validator("category_name", mode="before")
    @classmethod
    def _empty_to_none(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return None
        return v


HostRole = Literal["Professor", "TA", "Learning Assistant"]


def _coerce_hhmm(v: object) -> object:
    """Claude returns 'HH:MM' strings per the SPEC schema; also accept
    'HH:MM:SS' or an already-parsed time."""
    if isinstance(v, str):
        parts = v.strip().split(":")
        if len(parts) not in (2, 3):
            raise ValueError("time must be HH:MM")
        h = int(parts[0])
        m = int(parts[1])
        s = int(parts[2]) if len(parts) == 3 else 0
        return time(h, m, s)
    return v


class ExtractedOfficeHourHost(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: HostRole = "Professor"
    email: EmailStr | None = None
    zoom_link: str | None = Field(default=None, max_length=500)


class ExtractedOfficeHour(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    location: str | None = Field(default=None, max_length=500)
    host_name: str = Field(min_length=1, max_length=200)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _parse_hhmm(cls, v: object) -> object:
        return _coerce_hhmm(v)

    @model_validator(mode="after")
    def _end_after_start(self) -> "ExtractedOfficeHour":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


ClassMeetingKind = Literal[
    "lecture", "recitation", "lab", "seminar", "other"
]


class ExtractedClassMeeting(BaseModel):
    kind: ClassMeetingKind = "lecture"
    section: str | None = Field(default=None, max_length=120)
    is_mine: bool = False
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    location: str | None = Field(default=None, max_length=500)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _parse_hhmm(cls, v: object) -> object:
        return _coerce_hhmm(v)

    @field_validator("section", mode="before")
    @classmethod
    def _empty_section_to_none(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @model_validator(mode="after")
    def _end_after_start(self) -> "ExtractedClassMeeting":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ExtractedNote(BaseModel):
    heading: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


MaterialKind = Literal["textbook", "book", "other"]
MaterialRequirement = Literal["required", "recommended"]


class ExtractedMaterial(BaseModel):
    kind: MaterialKind = "textbook"
    title: str = Field(min_length=1, max_length=300)
    authors: str | None = Field(default=None, max_length=500)
    edition: str | None = Field(default=None, max_length=120)
    isbn: str | None = Field(default=None, max_length=32)
    publisher: str | None = Field(default=None, max_length=200)
    year: int | None = Field(default=None, ge=1000, le=2100)
    url: str | None = Field(default=None, max_length=500)
    requirement: MaterialRequirement = "required"
    notes: str | None = None

    @field_validator(
        "authors", "edition", "isbn", "publisher", "url", "notes", mode="before"
    )
    @classmethod
    def _empty_to_none(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return None
        return v


class SyllabusExtraction(BaseModel):
    """Full extraction / commit payload. See SPEC §Syllabus Ingestion Pipeline."""

    course: ExtractedCourseMeta
    grade_categories: list[ExtractedGradeCategory] = Field(default_factory=list)
    grading_scale: list[ExtractedGradeScaleBand] = Field(default_factory=list)
    assignments: list[ExtractedAssignment] = Field(default_factory=list)
    office_hour_hosts: list[ExtractedOfficeHourHost] = Field(default_factory=list)
    office_hours: list[ExtractedOfficeHour] = Field(default_factory=list)
    class_meetings: list[ExtractedClassMeeting] = Field(default_factory=list)
    materials: list[ExtractedMaterial] = Field(default_factory=list)
    notes: list[ExtractedNote] = Field(default_factory=list)


class SyllabusExtractRequest(BaseModel):
    """Body for the JSON variant of POST /courses/{slug}/syllabus (paste-text)."""

    text: str = Field(min_length=1)


class SyllabusExtractResponse(BaseModel):
    """Response of POST /courses/{slug}/syllabus.

    Includes both the extraction and heuristic flags the review screen uses to
    render banners (incomplete extraction, no assignments found).
    """

    extraction: SyllabusExtraction
    looks_incomplete: bool
    has_no_assignments: bool
