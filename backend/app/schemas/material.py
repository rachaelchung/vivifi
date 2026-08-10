"""Pydantic schemas for the `CourseMaterial` entity."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MaterialKind = Literal["textbook", "book", "other"]
MaterialRequirement = Literal["required", "recommended"]


def _empty_to_none(v: object) -> object:
    if isinstance(v, str) and not v.strip():
        return None
    return v


class CourseMaterialCreate(BaseModel):
    kind: MaterialKind = "textbook"
    title: str = Field(min_length=1, max_length=300)
    authors: str | None = Field(default=None, max_length=500)
    edition: str | None = Field(default=None, max_length=120)
    isbn: str | None = Field(default=None, max_length=32)
    publisher: str | None = Field(default=None, max_length=200)
    year: int | None = Field(default=None, ge=1000, le=2100)
    url: str | None = Field(default=None, max_length=500)
    requirement: MaterialRequirement = "required"
    notes: str | None = None

    @field_validator(
        "authors", "edition", "isbn", "publisher", "url", "notes", mode="before"
    )
    @classmethod
    def _blank_optional(cls, v: object) -> object:
        return _empty_to_none(v)


class CourseMaterialUpdate(BaseModel):
    kind: MaterialKind | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    authors: str | None = Field(default=None, max_length=500)
    edition: str | None = Field(default=None, max_length=120)
    isbn: str | None = Field(default=None, max_length=32)
    publisher: str | None = Field(default=None, max_length=200)
    year: int | None = Field(default=None, ge=1000, le=2100)
    url: str | None = Field(default=None, max_length=500)
    requirement: MaterialRequirement | None = None
    notes: str | None = None

    @field_validator(
        "authors", "edition", "isbn", "publisher", "url", "notes", mode="before"
    )
    @classmethod
    def _blank_optional(cls, v: object) -> object:
        return _empty_to_none(v)


class CourseMaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: MaterialKind
    title: str
    authors: str | None
    edition: str | None
    isbn: str | None
    publisher: str | None
    year: int | None
    url: str | None
    requirement: MaterialRequirement
    notes: str | None
    source: str
    created_at: datetime
    updated_at: datetime
