"""Unit tests for the natural-language query planner.

The planner has two layers:

1. `parse_query_heuristic` — fast regex layer, only for the two distinctive
   shapes ("what's my current grade" and reweight declarations). Everything
   else deliberately returns None so the caller can send it to Claude with
   full state.
2. `_parse_plan_json` — parses Claude's JSON response into a `PredictionPlan`,
   with defensive coercion + guards so a malformed response degrades to
   `action="unknown"` instead of raising.

Claude's HTTP call itself is out of scope for unit tests — that's exercised
via manual + integration testing where an API key is present.
"""

from __future__ import annotations

import json

import pytest

from app.services import grade_math as gm
from app.services.predict import (
    PredictionPlan,
    _parse_plan_json,
    parse_query_heuristic,
)


CATS = [
    gm.CategoryInput(id=1, name="HW", weight_pct=30.0),
    gm.CategoryInput(id=2, name="Exams", weight_pct=50.0),
    gm.CategoryInput(id=3, name="Papers", weight_pct=20.0),
]
ENTRIES = [
    gm.EntryInput(id=1, category_id=1, points_earned=90, points_possible=100, name="HW1"),
    gm.EntryInput(id=2, category_id=1, points_earned=None, points_possible=100, name="HW2"),
    gm.EntryInput(id=3, category_id=2, points_earned=85, points_possible=100, name="Midterm"),
    gm.EntryInput(id=4, category_id=2, points_earned=None, points_possible=100, name="Final Exam"),
    gm.EntryInput(id=5, category_id=3, points_earned=None, points_possible=100, name="Term Paper"),
]


# --- heuristic layer -------------------------------------------------------


class TestCurrentGradeHeuristic:
    @pytest.mark.parametrize(
        "q",
        [
            "what's my grade?",
            "what is my current grade?",
            "show me my grade",
            "tell me my grade please",
            "what is the current grade",
        ],
    )
    def test_matches(self, q: str) -> None:
        r = parse_query_heuristic(q)
        assert r is not None
        assert r.action == "current_grade"

    @pytest.mark.parametrize(
        "q",
        [
            # These MUST NOT hit the current-grade / pass fast paths — they
            # need Claude's judgment against the full state.
            "am I on track for an A?",
            "is a B+ still possible?",
            "what's the highest grade I could still get?",
            "what should I aim for on my next test?",
        ],
    )
    def test_ambiguous_queries_defer_to_claude(self, q: str) -> None:
        assert parse_query_heuristic(q) is None


class TestPassHeuristic:
    @pytest.mark.parametrize(
        "q",
        [
            "can I still pass?",
            "can i pass",
            "am I passing?",
            "am I still passing",
            "will I pass?",
            "am I failing?",
        ],
    )
    def test_routes_to_passing_target(self, q: str) -> None:
        r = parse_query_heuristic(q)
        assert r is not None
        assert r.action == "predict"
        assert r.target is not None
        assert r.target.kind == "passing"
        assert r.focus.mode == "any_remaining"


class TestReweightHeuristic:
    def test_final_worth_20_pct_letter_target(self) -> None:
        r = parse_query_heuristic(
            "my final is worth 20%, what do I need to get an A?"
        )
        assert r is not None
        assert r.action == "reweight"
        assert r.reweight is not None
        assert r.reweight.new_category_name == "Final"
        assert r.reweight.new_weight_pct == 20.0
        assert r.target is not None
        assert r.target.kind == "letter"
        assert r.target.value == "A"

    def test_bare_exam_promoted_to_final_exam(self) -> None:
        r = parse_query_heuristic(
            "my exam is worth 20%, what do I need to score for an A-?"
        )
        assert r is not None
        assert r.action == "reweight"
        assert r.reweight is not None
        assert r.reweight.new_category_name == "Final Exam"

    def test_two_word_name_captured(self) -> None:
        r = parse_query_heuristic(
            "the final exam is worth 25%, what do I need to hit a 92?"
        )
        assert r is not None
        assert r.action == "reweight"
        assert r.reweight is not None
        assert r.reweight.new_category_name == "Final Exam"
        assert r.reweight.new_weight_pct == 25.0
        assert r.target is not None
        assert r.target.kind == "pct"
        assert r.target.value == 92.0

    def test_counts_for_variant(self) -> None:
        r = parse_query_heuristic(
            "the presentation counts for 15%, what do I need for an A?"
        )
        assert r is not None
        assert r.action == "reweight"
        assert r.reweight is not None
        assert r.reweight.new_category_name == "Presentation"
        assert r.reweight.new_weight_pct == 15.0

    def test_out_of_bounds_weight_rejected(self) -> None:
        """Weight ≥ 100 or ≤ 0 must not classify as reweight."""
        assert parse_query_heuristic(
            "my final is worth 100%, what do I need to get an A?"
        ) is None


class TestUnknownHeuristic:
    @pytest.mark.parametrize(
        "q",
        [
            "hello",
            "what's the weather?",
            "who is my TA?",
            # Non-reweight prediction question: heuristic must defer.
            "what do I need on the Final Exam to get an A?",
        ],
    )
    def test_no_match(self, q: str) -> None:
        assert parse_query_heuristic(q) is None


# --- Claude JSON parsing --------------------------------------------------


def _plan(payload: dict) -> PredictionPlan:
    return _parse_plan_json(json.dumps(payload), CATS, ENTRIES)


