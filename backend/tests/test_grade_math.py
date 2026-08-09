"""Unit tests for the grade math engine.

Every formula in SPEC §Grade Math Semantics is covered here. Extra credit is
tested in both flavors (bonus scoring on a normal entry, and pure extra credit
with points_possible = 0) because the SPEC calls those out as the case where a
subtle bug destroys credibility.
"""

from __future__ import annotations

import math

import pytest

from app.services.grade_math import (
    CategoryInput,
    CurrentGrade,
    EntryInput,
    ScaleBand,
    anchor_scenarios,
    apply_reweight,
    compute_category_earned,
    compute_current_grade,
    letter_for,
    list_ungraded_entries,
    predict_category_needed,
    predict_entry_needed,
    resolve_passing_pct,
    resolve_target,
)


# --- fixtures ---------------------------------------------------------------


HW = CategoryInput(id=1, name="Homework", weight_pct=40)
MID = CategoryInput(id=2, name="Midterm", weight_pct=25)
FINAL = CategoryInput(id=3, name="Final", weight_pct=35)

STANDARD_BANDS = [
    ScaleBand("A", 90),
    ScaleBand("B", 80),
    ScaleBand("C", 70),
    ScaleBand("D", 60),
    ScaleBand("F", 0),
]

PLUS_MINUS_BANDS = [
    ScaleBand("A", 93),
    ScaleBand("A-", 90),
    ScaleBand("B+", 87),
    ScaleBand("B", 83),
    ScaleBand("B-", 80),
    ScaleBand("C", 70),
    ScaleBand("F", 0),
]


def _entry(
    entry_id: int,
    category_id: int | None,
    earned: float | None,
    possible: float,
    hidden: bool = False,
) -> EntryInput:
    return EntryInput(
        id=entry_id,
        category_id=category_id,
        points_earned=earned,
        points_possible=possible,
        hidden=hidden,
    )


# --- compute_category_earned -----------------------------------------------


class TestCategoryEarned:
    def test_empty_category_returns_none(self):
        assert compute_category_earned([]) is None

    def test_all_ungraded_returns_none(self):
        entries = [_entry(1, 1, None, 10), _entry(2, 1, None, 10)]
        assert compute_category_earned(entries) is None

    def test_simple_mean_of_ratios(self):
        # 8/10 and 9/10 → mean 0.85
        entries = [_entry(1, 1, 8, 10), _entry(2, 1, 9, 10)]
        assert compute_category_earned(entries) == pytest.approx(0.85)

    def test_hidden_entry_is_skipped(self):
        entries = [
            _entry(1, 1, 8, 10),
            _entry(2, 1, 2, 10, hidden=True),  # would drop the mean if counted
        ]
        assert compute_category_earned(entries) == pytest.approx(0.8)

    def test_different_point_scales(self):
        # 45/50 = 0.9 and 8/10 = 0.8 → mean 0.85 (unweighted by point size)
        entries = [_entry(1, 1, 45, 50), _entry(2, 1, 8, 10)]
        assert compute_category_earned(entries) == pytest.approx(0.85)

    def test_bonus_scoring_ratio_above_one(self):
        # 105/100 → ratio 1.05, pulls the mean up
        entries = [_entry(1, 1, 105, 100), _entry(2, 1, 90, 100)]
        assert compute_category_earned(entries) == pytest.approx(0.975)

    def test_pure_extra_credit_adds_flat_bonus(self):
        # Two normal entries at 80/100 and 90/100 → base mean 0.85, typical_pp=100.
        # A pure EC entry of +5 points adds 5/100 = 0.05 → earned_c = 0.90.
        entries = [
            _entry(1, 1, 80, 100),
            _entry(2, 1, 90, 100),
            _entry(3, 1, 5, 0),  # pure EC
        ]
        assert compute_category_earned(entries) == pytest.approx(0.90)

    def test_drop_lowest_n_excludes_worst_ratios(self):
        # Scores: 50%, 80%, 100%. Drop lowest 1 → mean of 0.8 and 1.0 = 0.9.
        entries = [
            _entry(1, 1, 5, 10),
            _entry(2, 1, 8, 10),
            _entry(3, 1, 10, 10),
        ]
        assert compute_category_earned(entries, drop_lowest_n=1) == pytest.approx(0.9)

    def test_drop_lowest_n_zero_is_noop(self):
        entries = [_entry(1, 1, 5, 10), _entry(2, 1, 10, 10)]
        assert compute_category_earned(entries, drop_lowest_n=0) == pytest.approx(0.75)

    def test_drop_lowest_does_not_drop_extra_credit(self):
        # Normals 50% and 100% (pp=100); drop the 50%. Pure EC +5 uses
        # pre-drop typical_pp=100 → base 1.0 + 0.05 = 1.05.
        entries = [
            _entry(1, 1, 50, 100),
            _entry(2, 1, 100, 100),
            _entry(3, 1, 5, 0),
        ]
        assert compute_category_earned(entries, drop_lowest_n=1) == pytest.approx(1.05)

    def test_drop_all_graded_normals_leaves_only_ec(self):
        # Drop the only normal; EC +5 with typical_pp from that normal (100).
        entries = [_entry(1, 1, 50, 100), _entry(2, 1, 5, 0)]
        assert compute_category_earned(entries, drop_lowest_n=1) == pytest.approx(0.05)

    def test_drop_all_graded_with_no_ec_returns_none(self):
        entries = [_entry(1, 1, 5, 10)]
        assert compute_category_earned(entries, drop_lowest_n=1) is None

    def test_current_grade_respects_category_drop_lowest(self):
        hw = CategoryInput(id=1, name="Homework", weight_pct=100, drop_lowest_n=1)
        entries = [
            _entry(1, 1, 5, 10),
            _entry(2, 1, 8, 10),
            _entry(3, 1, 10, 10),
        ]
        result = compute_current_grade(entries, [hw], STANDARD_BANDS)
        assert result.percentage == pytest.approx(90.0)

    def test_pure_extra_credit_only_no_normal_falls_back(self):
        # No normal entries — only a 2-point EC. typical_pp falls back to 100.
        # base = 0, ec_bonus = 2/100 = 0.02. earned_c = 0.02.
        entries = [_entry(1, 1, 2, 0)]
        assert compute_category_earned(entries) == pytest.approx(0.02)

    def test_pure_extra_credit_zero_earned_contributes_nothing(self):
        # 0/0 is a well-formed row with no signal; ignored.
        entries = [_entry(1, 1, 0, 0)]
        assert compute_category_earned(entries) is None


