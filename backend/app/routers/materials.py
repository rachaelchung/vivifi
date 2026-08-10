"""CourseMaterial CRUD.

The Materials tab on Course Detail is always visible. An empty list means
"No materials required" in the UI, with a manual-add affordance.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import CourseMaterial, User
from app.routers._common import get_owned_course
from app.schemas.material import (
    CourseMaterialCreate,
    CourseMaterialRead,
    CourseMaterialUpdate,
)

router = APIRouter(prefix="/courses/{course_slug}/materials", tags=["materials"])


@router.get("", response_model=list[CourseMaterialRead])
def list_materials(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CourseMaterialRead]:
    course = get_owned_course(db, course_slug, current_user)
    rows = db.execute(
        select(CourseMaterial).where(CourseMaterial.course_id == course.id)
    ).scalars().all()
    rows = sorted(
        rows,
        key=lambda r: (
            0 if r.requirement == "required" else 1,
            r.kind,
            r.id,
        ),
    )
    return [CourseMaterialRead.model_validate(row) for row in rows]


@router.post(
    "", response_model=CourseMaterialRead, status_code=status.HTTP_201_CREATED
)
def create_material(
    course_slug: str,
    payload: CourseMaterialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CourseMaterialRead:
    course = get_owned_course(db, course_slug, current_user)
    row = CourseMaterial(
        course_id=course.id,
        kind=payload.kind,
        title=payload.title.strip(),
        authors=payload.authors,
        edition=payload.edition,
        isbn=payload.isbn,
        publisher=payload.publisher,
        year=payload.year,
        url=payload.url,
        requirement=payload.requirement,
        notes=payload.notes,
        source="manual",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CourseMaterialRead.model_validate(row)


def _get_owned_material(
    db: Session, course_slug: str, material_id: int, user: User
) -> CourseMaterial:
    course = get_owned_course(db, course_slug, user)
    row = db.execute(
        select(CourseMaterial).where(
            CourseMaterial.id == material_id,
            CourseMaterial.course_id == course.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found."
        )
    return row


@router.patch("/{material_id}", response_model=CourseMaterialRead)
def update_material(
    course_slug: str,
    material_id: int,
    payload: CourseMaterialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CourseMaterialRead:
    row = _get_owned_material(db, course_slug, material_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return CourseMaterialRead.model_validate(row)


@router.delete(
    "/{material_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_material(
    course_slug: str,
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_owned_material(db, course_slug, material_id, current_user)
    db.delete(row)
    db.commit()
