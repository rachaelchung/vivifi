from __future__ import annotations

from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.course import Course


class OfficeHourHost(Base):
    __tablename__ = "office_hour_hosts"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Professor | TA | Learning Assistant
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    zoom_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    course: Mapped["Course"] = relationship(back_populates="office_hour_hosts")
    office_hours: Mapped[list["OfficeHour"]] = relationship(
        back_populates="host", cascade="all, delete-orphan"
    )


class OfficeHour(Base):
    __tablename__ = "office_hours"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    host_id: Mapped[int] = mapped_column(
        ForeignKey("office_hour_hosts.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # 0 = Monday, 6 = Sunday, per SPEC.
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    # Free-form: room code, Zoom URL, hybrid string, etc. Frontend renders
    # URL-shaped values as links.
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)

    course: Mapped["Course"] = relationship(back_populates="office_hours")
    host: Mapped["OfficeHourHost"] = relationship(back_populates="office_hours")
