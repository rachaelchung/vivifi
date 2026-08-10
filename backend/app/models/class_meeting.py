from __future__ import annotations

from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.course import Course


class ClassMeeting(Base):
    __tablename__ = "class_meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # lecture | recitation | lab | seminar | other
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="lecture")
    # Free-text section label when the syllabus lists alternatives; null if unsectioned.
    section: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Whether this meeting belongs on the student's personal week schedule.
    is_mine: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 0 = Monday, 6 = Sunday.
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)

    course: Mapped["Course"] = relationship(back_populates="class_meetings")
