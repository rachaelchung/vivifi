"""Gradebook entry CRUD (the "gradebook" half of the split model).

Entering / editing a grade here **does not** touch the paired `Assignment`
(SPEC lifecycle rules). Manual entries — for attendance, participation, extra
credit — are created here without a paired assignment.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import GradebookEntry, GradeCategory, User
from app.routers._common import get_owned_course
from app.schemas.grade import (
    GradebookEntryCreate,
    GradebookEntryRead,
    GradebookEntryUpdate,
)

router = APIRouter(
    prefix="/courses/{course_slug}/gradebook-entries", tags=["gradebook"]
)


def _verify_category(db: Session, course_id: int, category_id: int | None) -> None:
    if category_id is None:
        return
    row = db.execute(
        select(GradeCategory).where(
            GradeCategory.id == category_id,
            GradeCategory.course_id == course_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Category not found on this course.",
        )


@router.get("", response_model=list[GradebookEntryRead])
def list_gradebook_entries(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GradebookEntryRead]:
    course = get_owned_course(db, course_slug, current_user)
    rows = db.execute(
        select(GradebookEntry)
        .where(GradebookEntry.course_id == course.id)
        .order_by(GradebookEntry.created_at.asc(), GradebookEntry.id.asc())
    ).scalars().all()
    return [GradebookEntryRead.model_validate(row) for row in rows]


@router.post(
    "",
    response_model=GradebookEntryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_gradebook_entry(
    course_slug: str,
    payload: GradebookEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GradebookEntryRead:
    course = get_owned_course(db, course_slug, current_user)
    _verify_category(db, course.id, payload.category_id)
    row = GradebookEntry(
        course_id=course.id,
        category_id=payload.category_id,
        name=payload.name.strip(),
        points_possible=payload.points_possible,
        points_earned=payload.points_earned,
        source="manual",
        hidden=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return GradebookEntryRead.model_validate(row)


def _get_owned_entry(
    db: Session, course_slug: str, entry_slug: str, user: User
) -> GradebookEntry:
    course = get_owned_course(db, course_slug, user)
    row = db.execute(
        select(GradebookEntry).where(
            GradebookEntry.slug == entry_slug,
            GradebookEntry.course_id == course.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gradebook entry not found.",
        )
    return row


@router.patch("/{entry_slug}", response_model=GradebookEntryRead)
def update_gradebook_entry(
    course_slug: str,
    entry_slug: str,
    payload: GradebookEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GradebookEntryRead:
    row = _get_owned_entry(db, course_slug, entry_slug, current_user)
    data = payload.model_dump(exclude_unset=True)

    if "category_id" in data:
        _verify_category(db, row.course_id, data["category_id"])
        row.category_id = data["category_id"]
    if "name" in data and data["name"] is not None:
        row.name = data["name"].strip()
    if "points_earned" in data:
        # Explicit null clears the grade — that's a valid operation
        # (user typed something in, wants to un-grade it).
        row.points_earned = data["points_earned"]
    if "points_possible" in data and data["points_possible"] is not None:
        row.points_possible = data["points_possible"]
    if "hidden" in data and data["hidden"] is not None:
        row.hidden = data["hidden"]

    db.commit()
    db.refresh(row)
    return GradebookEntryRead.model_validate(row)


@router.delete(
    "/{entry_slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_gradebook_entry(
    course_slug: str,
    entry_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a gradebook entry.

    SPEC lifecycle: deleting a gradebook entry has **no side effect** on the
    linked assignment. The task item stays on the schedule and the calendar.
    """
    row = _get_owned_entry(db, course_slug, entry_slug, current_user)
    db.delete(row)
    db.commit()
