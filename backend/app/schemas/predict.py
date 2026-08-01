"""Pydantic schemas for the grade query / prediction endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CategoryEarnedRead(BaseModel):
    category_id: int
    name: str
    weight_pct: float
    earned_pct: float | None
    has_grades: bool


class CurrentGradeResponse(BaseModel):
    """Response of `GET /courses/{slug}/grade`.

    `percentage` is null until at least one category has a graded entry, so
    early-semester numbers aren't misleading (SPEC §Grade Math Semantics).
    """

    percentage: float | None
    letter: str | None
    breakdown: list[CategoryEarnedRead]
    target: str | None
    target_pct: float | None


class PredictRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class ScenarioLegRead(BaseModel):
    """One item's assumed score inside a scenario. Rendered as a small row
    on the scenarios table."""

    entry_name: str
    role: str  # "anchor" | "solve"
    pct: float


class ScenarioRead(BaseModel):
    id: str  # "ace" | "steady" | "recover"
    label: str
    description: str
    anchor_pct: float | None
    solve_pct: float | None
    resulting_grade_pct: float
    resulting_letter: str | None
    reachable: bool
    already_locked_in: bool
    legs: list[ScenarioLegRead]


class ReweightScaledRead(BaseModel):
    name: str
    original_weight_pct: float
    scaled_weight_pct: float


class ReweightAppliedRead(BaseModel):
    """Present when the user announced a new weighted item; the math ran
    against a temporarily-reweighted course. Nothing was persisted."""

    new_category_name: str
    new_weight_pct: float
    scaled: list[ReweightScaledRead]


class PredictResponse(BaseModel):
    """Structured response — never a chat reply, per SPEC.

    `answer` is the primary number the UI renders in a large font. It's null
    for query kinds where a single number doesn't apply (e.g. current-grade
    query: the UI reads `current_pct`/`current_letter` instead; scenarios
    queries: the UI reads `scenarios` instead).
    """

    kind: str  # "current_grade" | "needed_on_category" | "needed_on_entry" | "reweight" | "scenarios" | "unknown"
    answer: float | None
    letter: str | None
    reachable: bool | None
    already_locked_in: bool | None
    explanation: str
    # Echoed inputs so the UI can render "You asked: '...' → target: A (90)".
    target: str | None = None
    target_pct: float | None = None
    target_category_name: str | None = None
    target_entry_name: str | None = None
    needed_points: float | None = None
    # For "current_grade" queries the endpoint replies with the current grade
    # too — saves the UI a second round trip.
    current_pct: float | None = None
    current_letter: str | None = None
    # Present when multiple ungraded items remain and a single-number answer
    # would be misleading (SPEC §Grade Math Semantics: "If the query involves
    # multiple remaining items across categories, return a small scenarios
    # table"). Rendered as a compact three-row table on the frontend.
    scenarios: list[ScenarioRead] | None = None
    # Present when the query announced a hypothetical new weight; UI shows a
    # notice above the answer so the assumption is visible.
    reweight_applied: ReweightAppliedRead | None = None