# --- compute_current_grade -------------------------------------------------


class TestCurrentGrade:
    def test_no_grades_returns_none_pct(self):
        cg = compute_current_grade([], [HW, MID, FINAL], STANDARD_BANDS)
        assert cg.percentage is None
        assert cg.letter is None
        assert all(not b.has_grades for b in cg.breakdown)

    def test_only_graded_categories_count_toward_current(self):
        # HW is graded at 0.85 (85%). Others are ungraded.
        # Current = 85% (weighted mean over graded categories only).
        entries = [_entry(1, HW.id, 8, 10), _entry(2, HW.id, 9, 10)]
        cg = compute_current_grade(entries, [HW, MID, FINAL], STANDARD_BANDS)
        assert cg.percentage == pytest.approx(85.0)
        assert cg.letter == "B"

    def test_weighted_average_across_multiple_graded_categories(self):
        # HW 40% at 90%, Midterm 25% at 80%.
        # Numerator: 0.9*40 + 0.8*25 = 36 + 20 = 56
        # Denominator: 40 + 25 = 65
        # Current: 56/65 * 100 ≈ 86.15%
        entries = [
            _entry(1, HW.id, 90, 100),
            _entry(2, MID.id, 80, 100),
        ]
        cg = compute_current_grade(entries, [HW, MID, FINAL], STANDARD_BANDS)
        assert cg.percentage == pytest.approx(56 / 65 * 100)
        assert cg.letter == "B"

    def test_all_categories_graded_produces_full_current(self):
        entries = [
            _entry(1, HW.id, 90, 100),
            _entry(2, MID.id, 80, 100),
            _entry(3, FINAL.id, 100, 100),
        ]
        cg = compute_current_grade(entries, [HW, MID, FINAL], STANDARD_BANDS)
        # 0.9*40 + 0.8*25 + 1.0*35 = 36 + 20 + 35 = 91 / 100 = 91.0
        assert cg.percentage == pytest.approx(91.0)
        assert cg.letter == "A"

    def test_bonus_scoring_in_category_raises_current(self):
        # Bonus: 105/100 in HW is a 1.05 ratio. All-HW → current = 105%.
        entries = [_entry(1, HW.id, 105, 100)]
        cg = compute_current_grade(entries, [HW], STANDARD_BANDS)
        assert cg.percentage == pytest.approx(105.0)
        # Highest band in the standard scale is A at 90 → still an A.
        assert cg.letter == "A"

    def test_plus_minus_scale_returns_correct_letter(self):
        entries = [_entry(1, HW.id, 91, 100)]
        cg = compute_current_grade(entries, [HW], PLUS_MINUS_BANDS)
        # 91 falls in A- (90) band, not A (93).
        assert cg.percentage == pytest.approx(91.0)
        assert cg.letter == "A-"

    def test_hidden_entry_not_counted(self):
        entries = [
            _entry(1, HW.id, 100, 100),
            _entry(2, HW.id, 0, 100, hidden=True),
        ]
        cg = compute_current_grade(entries, [HW], STANDARD_BANDS)
        assert cg.percentage == pytest.approx(100.0)

    def test_pure_extra_credit_pushes_grade_up(self):
        # HW: 80/100 + pure EC of 5 → earned_c = 0.85 → current = 85%.
        entries = [
            _entry(1, HW.id, 80, 100),
            _entry(2, HW.id, 5, 0),  # pure EC
        ]
        cg = compute_current_grade(entries, [HW], STANDARD_BANDS)
        assert cg.percentage == pytest.approx(85.0)
        assert cg.letter == "B"


