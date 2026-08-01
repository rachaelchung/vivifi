"""Pydantic schemas for `OfficeHourHost` and `OfficeHour`."""

from __future__ import annotations

from datetime import time
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

HostRole = Literal["Professor", "TA", "Learning Assistant"]


def _coerce_hhmm(v: object) -> object:
    """Accept 'HH:MM' or 'HH:MM:SS'; also let already-parsed times through.

    Same coercion as the syllabus schema — the API is consistent about wire
    format for times.
    """
    if isinstance(v, str):
        parts = v.strip().split(":")
        if len(parts) not in (2, 3):
            raise ValueError("time must be HH:MM")
        h = int(parts[0])
        m = int(parts[1])
        s = int(parts[2]) if len(parts) == 3 else 0
        return time(h, m, s)
    return v


# --- OfficeHourHost -------------------------------------------------------


class OfficeHourHostCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: HostRole = "Professor"
    email: EmailStr | None = None
    zoom_link: str | None = Field(default=None, max_length=500)
    notes: str | None = None


class OfficeHourHostUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role: HostRole | None = None
    email: EmailStr | None = None
    zoom_link: str | None = Field(default=None, max_length=500)
    notes: str | None = None


class OfficeHourHostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    role: HostRole
    email: str | None
    zoom_link: str | None
    notes: str | None


# --- OfficeHour -----------------------------------------------------------


class OfficeHourCreate(BaseModel):
    host_id: int
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    location: str | None = Field(default=None, max_length=500)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _parse_hhmm(cls, v: object) -> object:
        return _coerce_hhmm(v)

    @model_validator(mode="after")
    def _end_after_start(self) -> "OfficeHourCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class OfficeHourUpdate(BaseModel):
    host_id: int | None = None
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


class OfficeHourRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    host_id: int
    day_of_week: int
    start_time: time
    end_time: time
    location: str | None
