"""Shared helpers for course-scoped routers.

Every one of the M3 CRUD routers is nested under `/courses/{slug}/…`. Doing
ownership checks in one place means the pattern is impossible to forget
(SPEC §API & Backend — user-scoping enforcement).
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Course, Semester, User


def get_owned_course(db: Session, slug: str, user: User) -> Course:
    """Return the course with `slug` owned by `user`, or raise 404.

    404 is deliberate: leaking existence (403 vs 404) is a minor info-disclosure
    channel. Users who don't own a course shouldn't be able to distinguish
    "doesn't exist" from "not yours".
    """
    course = db.execute(
        select(Course)
        .join(Semester, Course.semester_id == Semester.id)
        .where(Course.slug == slug, Semester.user_id == user.id)
    ).scalar_one_or_none()
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found."
        )
    return course