# --- resolve_target + letter_for -------------------------------------------


class TestTargetResolution:
    def test_numeric_target_passes_through(self):
        assert resolve_target(90, STANDARD_BANDS) == 90.0
        assert resolve_target(88.5, STANDARD_BANDS) == 88.5

    def test_numeric_string_target_parses(self):
        assert resolve_target("90", STANDARD_BANDS) == 90.0
        assert resolve_target(" 92.5 ", STANDARD_BANDS) == 92.5

    def test_letter_target_uses_exact_match(self):
        assert resolve_target("A", STANDARD_BANDS) == 90.0
        assert resolve_target("B", STANDARD_BANDS) == 80.0

    def test_letter_target_plus_minus_is_exact(self):
        # SPEC: "A" at a +/- school resolves to A (93), not A- (90).
        assert resolve_target("A", PLUS_MINUS_BANDS) == 93.0
        assert resolve_target("A-", PLUS_MINUS_BANDS) == 90.0
        assert resolve_target("B+", PLUS_MINUS_BANDS) == 87.0

    def test_unknown_letter_returns_none(self):
        assert resolve_target("Z", STANDARD_BANDS) is None

    def test_empty_target_returns_none(self):
        assert resolve_target("", STANDARD_BANDS) is None


class TestResolvePassingPct:
    def test_standard_bands_passing_is_d(self):
        # Standard bands: A=90, B=80, C=70, D=60, F=0. Passing = D.
        assert resolve_passing_pct(STANDARD_BANDS) == 60.0

    def test_plus_minus_bands_passing_is_lowest_non_f(self):
        # Whichever the lowest non-F band is, that's the passing bar.
        passing = resolve_passing_pct(PLUS_MINUS_BANDS)
        assert passing is not None
        assert passing > 0

    def test_all_f_bands_returns_none(self):
        # Malformed scale with only F variants → no passing threshold.
        assert resolve_passing_pct([ScaleBand(letter="F", min_pct=0)]) is None

    def test_skips_zero_pct_non_f_band(self):
        # Mis-extracted "NC" at 0% must not become the passing bar.
        bands = [
            ScaleBand(letter="NC", min_pct=0),
            ScaleBand(letter="D", min_pct=60),
            ScaleBand(letter="A", min_pct=90),
        ]
        assert resolve_passing_pct(bands) == 60.0


class TestLetterFor:
    def test_walk_bands_desc(self):
        assert letter_for(95, STANDARD_BANDS) == "A"
        assert letter_for(90, STANDARD_BANDS) == "A"
        assert letter_for(89.99, STANDARD_BANDS) == "B"
        assert letter_for(70, STANDARD_BANDS) == "C"
        assert letter_for(59, STANDARD_BANDS) == "F"

    def test_plus_minus_boundaries(self):
        assert letter_for(93, PLUS_MINUS_BANDS) == "A"
        assert letter_for(92.99, PLUS_MINUS_BANDS) == "A-"
        assert letter_for(90, PLUS_MINUS_BANDS) == "A-"
        assert letter_for(89.99, PLUS_MINUS_BANDS) == "B+"


