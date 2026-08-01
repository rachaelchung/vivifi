"""Grade-category CRUD.

Nested under `/courses/{course_slug}/categories/…`. The list endpoint is the
one the Gradebook UI hits every time a course loads; keep it ordered so the UI
doesn't need to re-sort.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import GradeCategory, User
from app.routers._common import get_owned_course
from app.schemas.grade import GradeCategoryCreate, GradeCategoryRead, GradeCategoryUpdate

router = APIRouter(prefix="/courses/{course_slug}/categories", tags=["categories"])


@router.get("", response_model=list[GradeCategoryRead])
def list_categories(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GradeCategoryRead]:
    course = get_owned_course(db, course_slug, current_user)
    rows = db.execute(
        select(GradeCategory)
        .where(GradeCategory.course_id == course.id)
        .order_by(GradeCategory.id.asc())
    ).scalars().all()
    return [GradeCategoryRead.model_validate(row) for row in rows]


@router.post(
    "", response_model=GradeCategoryRead, status_code=status.HTTP_201_CREATED
)
def create_category(
    course_slug: str,
    payload: GradeCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GradeCategoryRead:
    course = get_owned_course(db, course_slug, current_user)
    row = GradeCategory(
        course_id=course.id,
        name=payload.name.strip(),
        weight_pct=payload.weight_pct,
        drop_lowest_n=payload.drop_lowest_n,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return GradeCategoryRead.model_validate(row)


def _get_owned_category(
    db: Session, course_slug: str, category_id: int, user: User
) -> GradeCategory:
    course = get_owned_course(db, course_slug, user)
    row = db.execute(
        select(GradeCategory).where(
            GradeCategory.id == category_id,
            GradeCategory.course_id == course.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found."
        )
    return row


@router.patch("/{category_id}", response_model=GradeCategoryRead)
def update_category(
    course_slug: str,
    category_id: int,
    payload: GradeCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GradeCategoryRead:
    row = _get_owned_category(db, course_slug, category_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        row.name = data["name"].strip()
    if "weight_pct" in data and data["weight_pct"] is not None:
        row.weight_pct = data["weight_pct"]
    if "drop_lowest_n" in data and data["drop_lowest_n"] is not None:
        row.drop_lowest_n = data["drop_lowest_n"]
    db.commit()
    db.refresh(row)
    return GradeCategoryRead.model_validate(row)


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_category(
    course_slug: str,
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a category. Linked gradebook entries stay (with `category_id`
    set to NULL) — matches the SET NULL FK behavior and gives the user a
    chance to reassign them rather than losing rows."""
    row = _get_owned_category(db, course_slug, category_id, current_user)
    db.delete(row)
    db.commit()
