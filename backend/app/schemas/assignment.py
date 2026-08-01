"""Pydantic schemas for the `Assignment` entity (task/schedule side)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AssignmentKind = Literal["assignment", "exam"]


class AssignmentCreate(BaseModel):
    """Payload for creating a **manual** assignment.

    Manual creates don't automatically produce a paired GradebookEntry —
    students may add tasks that aren't graded (readings, prep sessions).
    Grade entries are added separately via the Gradebook tab.
    """

    name: str = Field(min_length=1, max_length=200)
    kind: AssignmentKind = "assignment"
    due_date: date | None = None
    notes: str | None = None


class AssignmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    kind: AssignmentKind | None = None
    # An explicit null is a valid value here (clears the due date), so we rely
    # on `exclude_unset` in the router to distinguish "not provided".
    due_date: date | None = None
    completed: bool | None = None
    notes: str | None = None


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    kind: AssignmentKind
    due_date: date | None
    source: str
    completed: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
