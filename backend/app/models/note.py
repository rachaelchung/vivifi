from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.course import Course


class CourseNote(Base, TimestampMixin):
    __tablename__ = "course_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )

    heading: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # syllabus | manual. Boilerplate is filtered at extraction; only genuinely
    # course-specific notes end up here.
    source: Mapped[str] = mapped_column(String(16), default="syllabus", nullable=False)

    course: Mapped["Course"] = relationship(back_populates="notes")
