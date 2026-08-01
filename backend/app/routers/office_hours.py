"""OfficeHourHost and OfficeHour CRUD.

Two closely related resources live here because the frontend Instructors tab
needs both in the same view. Every OfficeHour references exactly one host
(SPEC), so we validate host ownership on every create / update.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import OfficeHour, OfficeHourHost, User
from app.routers._common import get_owned_course
from app.schemas.office_hours import (
    OfficeHourCreate,
    OfficeHourHostCreate,
    OfficeHourHostRead,
    OfficeHourHostUpdate,
    OfficeHourRead,
    OfficeHourUpdate,
)

hosts_router = APIRouter(
    prefix="/courses/{course_slug}/office-hour-hosts", tags=["office-hours"]
)
hours_router = APIRouter(
    prefix="/courses/{course_slug}/office-hours", tags=["office-hours"]
)


# --- Hosts -----------------------------------------------------------------


@hosts_router.get("", response_model=list[OfficeHourHostRead])
def list_hosts(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OfficeHourHostRead]:
    course = get_owned_course(db, course_slug, current_user)
    rows = db.execute(
        select(OfficeHourHost)
        .where(OfficeHourHost.course_id == course.id)
        .order_by(OfficeHourHost.id.asc())
    ).scalars().all()
    return [OfficeHourHostRead.model_validate(row) for row in rows]


@hosts_router.post(
    "", response_model=OfficeHourHostRead, status_code=status.HTTP_201_CREATED
)
def create_host(
    course_slug: str,
    payload: OfficeHourHostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OfficeHourHostRead:
    course = get_owned_course(db, course_slug, current_user)
    row = OfficeHourHost(
        course_id=course.id,
        name=payload.name.strip(),
        role=payload.role,
        email=str(payload.email) if payload.email else None,
        zoom_link=payload.zoom_link,
        notes=payload.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return OfficeHourHostRead.model_validate(row)


def _get_owned_host(
    db: Session, course_slug: str, host_id: int, user: User
) -> OfficeHourHost:
    course = get_owned_course(db, course_slug, user)
    row = db.execute(
        select(OfficeHourHost).where(
            OfficeHourHost.id == host_id,
            OfficeHourHost.course_id == course.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Host not found."
        )
    return row


@hosts_router.patch("/{host_id}", response_model=OfficeHourHostRead)
def update_host(
    course_slug: str,
    host_id: int,
    payload: OfficeHourHostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OfficeHourHostRead:
    row = _get_owned_host(db, course_slug, host_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        row.name = data["name"].strip()
    if "role" in data and data["role"] is not None:
        row.role = data["role"]
    if "email" in data:
        row.email = str(data["email"]) if data["email"] else None
    if "zoom_link" in data:
        row.zoom_link = data["zoom_link"]
    if "notes" in data:
        row.notes = data["notes"]
    db.commit()
    db.refresh(row)
    return OfficeHourHostRead.model_validate(row)


@hosts_router.delete(
    "/{host_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_host(
    course_slug: str,
    host_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a host. Cascades to all `OfficeHour` blocks owned by them
    (SPEC: an office-hour block is owned by exactly one host, so orphaned
    blocks don't make sense)."""
    row = _get_owned_host(db, course_slug, host_id, current_user)
    db.delete(row)
    db.commit()


# --- Office hours ----------------------------------------------------------


@hours_router.get("", response_model=list[OfficeHourRead])
def list_hours(
    course_slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OfficeHourRead]:
    course = get_owned_course(db, course_slug, current_user)
    rows = db.execute(
        select(OfficeHour)
        .where(OfficeHour.course_id == course.id)
        .order_by(OfficeHour.day_of_week.asc(), OfficeHour.start_time.asc())
    ).scalars().all()
    return [OfficeHourRead.model_validate(row) for row in rows]


def _verify_host(db: Session, course_id: int, host_id: int) -> None:
    row = db.execute(
        select(OfficeHourHost).where(
            OfficeHourHost.id == host_id,
            OfficeHourHost.course_id == course_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Host not found on this course.",
        )


@hours_router.post(
    "", response_model=OfficeHourRead, status_code=status.HTTP_201_CREATED
)
def create_office_hour(
    course_slug: str,
    payload: OfficeHourCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OfficeHourRead:
    course = get_owned_course(db, course_slug, current_user)
    _verify_host(db, course.id, payload.host_id)
    row = OfficeHour(
        course_id=course.id,
        host_id=payload.host_id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        location=payload.location,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return OfficeHourRead.model_validate(row)


def _get_owned_hour(
    db: Session, course_slug: str, hour_id: int, user: User
) -> OfficeHour:
    course = get_owned_course(db, course_slug, user)
    row = db.execute(
        select(OfficeHour).where(
            OfficeHour.id == hour_id,
            OfficeHour.course_id == course.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Office-hour block not found.",
        )
    return row


@hours_router.patch("/{hour_id}", response_model=OfficeHourRead)
def update_office_hour(
    course_slug: str,
    hour_id: int,
    payload: OfficeHourUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OfficeHourRead:
    row = _get_owned_hour(db, course_slug, hour_id, current_user)
    data = payload.model_dump(exclude_unset=True)

    if "host_id" in data and data["host_id"] is not None:
        _verify_host(db, row.course_id, data["host_id"])
        row.host_id = data["host_id"]
    if "day_of_week" in data and data["day_of_week"] is not None:
        row.day_of_week = data["day_of_week"]
    if "start_time" in data and data["start_time"] is not None:
        row.start_time = data["start_time"]
    if "end_time" in data and data["end_time"] is not None:
        row.end_time = data["end_time"]
    if "location" in data:
        row.location = data["location"]

    if row.end_time <= row.start_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_time must be after start_time",
        )

    db.commit()
    db.refresh(row)
    return OfficeHourRead.model_validate(row)


@hours_router.delete(
    "/{hour_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_office_hour(
    course_slug: str,
    hour_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_owned_hour(db, course_slug, hour_id, current_user)
    db.delete(row)
    db.commit()
