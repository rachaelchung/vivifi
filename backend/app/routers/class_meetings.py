"""ClassMeeting CRUD.

Used by the Course Detail Meetings tab and the cross-course Week Schedule.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import ClassMeeting, User
from app.routers._common import get_owned_course
from app.schemas.class_meeting import (
    ClassMeetingCreate,
    ClassMeetingRead,
    ClassMeetingUpdate,
)

router = APIRouter(
    prefix="/courses/{course_slug}/class-meetings", tags=["class-meetings"]
)

_KIND_ORDER = {
    "lecture": 0,
    "recitation": 1,
    "lab": 2,
    "seminar": 3,
    "other": 4,
}


@router.get("", response_model=list[ClassMeetingRead])
def list_class_meetings(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ClassMeetingRead]:
    course = get_owned_course(db, course_slug, current_user)
    rows = db.execute(
        select(ClassMeeting).where(ClassMeeting.course_id == course.id)
    ).scalars().all()
    rows = sorted(
        rows,
        key=lambda r: (
            _KIND_ORDER.get(r.kind, 99),
            0 if r.is_mine else 1,
            r.day_of_week,
            r.start_time,
            r.id,
        ),
    )
    return [ClassMeetingRead.model_validate(row) for row in rows]


@router.post(
    "", response_model=ClassMeetingRead, status_code=status.HTTP_201_CREATED
)
def create_class_meeting(
    course_slug: str,
    payload: ClassMeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClassMeetingRead:
    course = get_owned_course(db, course_slug, current_user)
    row = ClassMeeting(
        course_id=course.id,
        kind=payload.kind,
        section=payload.section,
        is_mine=payload.is_mine,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        location=payload.location,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ClassMeetingRead.model_validate(row)


def _get_owned_meeting(
    db: Session, course_slug: str, meeting_id: int, user: User
) -> ClassMeeting:
    course = get_owned_course(db, course_slug, user)
    row = db.execute(
        select(ClassMeeting).where(
            ClassMeeting.id == meeting_id,
            ClassMeeting.course_id == course.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class meeting not found.",
        )
    return row


@router.patch("/{meeting_id}", response_model=ClassMeetingRead)
def update_class_meeting(
    course_slug: str,
    meeting_id: int,
    payload: ClassMeetingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClassMeetingRead:
    row = _get_owned_meeting(db, course_slug, meeting_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    # Validate end > start when both would be present after patch.
    start = data.get("start_time", row.start_time)
    end = data.get("end_time", row.end_time)
    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_time must be after start_time",
        )
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return ClassMeetingRead.model_validate(row)


@router.delete(
    "/{meeting_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_class_meeting(
    course_slug: str,
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_owned_meeting(db, course_slug, meeting_id, current_user)
    db.delete(row)
    db.commit()
