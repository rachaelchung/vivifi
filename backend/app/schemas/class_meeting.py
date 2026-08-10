"""Pydantic schemas for the `ClassMeeting` entity."""

from __future__ import annotations

from datetime import time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ClassMeetingKind = Literal[
    "lecture", "recitation", "lab", "seminar", "other"
]


def _coerce_hhmm(v: object) -> object:
    if isinstance(v, str):
        parts = v.strip().split(":")
        if len(parts) not in (2, 3):
            raise ValueError("time must be HH:MM")
        h = int(parts[0])
        m = int(parts[1])
        s = int(parts[2]) if len(parts) == 3 else 0
        return time(h, m, s)
    return v


class ClassMeetingCreate(BaseModel):
    kind: ClassMeetingKind = "lecture"
    section: str | None = Field(default=None, max_length=120)
    is_mine: bool = True
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    location: str | None = Field(default=None, max_length=500)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _parse_hhmm(cls, v: object) -> object:
        return _coerce_hhmm(v)

    @field_validator("section", "location", mode="before")
    @classmethod
    def _empty_to_none(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @model_validator(mode="after")
    def _end_after_start(self) -> "ClassMeetingCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ClassMeetingUpdate(BaseModel):
    kind: ClassMeetingKind | None = None
    section: str | None = Field(default=None, max_length=120)
    is_mine: bool | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    end_time: time | None = None
    location: str | None = Field(default=None, max_length=500)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _parse_hhmm(cls, v: object) -> object:
        if v is None:
            return v
        return _coerce_hhmm(v)

    @field_validator("section", "location", mode="before")
    @classmethod
    def _empty_to_none(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return None
        return v


class ClassMeetingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: ClassMeetingKind
    section: str | None
    is_mine: bool
    day_of_week: int
    start_time: time
    end_time: time
    location: str | None
