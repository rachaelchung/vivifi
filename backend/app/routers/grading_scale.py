"""Grading-scale management.

Only two endpoints per SPEC: GET the current bands, PUT replaces the whole
list atomically. Replace-all is simpler for the UI (editing the scale is a
whole-form operation, not per-row) and avoids the "one band edited, others
still stale" class of bugs.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import GradeScaleBand, User
from app.routers._common import get_owned_course
from app.schemas.grade import GradeScaleBandRead, GradeScaleReplace

router = APIRouter(
    prefix="/courses/{course_slug}/grading-scale", tags=["grading-scale"]
)


@router.get("", response_model=list[GradeScaleBandRead])
def get_grading_scale(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GradeScaleBandRead]:
    course = get_owned_course(db, course_slug, current_user)
    rows = db.execute(
        select(GradeScaleBand)
        .where(GradeScaleBand.course_id == course.id)
        .order_by(GradeScaleBand.min_pct.desc())
    ).scalars().all()
    return [GradeScaleBandRead.model_validate(row) for row in rows]


@router.put(
    "", response_model=list[GradeScaleBandRead], status_code=status.HTTP_200_OK
)
def replace_grading_scale(
    course_slug: str,
    payload: GradeScaleReplace,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GradeScaleBandRead]:
    course = get_owned_course(db, course_slug, current_user)

    # Delete existing bands and insert the new list, all in one transaction.
    existing = db.execute(
        select(GradeScaleBand).where(GradeScaleBand.course_id == course.id)
    ).scalars().all()
    for row in existing:
        db.delete(row)
    db.flush()

    new_rows = [
        GradeScaleBand(
            course_id=course.id,
            letter=b.letter.strip(),
            min_pct=b.min_pct,
        )
        for b in payload.bands
    ]
    for row in new_rows:
        db.add(row)
    db.commit()

    fresh = db.execute(
        select(GradeScaleBand)
        .where(GradeScaleBand.course_id == course.id)
        .order_by(GradeScaleBand.min_pct.desc())
    ).scalars().all()
    return [GradeScaleBandRead.model_validate(row) for row in fresh]