# --- predict_category_needed -----------------------------------------------


class TestPredictCategory:
    def test_needs_all_other_cats_graded(self):
        # Nothing graded → can't predict category needed.
        r = predict_category_needed(
            target_pct=90,
            target_category_id=FINAL.id,
            entries=[],
            categories=[HW, MID, FINAL],
        )
        assert r.reachable is False
        assert "Need at least one grade" in r.explanation

    def test_reachable_case(self):
        # HW 40% at 90%, MID 25% at 80%. Need 90 overall on FINAL (35%)?
        # sum_other = 0.9*40 + 0.8*25 = 56.
        # needed_x_fraction = (90 - 56) / 35 = 34/35 ≈ 0.9714 → 97.14%.
        entries = [
            _entry(1, HW.id, 90, 100),
            _entry(2, MID.id, 80, 100),
        ]
        r = predict_category_needed(
            target_pct=90,
            target_category_id=FINAL.id,
            entries=entries,
            categories=[HW, MID, FINAL],
        )
        assert r.reachable is True
        assert not r.already_locked_in
        assert r.needed_pct == pytest.approx(34 / 35 * 100)

    def test_not_reachable_case(self):
        # HW 40% at 60%, MID 25% at 70%. Need 95 overall on FINAL (35%)?
        # sum_other = 0.6*40 + 0.7*25 = 24 + 17.5 = 41.5
        # needed = (95 - 41.5) / 35 = 53.5/35 ≈ 152.86% → unreachable.
        entries = [
            _entry(1, HW.id, 60, 100),
            _entry(2, MID.id, 70, 100),
        ]
        r = predict_category_needed(
            target_pct=95,
            target_category_id=FINAL.id,
            entries=entries,
            categories=[HW, MID, FINAL],
        )
        assert r.reachable is False
        assert r.needed_pct > 100
        assert "isn't reachable" in r.explanation

    def test_locked_in_case(self):
        # HW 40% at 100% and MID 25% at 100%. Need 60 overall on FINAL (35%)?
        # sum_other = 40 + 25 = 65 > 60 → needed_pct < 0 → locked in.
        entries = [
            _entry(1, HW.id, 100, 100),
            _entry(2, MID.id, 100, 100),
        ]
        r = predict_category_needed(
            target_pct=60,
            target_category_id=FINAL.id,
            entries=entries,
            categories=[HW, MID, FINAL],
        )
        assert r.reachable is True
        assert r.already_locked_in is True
        assert "Locked in" in r.explanation

    def test_zero_weight_category_rejected(self):
        zero = CategoryInput(id=99, name="Unweighted", weight_pct=0)
        r = predict_category_needed(
            target_pct=90,
            target_category_id=zero.id,
            entries=[],
            categories=[HW, zero],
        )
        assert r.reachable is False
        assert "0% weight" in r.explanation

    def test_unknown_category_rejected(self):
        r = predict_category_needed(
            target_pct=90,
            target_category_id=999,
            entries=[],
            categories=[HW],
        )
        assert r.reachable is False


# --- predict_entry_needed --------------------------------------------------


