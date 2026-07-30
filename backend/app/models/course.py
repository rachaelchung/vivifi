from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.utils import new_slug

if TYPE_CHECKING:
    from app.models.semester import Semester


class Course(Base, TimestampMixin):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False, default=new_slug
    )

    semester_id: Mapped[int] = mapped_column(
        ForeignKey("semesters.id", ondelete="CASCADE"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    instructor_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    instructor_email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    # Semantic accent color for calendar / gradebook / course-detail theming.
    color: Mapped[str] = mapped_column(String(9), default="#D97757", nullable=False)

    # Free-form target: may be numeric ("90") or a letter ("A-"). Resolved against
    # the course's grading scale at query time.
    target_grade: Mapped[str | None] = mapped_column(String(8), nullable=True)

    # IANA timezone name; used to render all wall-clock times owned by the course.
    timezone: Mapped[str] = mapped_column(String(64), default="America/New_York", nullable=False)

    semester: Mapped["Semester"] = relationship(back_populates="courses")
