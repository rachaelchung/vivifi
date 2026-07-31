from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

_HEX_COLOR_RE = r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$"


class CourseBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=40)
    instructor_name: str | None = Field(default=None, max_length=200)
    instructor_email: EmailStr | None = None
    color: str = Field(default="#D97757", pattern=_HEX_COLOR_RE)
    target_grade: str | None = Field(default=None, max_length=8)
    timezone: str = Field(default="America/New_York", max_length=64)

    @field_validator("code", "instructor_name", "target_grade", mode="before")
    @classmethod
    def _empty_to_none(cls, v: str | None) -> str | None:
        if isinstance(v, str) and not v.strip():
            return None
        return v


class CourseCreate(CourseBase):
    semester_slug: str


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=40)
    instructor_name: str | None = Field(default=None, max_length=200)
    instructor_email: EmailStr | None = None
    color: str | None = Field(default=None, pattern=_HEX_COLOR_RE)
    target_grade: str | None = Field(default=None, max_length=8)
    timezone: str | None = Field(default=None, max_length=64)


class CourseRead(CourseBase):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    semester_slug: str
    syllabus_committed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
