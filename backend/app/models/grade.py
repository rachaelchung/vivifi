from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.utils import new_slug

if TYPE_CHECKING:
    from app.models.assignment import Assignment
    from app.models.course import Course


class GradeCategory(Base):
    __tablename__ = "grade_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    weight_pct: Mapped[float] = mapped_column(Float, nullable=False)
    drop_lowest_n: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    course: Mapped["Course"] = relationship(back_populates="grade_categories")
    gradebook_entries: Mapped[list["GradebookEntry"]] = relationship(
        back_populates="category"
    )


class GradeScaleBand(Base):
    __tablename__ = "grade_scale_bands"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # Free-form letter to support +/- schools ("A+", "A", "A-", "B+", ...).
    letter: Mapped[str] = mapped_column(String(8), nullable=False)
    min_pct: Mapped[float] = mapped_column(Float, nullable=False)

    course: Mapped["Course"] = relationship(back_populates="grade_scale_bands")


class GradebookEntry(Base, TimestampMixin):
    __tablename__ = "gradebook_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False, default=new_slug
    )

    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Nullable: entries may be uncategorized while the user is still assigning
    # them a bucket on the review screen (or after a category was deleted).
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("grade_categories.id", ondelete="SET NULL"), nullable=True
    )
    # Optional back-reference to a paired Assignment created alongside this
    # entry (syllabus / sms flows). Nulling this out orphans the entry into a
    # manual row; see the lifecycle rules in SPEC.md.
    source_assignment_id: Mapped[int | None] = mapped_column(
        ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    points_earned: Mapped[float | None] = mapped_column(Float, nullable=True)
    points_possible: Mapped[float] = mapped_column(Float, nullable=False)

    # syllabus | manual | sms
    source: Mapped[str] = mapped_column(String(16), default="manual", nullable=False)
    # Hidden entries still render on the Gradebook tab but skip the math.
    hidden: Mapped[bool] = mapped_column(default=False, nullable=False)

    course: Mapped["Course"] = relationship(back_populates="gradebook_entries")
    category: Mapped["GradeCategory | None"] = relationship(
        back_populates="gradebook_entries"
    )
    source_assignment: Mapped["Assignment | None"] = relationship(
        back_populates="gradebook_entry",
        foreign_keys=[source_assignment_id],
    )
