from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.course import Course


class CourseMaterial(Base, TimestampMixin):
    """A textbook, reading, or other required/recommended course material."""

    __tablename__ = "course_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # textbook | book | other
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="textbook")
    # Display name for all kinds (object name when kind = other).
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    authors: Mapped[str | None] = mapped_column(String(500), nullable=True)
    edition: Mapped[str | None] = mapped_column(String(120), nullable=True)
    isbn: Mapped[str | None] = mapped_column(String(32), nullable=True)
    publisher: Mapped[str | None] = mapped_column(String(200), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # required | recommended
    requirement: Mapped[str] = mapped_column(
        String(16), nullable=False, default="required"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # syllabus | manual
    source: Mapped[str] = mapped_column(String(16), default="syllabus", nullable=False)

    course: Mapped["Course"] = relationship(back_populates="materials")
