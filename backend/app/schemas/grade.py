"""Pydantic schemas for grade-related entities.

Covers:
- `GradeCategory` (weight bucket)
- `GradeScaleBand` (letter cutoffs — replace-all list, not individual CRUD)
- `GradebookEntry` (graded items — the "gradebook" side of the split model)
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --- GradeCategory ---------------------------------------------------------


class GradeCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    weight_pct: float = Field(ge=0, le=100)
    drop_lowest_n: int = Field(default=0, ge=0)


class GradeCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    weight_pct: float | None = Field(default=None, ge=0, le=100)
    drop_lowest_n: int | None = Field(default=None, ge=0)


class GradeCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    weight_pct: float
    drop_lowest_n: int


# --- GradeScaleBand --------------------------------------------------------
# There's no per-band CRUD; the whole scale is replaced atomically via PUT.


class GradeScaleBandInput(BaseModel):
    letter: str = Field(min_length=1, max_length=8)
    min_pct: float = Field(ge=0, le=100)


class GradeScaleReplace(BaseModel):
    bands: list[GradeScaleBandInput] = Field(default_factory=list)


class GradeScaleBandRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    letter: str
    min_pct: float


# --- GradebookEntry --------------------------------------------------------


class GradebookEntryCreate(BaseModel):
    """Payload for creating a **manual** gradebook entry.

    Manual entries can exist without a paired Assignment (attendance,
    participation, extra credit rows). Set `points_earned` right away or leave
    it null and edit later.
    """

    name: str = Field(min_length=1, max_length=200)
    category_id: int | None = None
    points_possible: float = Field(ge=0)
    points_earned: float | None = Field(default=None, ge=0)


class GradebookEntryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category_id: int | None = None
    # `points_earned` uses a sentinel for "clear the grade" — explicit null.
    # `exclude_unset` in the router distinguishes "not provided" from "cleared".
    points_earned: float | None = None
    points_possible: float | None = Field(default=None, ge=0)
    hidden: bool | None = None


class GradebookEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    category_id: int | None
    points_earned: float | None
    points_possible: float
    source: str
    source_assignment_id: int | None
    hidden: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("points_earned", mode="before")
    @classmethod
    def _keep_none(cls, v: object) -> object:
        return v