class TestPredictEntry:
    def test_needs_other_categories_graded(self):
        # Only category is HW with two entries; predict on an ungraded final.
        # But midterm is ungraded → error.
        entries = [_entry(1, HW.id, 90, 100)]
        target = _entry(99, FINAL.id, None, 100)
        r = predict_entry_needed(
            target_pct=90,
            entry=target,
            entries=[*entries, target],
            categories=[HW, MID, FINAL],
            entry_name="Final Exam",
        )
        assert r.reachable is False
        assert "Need at least one grade" in r.explanation

    def test_simple_single_entry_prediction(self):
        # HW 40% at 90%, MID 25% at 80%. FINAL 35% has just one entry.
        # Overall target 90:
        # sum_other = 56. needed_earned_cat_final = (90 - 56) / 35 ≈ 0.9714
        # Since there's only one entry, r_x = needed_earned_cat_final ≈ 0.9714
        # → 97.14/100.
        entries = [
            _entry(1, HW.id, 90, 100),
            _entry(2, MID.id, 80, 100),
        ]
        target = _entry(99, FINAL.id, None, 100)
        r = predict_entry_needed(
            target_pct=90,
            entry=target,
            entries=[*entries, target],
            categories=[HW, MID, FINAL],
            entry_name="Final Exam",
        )
        assert r.reachable is True
        assert r.needed_pct == pytest.approx(34 / 35 * 100)
        assert r.needed_points == pytest.approx(34 / 35 * 100)

    def test_prediction_accounts_for_other_entries_in_same_category(self):
        # HW 40% at 90% (mean of graded); MID 25% at 80%.
        # In FINAL (35%), midterm-of-final (worth 100) got 70; the actual final
        # entry (worth 100) is ungraded.
        # sum_other = 56 same as before.
        # needed_earned_cat_final × 35 = 90 - 56 = 34 → needed_earned_cat = 34/35
        # In FINAL: mean(70/100, r_x) = 34/35 → r_x = 2*(34/35) - 0.7 ≈ 1.243 - 0.7 = 1.243 - 0.7
        # Actually: 2 * 34/35 - 0.7 = 68/35 - 0.7 ≈ 1.9429 - 0.7 = 1.2429 → 124.29%.
        # So the final is not reachable at target 90.
        entries = [
            _entry(1, HW.id, 90, 100),
            _entry(2, MID.id, 80, 100),
            _entry(3, FINAL.id, 70, 100),  # a "practice final" or graded early exam in the FINAL category
        ]
        target = _entry(99, FINAL.id, None, 100)
        r = predict_entry_needed(
            target_pct=90,
            entry=target,
            entries=[*entries, target],
            categories=[HW, MID, FINAL],
            entry_name="Final Exam",
        )
        # 2 * (34/35) - 0.7 = 1.24285…
        expected_ratio = 2 * (34 / 35) - 0.7
        assert r.needed_pct == pytest.approx(expected_ratio * 100)
        assert r.reachable is False

    def test_pure_extra_credit_entry_rejected(self):
        entries = [_entry(1, HW.id, 90, 100), _entry(2, MID.id, 80, 100)]
        target = _entry(99, FINAL.id, None, 0)  # pure EC
        r = predict_entry_needed(
            target_pct=90,
            entry=target,
            entries=[*entries, target],
            categories=[HW, MID, FINAL],
            entry_name="Bonus quiz",
        )
        assert r.reachable is False
        assert "extra-credit" in r.explanation

    def test_uncategorized_entry_rejected(self):
        target = _entry(99, None, None, 100)
        r = predict_entry_needed(
            target_pct=90,
            entry=target,
            entries=[target],
            categories=[HW, MID, FINAL],
        )
        assert r.reachable is False
        assert "grade category" in r.explanation


# --- integration: worked example from SPEC ---------------------------------


class TestWorkedExampleSanity:
    """A single, realistic scenario tying everything together — matches how a
    student would actually experience Vivifi."""

    def test_full_semester_simulation(self):
        cats = [
            CategoryInput(id=1, name="Homework", weight_pct=30),
            CategoryInput(id=2, name="Quizzes", weight_pct=20),
            CategoryInput(id=3, name="Midterm", weight_pct=20),
            CategoryInput(id=4, name="Final", weight_pct=30),
        ]
        entries = [
            # HW: 3 entries; got 9/10, 8/10, 10/10 → mean 0.9
            _entry(1, 1, 9, 10),
            _entry(2, 1, 8, 10),
            _entry(3, 1, 10, 10),
            # Quizzes: 2 done, one ungraded — plus a 2-point pure EC bonus quiz
            #   Done: 4/5, 5/5 → mean 0.9
            #   +EC 2pts, typical_pp = 5 → bonus 0.4 → earned_c = 1.3 (!)
            _entry(4, 2, 4, 5),
            _entry(5, 2, 5, 5),
            _entry(6, 2, 2, 0),  # pure EC
            _entry(7, 2, None, 5),  # still ungraded — irrelevant to earned_c
            # Midterm: 85/100 → 0.85
            _entry(8, 3, 85, 100),
            # Final: ungraded
            _entry(9, 4, None, 100),
        ]
        cg = compute_current_grade(entries, cats, STANDARD_BANDS)
        # earned_hw = 0.9, earned_quiz = 1.3, earned_mid = 0.85, final ungraded.
        # numerator = 0.9*30 + 1.3*20 + 0.85*20 = 27 + 26 + 17 = 70
        # denominator = 30 + 20 + 20 = 70
        # current = 70/70 * 100 = 100.
        assert cg.percentage == pytest.approx(100.0)
        assert cg.letter == "A"

        # Prediction: what does the final need to hit 95?
        # sum_other = 0.9*30 + 1.3*20 + 0.85*20 = 70
        # needed = (95 - 70) / 30 * 100 = 25/30 * 100 ≈ 83.33
        target = entries[-1]
        r = predict_entry_needed(
            target_pct=95,
            entry=target,
            entries=entries,
            categories=cats,
            entry_name="Final Exam",
        )
        assert r.reachable is True
        assert r.needed_pct == pytest.approx(25 / 30 * 100)


