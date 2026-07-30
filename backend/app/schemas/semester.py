from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SemesterBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def _end_after_start(self) -> "SemesterBase":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class SemesterCreate(SemesterBase):
    # New semesters default to active; the router demotes any previously-active
    # semester for the same user.
    is_active: bool = True


class SemesterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None


class SemesterRead(SemesterBase):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
