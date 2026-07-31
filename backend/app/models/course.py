from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.utils import new_slug

if TYPE_CHECKING:
    from app.models.assignment import Assignment
    from app.models.class_meeting import ClassMeeting
    from app.models.grade import GradebookEntry, GradeCategory, GradeScaleBand
    from app.models.note import CourseNote
    from app.models.office_hours import OfficeHour, OfficeHourHost
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

    # Set once, at the end of a successful syllabus commit. NULL until then.
    # Frontend uses this to decide whether to show the "Upload syllabus" CTA
    # vs the live views. SPEC also disallows re-uploads, which this enforces.
    syllabus_committed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    semester: Mapped["Semester"] = relationship(back_populates="courses")

    grade_categories: Mapped[list["GradeCategory"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    grade_scale_bands: Mapped[list["GradeScaleBand"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    assignments: Mapped[list["Assignment"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    gradebook_entries: Mapped[list["GradebookEntry"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    office_hour_hosts: Mapped[list["OfficeHourHost"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    office_hours: Mapped[list["OfficeHour"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    class_meetings: Mapped[list["ClassMeeting"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    notes: Mapped[list["CourseNote"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