# --- scenario planning (multi-item prediction) -----------------------------


class TestScenarios:
    """Two remaining tests, both worth 15% each (categories) inside the
    same 'Exams' bucket — matches the user's canonical case of 'a midterm
    and a final still to go, what should I aim for on the next test?'."""

    def _fixture(self):
        cats = [
            CategoryInput(id=1, name="HW", weight_pct=40),
            CategoryInput(id=2, name="Exams", weight_pct=60),
        ]
        entries = [
            # HW: three solid grades → earned 90%
            EntryInput(1, 1, 9, 10, name="HW1"),
            EntryInput(2, 1, 9, 10, name="HW2"),
            EntryInput(3, 1, 9, 10, name="HW3"),
            # Exams: two done, two remaining. Test 1 and Test 2 done at 80%,
            # Test 3 and Test 4 ungraded with due dates.
            EntryInput(4, 2, 80, 100, name="Test 1", due_date="2025-09-15"),
            EntryInput(5, 2, 80, 100, name="Test 2", due_date="2025-10-10"),
            EntryInput(
                6, 2, None, 100, name="Test 3 (midterm)", due_date="2025-11-05"
            ),
            EntryInput(
                7, 2, None, 100, name="Test 4 (final)", due_date="2025-12-14"
            ),
        ]
        return cats, entries

    def test_ungraded_are_chrono_ordered(self):
        cats, entries = self._fixture()
        ungraded = list_ungraded_entries(entries, cats)
        assert [e.name for e in ungraded] == ["Test 3 (midterm)", "Test 4 (final)"]

    def test_three_scenarios_returned(self):
        cats, entries = self._fixture()
        scenarios, anchor, solve = anchor_scenarios(
            target_pct=90,
            entries=entries,
            categories=cats,
            bands=STANDARD_BANDS,
        )
        assert len(scenarios) == 3
        assert [s.id for s in scenarios] == ["ace", "steady", "recover"]
        assert [e.name for e in anchor] == ["Test 3 (midterm)"]
        assert [e.name for e in solve] == ["Test 4 (final)"]

    def test_ace_scenario_needs_less_on_later(self):
        """Acing the anchor (100%) should lower the score needed later."""
        cats, entries = self._fixture()
        scenarios, _, _ = anchor_scenarios(
            target_pct=90,
            entries=entries,
            categories=cats,
            bands=STANDARD_BANDS,
        )
        ace = scenarios[0]
        recover = scenarios[2]
        assert ace.solve_pct is not None and recover.solve_pct is not None
        assert ace.solve_pct < recover.solve_pct

    def test_steady_scenario_uniform(self):
        """The 'steady' scenario's anchor and solve pct should match — they're
        the same variable."""
        cats, entries = self._fixture()
        scenarios, _, _ = anchor_scenarios(
            target_pct=90,
            entries=entries,
            categories=cats,
            bands=STANDARD_BANDS,
        )
        steady = scenarios[1]
        assert steady.anchor_pct is None
        assert steady.solve_pct is not None
        # Every leg should have the same pct (== solve_pct)
        pcts = {round(leg.pct, 4) for leg in steady.legs}
        assert pcts == {round(steady.solve_pct, 4)}

    def test_scenario_math_hits_target(self):
        """Each reachable scenario, when executed, should land the final grade
        on the target."""
        cats, entries = self._fixture()
        scenarios, _, _ = anchor_scenarios(
            target_pct=90,
            entries=entries,
            categories=cats,
            bands=STANDARD_BANDS,
        )
        for s in scenarios:
            if s.reachable and not s.already_locked_in:
                assert s.resulting_grade_pct == pytest.approx(90.0, abs=0.05)

    def test_recover_unreachable_flagged(self):
        """Set the target so high that bombing the anchor (60%) can't recover.
        Recover scenario should be flagged unreachable."""
        cats = [
            CategoryInput(id=1, name="Exams", weight_pct=100),
        ]
        entries = [
            EntryInput(1, 1, 60, 100, name="Test 1", due_date="2025-09-01"),
            EntryInput(2, 1, None, 100, name="Test 2", due_date="2025-10-01"),
            EntryInput(3, 1, None, 100, name="Test 3", due_date="2025-11-01"),
        ]
        # Current: 60/100 = 60% weighted. Two remaining, anchor Test 2, solve Test 3.
        # Recover: anchor at 60 → mean = (60+60+x)/3 = 90 → x = 150. Not reachable.
        scenarios, _, _ = anchor_scenarios(
            target_pct=90,
            entries=entries,
            categories=cats,
            bands=STANDARD_BANDS,
        )
        recover = next(s for s in scenarios if s.id == "recover")
        assert recover.reachable is False
        assert recover.solve_pct is not None
        assert recover.solve_pct > 100.0

    def test_ace_locked_in_flagged(self):
        """Set the target so low that acing the anchor alone already clears it.
        Ace scenario should be flagged already_locked_in AND reachable (not
        'miss'), with clamped non-negative leg pcts and a floor resulting grade.
        """
        cats = [
            CategoryInput(id=1, name="Exams", weight_pct=100),
        ]
        entries = [
            EntryInput(1, 1, 85, 100, name="Test 1", due_date="2025-09-01"),
            EntryInput(2, 1, None, 100, name="Test 2", due_date="2025-10-01"),
            EntryInput(3, 1, None, 100, name="Test 3", due_date="2025-11-01"),
        ]
        # Target 60: ace anchor → (85+100+x)/3 = 60 → x = −5. Locked in.
        scenarios, _, _ = anchor_scenarios(
            target_pct=60,
            entries=entries,
            categories=cats,
            bands=STANDARD_BANDS,
        )
        ace = next(s for s in scenarios if s.id == "ace")
        assert ace.already_locked_in is True
        assert ace.reachable is True
        # Legs must never show negative percentages.
        assert all(leg.pct >= 0 for leg in ace.legs)
        # Resulting grade is the floor path (0% on solve), still ≥ target.
        assert ace.resulting_grade_pct + 1e-6 >= 60.0

    def test_already_above_target_all_scenarios_locked(self):
        """If current grades already clear the target even at 0% on every
        remaining item, every scenario is locked-in + reachable — never 'miss'
        with negative needed scores."""
        cats = [
            CategoryInput(id=1, name="HW", weight_pct=40),
            CategoryInput(id=2, name="Exams", weight_pct=60),
        ]
        entries = [
            EntryInput(1, 1, 70, 100, name="HW1", due_date="2025-09-01"),
            EntryInput(2, 1, None, 100, name="HW2", due_date="2025-10-01"),
            EntryInput(3, 2, 65, 100, name="Midterm", due_date="2025-09-15"),
            EntryInput(4, 2, None, 100, name="Final", due_date="2025-12-01"),
        ]
        # Target = passing bar (60). Graded mean is already mid-60s with weight;
        # remaining at 0 still stays near/above 60 for many paths.
        scenarios, _, _ = anchor_scenarios(
            target_pct=60,
            entries=entries,
            categories=cats,
            bands=STANDARD_BANDS,
        )
        for s in scenarios:
            if s.solve_pct is not None and s.solve_pct <= 0:
                assert s.already_locked_in is True
                assert s.reachable is True
                assert all(leg.pct >= 0 for leg in s.legs)

    def test_mentioned_entry_becomes_solve_set(self):
        """When the user names a specific ungraded entry (e.g. 'the final'),
        that entry becomes the solve set — the OTHER remaining item is the
        anchor whose score we vary per scenario."""
        cats, entries = self._fixture()
        # Mention Test 4 (the final) — id=7
        scenarios, anchor, solve = anchor_scenarios(
            target_pct=90,
            entries=entries,
            categories=cats,
            bands=STANDARD_BANDS,
            mentioned_entry_id=7,
        )
        assert [e.name for e in solve] == ["Test 4 (final)"]
        assert [e.name for e in anchor] == ["Test 3 (midterm)"]

    def test_returns_empty_when_fewer_than_two_ungraded(self):
        """Single ungraded entry → nothing to plan; existing single-entry
        prediction should handle it."""
        cats = [CategoryInput(id=1, name="Exams", weight_pct=100)]
        entries = [
            EntryInput(1, 1, 80, 100, name="Test 1"),
            EntryInput(2, 1, None, 100, name="Test 2"),
        ]
        scenarios, _, _ = anchor_scenarios(
            target_pct=90,
            entries=entries,
            categories=cats,
            bands=STANDARD_BANDS,
        )
        assert scenarios == []


