from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Semester, User
from app.schemas.semester import SemesterCreate, SemesterRead, SemesterUpdate

router = APIRouter(prefix="/semesters", tags=["semesters"])


def _get_owned_semester(db: Session, slug: str, user: User) -> Semester:
    semester = db.execute(
        select(Semester).where(Semester.slug == slug, Semester.user_id == user.id)
    ).scalar_one_or_none()
    if semester is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found.")
    return semester


def _demote_other_active(db: Session, user_id: int, keep_id: int | None) -> None:
    stmt = update(Semester).where(Semester.user_id == user_id, Semester.is_active.is_(True))
    if keep_id is not None:
        stmt = stmt.where(Semester.id != keep_id)
    db.execute(stmt.values(is_active=False))


@router.get("", response_model=list[SemesterRead])
def list_semesters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SemesterRead]:
    rows = (
        db.execute(
            select(Semester)
            .where(Semester.user_id == current_user.id)
            # Stable, creation-order tabs (older on the left, newer on the
            # right) — like browser tabs. Independent of which one is active,
            # so switching the active semester never rearranges the row.
            .order_by(Semester.created_at.asc())
        )
        .scalars()
        .all()
    )
    return [SemesterRead.model_validate(row) for row in rows]


@router.post("", response_model=SemesterRead, status_code=status.HTTP_201_CREATED)
def create_semester(
    payload: SemesterCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SemesterRead:
    if payload.is_active:
        _demote_other_active(db, current_user.id, keep_id=None)

    semester = Semester(
        user_id=current_user.id,
        name=payload.name.strip(),
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_active=payload.is_active,
    )
    db.add(semester)
    db.commit()
    db.refresh(semester)
    return SemesterRead.model_validate(semester)


@router.patch("/{slug}", response_model=SemesterRead)
def update_semester(
    slug: str,
    payload: SemesterUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SemesterRead:
    semester = _get_owned_semester(db, slug, current_user)

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        semester.name = data["name"].strip()
    if "start_date" in data:
        semester.start_date = data["start_date"]
    if "end_date" in data:
        semester.end_date = data["end_date"]

    if data.get("is_active") is True:
        _demote_other_active(db, current_user.id, keep_id=semester.id)
        semester.is_active = True
    elif data.get("is_active") is False:
        semester.is_active = False

    if (
        semester.start_date
        and semester.end_date
        and semester.end_date < semester.start_date
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date must be on or after start_date",
        )

    db.commit()
    db.refresh(semester)
    return SemesterRead.model_validate(semester)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_semester(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    semester = _get_owned_semester(db, slug, current_user)
    db.delete(semester)
    db.commit()
