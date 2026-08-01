"""Pydantic schemas for the `CourseNote` entity."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CourseNoteCreate(BaseModel):
    heading: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class CourseNoteUpdate(BaseModel):
    heading: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, min_length=1)


class CourseNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    heading: str
    body: str
    source: str
    created_at: datetime
    updated_at: datetime