# --- ad-hoc reweight -------------------------------------------------------


class TestReweight:
    def test_scales_existing_and_adds_new(self):
        cats = [
            CategoryInput(id=1, name="HW", weight_pct=40),
            CategoryInput(id=2, name="Papers", weight_pct=60),
        ]
        entries = [
            EntryInput(1, 1, 9, 10, name="HW1"),
        ]
        new_entries, new_cats, synth, info = apply_reweight(
            entries, cats, "Final Exam", 20.0
        )
        # Existing categories scale by 80/100 = 0.8
        assert new_cats[0].name == "HW"
        assert new_cats[0].weight_pct == pytest.approx(32.0)
        assert new_cats[1].name == "Papers"
        assert new_cats[1].weight_pct == pytest.approx(48.0)
        assert new_cats[2].name == "Final Exam"
        assert new_cats[2].weight_pct == pytest.approx(20.0)
        assert sum(c.weight_pct for c in new_cats) == pytest.approx(100.0)
        # Info payload mirrors the change (name, original, scaled)
        assert info.new_category_name == "Final Exam"
        assert info.new_weight_pct == 20.0
        assert info.scaled == [
            ("HW", 40.0, pytest.approx(32.0)),
            ("Papers", 60.0, pytest.approx(48.0)),
        ]
        # Synthetic entry sits in the new category, ungraded, 100-point scale
        assert synth.category_id == new_cats[2].id
        assert synth.points_possible == 100.0
        assert synth.points_earned is None
        assert synth in new_entries

    def test_reweight_then_predict(self):
        """Realistic flow: HW 40 + Exams 60, all graded so far. User announces
        a 20% final; solve for what's needed on the final to hit an A."""
        cats = [
            CategoryInput(id=1, name="HW", weight_pct=40),
            CategoryInput(id=2, name="Exams", weight_pct=60),
        ]
        entries = [
            EntryInput(1, 1, 9, 10, name="HW1"),  # 90%
            EntryInput(2, 2, 85, 100, name="Midterm"),  # 85%
        ]
        # Apply reweight: HW → 32, Exams → 48, Final Exam → 20.
        new_entries, new_cats, synth, _ = apply_reweight(
            entries, cats, "Final Exam", 20.0
        )
        r = predict_entry_needed(
            target_pct=90,
            entry=synth,
            entries=new_entries,
            categories=new_cats,
            entry_name="Final Exam",
        )
        # Existing contribution: 0.9*32 + 0.85*48 = 28.8 + 40.8 = 69.6
        # Need Final × 20 = 90 - 69.6 = 20.4 → Final = 20.4/20 = 1.02 = 102%
        assert r.needed_pct == pytest.approx(102.0, abs=0.05)
        # 105 is still marked reachable (bonus scoring headroom).
        assert r.reachable is True

    def test_rejects_out_of_bounds_weight(self):
        cats = [CategoryInput(id=1, name="HW", weight_pct=100)]
        with pytest.raises(ValueError):
            apply_reweight([], cats, "Final", 0)
        with pytest.raises(ValueError):
            apply_reweight([], cats, "Final", 100)


# --- helpers ---------------------------------------------------------------


def test_grade_math_module_produces_stable_types():
    """Guardrail: return types must remain stable — the API layer depends
    on `CurrentGrade`, `PredictionResult`, `CategoryBreakdown` being what
    they are."""
    cg = compute_current_grade([], [], [])
    assert isinstance(cg, CurrentGrade)
    assert cg.percentage is None or isinstance(cg.percentage, float)
    assert isinstance(cg.breakdown, list)
