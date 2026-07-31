from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.utils import new_slug

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.grade import GradebookEntry


class Assignment(Base, TimestampMixin):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False, default=new_slug
    )

    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # assignment | exam. Only affects rendering: exams show up distinctively
    # on the calendar and are non-draggable.
    kind: Mapped[str] = mapped_column(String(16), default="assignment", nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # syllabus | manual | sms
    source: Mapped[str] = mapped_column(String(16), default="manual", nullable=False)

    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    course: Mapped["Course"] = relationship(back_populates="assignments")
    # 1:1 back-reference to the GradebookEntry created alongside this
    # assignment. Nullable because entries can be deleted independently.
    gradebook_entry: Mapped["GradebookEntry | None"] = relationship(
        back_populates="source_assignment",
        foreign_keys="GradebookEntry.source_assignment_id",
        uselist=False,
    )
