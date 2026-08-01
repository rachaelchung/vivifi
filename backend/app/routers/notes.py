"""CourseNote CRUD.

The Notes tab in the Course Detail view is **conditional** on there being at
least one note. The frontend hides the tab when this endpoint returns an
empty list.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import CourseNote, User
from app.routers._common import get_owned_course
from app.schemas.note import CourseNoteCreate, CourseNoteRead, CourseNoteUpdate

router = APIRouter(prefix="/courses/{course_slug}/notes", tags=["notes"])


@router.get("", response_model=list[CourseNoteRead])
def list_notes(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CourseNoteRead]:
    course = get_owned_course(db, course_slug, current_user)
    rows = db.execute(
        select(CourseNote)
        .where(CourseNote.course_id == course.id)
        .order_by(CourseNote.created_at.asc(), CourseNote.id.asc())
    ).scalars().all()
    return [CourseNoteRead.model_validate(row) for row in rows]


@router.post(
    "", response_model=CourseNoteRead, status_code=status.HTTP_201_CREATED
)
def create_note(
    course_slug: str,
    payload: CourseNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CourseNoteRead:
    course = get_owned_course(db, course_slug, current_user)
    row = CourseNote(
        course_id=course.id,
        heading=payload.heading.strip(),
        body=payload.body,
        source="manual",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CourseNoteRead.model_validate(row)


def _get_owned_note(
    db: Session, course_slug: str, note_id: int, user: User
) -> CourseNote:
    course = get_owned_course(db, course_slug, user)
    row = db.execute(
        select(CourseNote).where(
            CourseNote.id == note_id,
            CourseNote.course_id == course.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Note not found."
        )
    return row


@router.patch("/{note_id}", response_model=CourseNoteRead)
def update_note(
    course_slug: str,
    note_id: int,
    payload: CourseNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CourseNoteRead:
    row = _get_owned_note(db, course_slug, note_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    if "heading" in data and data["heading"] is not None:
        row.heading = data["heading"].strip()
    if "body" in data and data["body"] is not None:
        row.body = data["body"]
    db.commit()
    db.refresh(row)
    return CourseNoteRead.model_validate(row)


@router.delete(
    "/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_note(
    course_slug: str,
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_owned_note(db, course_slug, note_id, current_user)
    db.delete(row)
    db.commit()