class TestPlanJsonParsing:
    def test_predict_specific_entry_letter_target(self) -> None:
        plan = _plan({
            "action": "predict",
            "target": {"kind": "letter", "value": "A"},
            "focus": {"mode": "specific_entry", "entry_name": "Final Exam"},
            "reweight": None,
            "narrative_prefix": "",
        })
        assert plan.action == "predict"
        assert plan.target is not None
        assert plan.target.kind == "letter" and plan.target.value == "A"
        assert plan.focus.mode == "specific_entry"
        assert plan.focus.entry_name == "Final Exam"

    def test_predict_any_remaining_passing_target(self) -> None:
        plan = _plan({
            "action": "predict",
            "target": {"kind": "passing"},
            "focus": {"mode": "any_remaining"},
            "reweight": None,
            "narrative_prefix": "Passing here means a D.",
        })
        assert plan.action == "predict"
        assert plan.target is not None
        assert plan.target.kind == "passing"
        assert plan.target.value is None
        assert plan.focus.mode == "any_remaining"
        assert plan.narrative_prefix == "Passing here means a D."

    def test_zero_pct_target_coerced_to_passing(self) -> None:
        """Claude sometimes emits pct:0 for 'failing' — that must not reach
        the math engine as a 0% bar."""
        plan = _plan({
            "action": "predict",
            "target": {"kind": "pct", "value": 0},
            "focus": {"mode": "any_remaining"},
        })
        assert plan.action == "predict"
        assert plan.target is not None
        assert plan.target.kind == "passing"

    def test_f_letter_target_coerced_to_passing(self) -> None:
        plan = _plan({
            "action": "predict",
            "target": {"kind": "letter", "value": "F"},
            "focus": {"mode": "any_remaining"},
        })
        assert plan.action == "predict"
        assert plan.target is not None
        assert plan.target.kind == "passing"

    def test_predict_numeric_target_from_string(self) -> None:
        plan = _plan({
            "action": "predict",
            "target": {"kind": "pct", "value": "92.5"},
            "focus": {"mode": "any_remaining"},
        })
        assert plan.action == "predict"
        assert plan.target is not None
        assert plan.target.kind == "pct"
        assert plan.target.value == 92.5

    def test_unknown_entry_name_falls_back_to_any_remaining(self) -> None:
        plan = _plan({
            "action": "predict",
            "target": {"kind": "letter", "value": "A"},
            "focus": {
                "mode": "specific_entry",
                "entry_name": "Nonexistent Assignment",
            },
        })
        assert plan.focus.mode == "any_remaining"
        assert plan.focus.entry_name is None

    def test_unknown_category_name_falls_back(self) -> None:
        plan = _plan({
            "action": "predict",
            "target": {"kind": "letter", "value": "A"},
            "focus": {"mode": "specific_category", "category_name": "Nope"},
        })
        assert plan.focus.mode == "any_remaining"

    def test_reweight_valid(self) -> None:
        plan = _plan({
            "action": "reweight",
            "target": {"kind": "letter", "value": "A"},
            "focus": {"mode": "any_remaining"},
            "reweight": {"new_category_name": "Final", "new_weight_pct": 20},
        })
        assert plan.action == "reweight"
        assert plan.reweight is not None
        assert plan.reweight.new_category_name == "Final"
        assert plan.reweight.new_weight_pct == 20.0

    def test_reweight_without_reweight_spec_degrades_to_unknown(self) -> None:
        """Guard: `action="reweight"` requires a valid reweight block. If
        Claude forgot to include one, we shouldn't crash — we should punt."""
        plan = _plan({
            "action": "reweight",
            "target": {"kind": "letter", "value": "A"},
            "focus": {"mode": "any_remaining"},
        })
        assert plan.action == "unknown"

    def test_reweight_out_of_bounds_weight_degrades(self) -> None:
        plan = _plan({
            "action": "reweight",
            "target": {"kind": "letter", "value": "A"},
            "focus": {"mode": "any_remaining"},
            "reweight": {"new_category_name": "Final", "new_weight_pct": 0},
        })
        assert plan.action == "unknown"

    def test_predict_without_target_degrades(self) -> None:
        """Every `predict` needs SOMETHING to target."""
        plan = _plan({
            "action": "predict",
            "target": None,
            "focus": {"mode": "any_remaining"},
        })
        assert plan.action == "unknown"

    def test_current_grade_ignores_target(self) -> None:
        """current_grade doesn't need a target — leaving it null is fine."""
        plan = _plan({
            "action": "current_grade",
            "target": None,
            "focus": {"mode": "any_remaining"},
        })
        assert plan.action == "current_grade"

    def test_unknown_action_is_unknown(self) -> None:
        plan = _plan({
            "action": "banana",
            "target": None,
        })
        assert plan.action == "unknown"

    def test_json_wrapped_in_markdown_fence(self) -> None:
        """Claude sometimes wraps JSON in ```json fences despite the prompt."""
        raw = (
            "```json\n"
            '{"action": "current_grade", "target": null, "focus": {"mode": "any_remaining"}}\n'
            "```"
        )
        plan = _parse_plan_json(raw, CATS, ENTRIES)
        assert plan.action == "current_grade"

    def test_json_embedded_in_prose(self) -> None:
        """Fallback: extract the first {...} block from a mixed response."""
        raw = (
            "Here's the plan: "
            '{"action": "current_grade", "target": null}\n'
            "Hope that helps!"
        )
        plan = _parse_plan_json(raw, CATS, ENTRIES)
        assert plan.action == "current_grade"

    def test_totally_broken_response_is_unknown(self) -> None:
        plan = _parse_plan_json("¯\\_(ツ)_/¯", CATS, ENTRIES)
        assert plan.action == "unknown"

    def test_non_object_response_is_unknown(self) -> None:
        plan = _parse_plan_json("[1, 2, 3]", CATS, ENTRIES)
        assert plan.action == "unknown"
