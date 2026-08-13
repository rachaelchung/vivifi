"""Grade math engine.

SPEC §Grade Math Semantics — every formula in this module is covered by unit
tests. The math is intentionally decoupled from SQLAlchemy models: callers
pass plain dataclasses (`CategoryInput`, `EntryInput`, `ScaleBand`) so the
module can be unit-tested without a DB.

Conventions:

- Internally, all "earned" and "target" quantities are **fractions** in
  `[0.0, ∞)` (0.87 for 87%, 1.05 for 105% via bonus). Only at the API boundary
  do we multiply by 100 to render percentages.
- `weight_pct` on a category is 0-100 (as stored). We convert to fractions
  internally by dividing by 100.
- "Percentage" outputs from public helpers are always 0-100+ floats.

Extra credit handling (SPEC-exact):

- **Normal entries** (`points_possible > 0`): ratio = `points_earned / points_possible`.
  A ratio > 1 (bonus scoring) pulls the category up naturally — no special case.
- **Pure extra credit** (`points_possible == 0` and `points_earned > 0`):
  excluded from the mean-of-ratios, added as a **flat bonus** scaled such that
  1 EC point ≈ `1 / typical_points_possible` boost to `earned_c` (where
  `typical_points_possible` is the mean `points_possible` across normal entries
  in the same category — or 100 if the category has no normal entries).

`drop_lowest_n` on a category drops the lowest-scoring graded normal entries
(by ratio) before the category mean is taken. Pure extra-credit rows are never
dropped. If every graded normal is dropped, the category contributes only via
remaining EC (or is treated as ungraded when none remain).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


# --- inputs (plain dataclasses — no ORM coupling) --------------------------


@dataclass(frozen=True)
class EntryInput:
    """A single gradebook entry as far as the math engine is concerned.

    `name` and `due_date` are only used for scenario ordering / display and
    do not affect any percentage math.
    """

    id: int
    category_id: int | None
    points_earned: float | None  # None = not yet graded
    points_possible: float
    hidden: bool = False
    name: str = ""
    # ISO date string (YYYY-MM-DD) for chronological ordering, or None. String
    # keeps the module dependency-free; comparisons still sort correctly.
    due_date: str | None = None


@dataclass(frozen=True)
class CategoryInput:
    id: int
    name: str
    weight_pct: float  # 0-100
    drop_lowest_n: int = 0


@dataclass(frozen=True)
class ScaleBand:
    letter: str
    min_pct: float  # 0-100


# --- outputs ---------------------------------------------------------------


@dataclass(frozen=True)
class CategoryBreakdown:
    category_id: int
    name: str
    weight_pct: float
    earned_pct: float | None  # None when no graded entries in the category
    has_grades: bool


@dataclass(frozen=True)
class CurrentGrade:
    """Result of `compute_current_grade`.

    `percentage` is None until at least one category has a graded entry; that's
    intentional so early-semester numbers aren't misleading.
    """

    percentage: float | None  # 0-100+, or None if no grades yet
    letter: str | None  # matched against the course's scale, or None
    breakdown: list[CategoryBreakdown]


@dataclass(frozen=True)
class PredictionResult:
    """Result of a prediction call — always structured, never prose."""

    # Percent required on the target (0-100+, may exceed 100 = unreachable).
    # Present even when unreachable so the UI can say "you'd need 108%".
    needed_pct: float | None
    # For entry-level predictions: the raw points needed (out of the entry's
    # `points_possible`). None for category-level predictions or when the
    # target is a pure-EC entry.
    needed_points: float | None
    reachable: bool
    already_locked_in: bool
    explanation: str


# --- category earned computation -------------------------------------------


def compute_category_earned(
    entries: Iterable[EntryInput],
    *,
    drop_lowest_n: int = 0,
) -> float | None:
    """Return `earned_c` as a fraction (0.0-∞) or None if no graded entries.

    Skips hidden and ungraded entries. Drops the lowest `drop_lowest_n` graded
    normal entries (by ratio) before averaging. Handles both extra-credit
    flavors per SPEC §Grade Math Semantics.
    """
    normal_graded: list[EntryInput] = []
    ec_graded: list[EntryInput] = []
    for e in entries:
        if e.hidden or e.points_earned is None:
            continue
        if e.points_possible > 0:
            normal_graded.append(e)
        elif e.points_earned > 0:
            # Pure extra-credit row (0 possible, some earned)
            ec_graded.append(e)
        # points_possible == 0 and points_earned == 0 → contributes nothing.

    # typical_pp is measured against the full graded-normal set (pre-drop) so
    # EC scaling stays stable when drop_lowest removes rows.
    if normal_graded:
        typical_pp = sum(e.points_possible for e in normal_graded) / len(normal_graded)
    else:
        typical_pp = 100.0

    if drop_lowest_n > 0 and normal_graded:
        normal_graded = sorted(
            normal_graded,
            key=lambda e: (e.points_earned or 0) / e.points_possible,
        )
        drop = min(drop_lowest_n, len(normal_graded))
        normal_graded = normal_graded[drop:]

    if not normal_graded and not ec_graded:
        return None

    if normal_graded:
        base = sum(e.points_earned / e.points_possible for e in normal_graded) / len(  # type: ignore[operator]
            normal_graded
        )
    else:
        # Every normal was dropped (or none existed) — category is EC-only.
        base = 0.0

    ec_bonus = 0.0
    if ec_graded and typical_pp > 0:
        ec_bonus = sum(e.points_earned or 0 for e in ec_graded) / typical_pp

    return base + ec_bonus


def _entries_for_category(
    entries: Iterable[EntryInput], category_id: int
) -> list[EntryInput]:
    return [e for e in entries if e.category_id == category_id]


# --- current grade ---------------------------------------------------------


def compute_current_grade(
    entries: Iterable[EntryInput],
    categories: Iterable[CategoryInput],
    bands: Iterable[ScaleBand],
) -> CurrentGrade:
    """SPEC §Current grade — weighted average over graded categories only."""

    entries_list = list(entries)
    breakdown: list[CategoryBreakdown] = []

    numerator = 0.0
    weight_of_graded = 0.0

    for cat in categories:
        cat_entries = _entries_for_category(entries_list, cat.id)
        earned = compute_category_earned(
            cat_entries, drop_lowest_n=cat.drop_lowest_n
        )
        has_grades = earned is not None

        if has_grades:
            numerator += earned * cat.weight_pct  # type: ignore[operator]
            weight_of_graded += cat.weight_pct

        breakdown.append(
            CategoryBreakdown(
                category_id=cat.id,
                name=cat.name,
                weight_pct=cat.weight_pct,
                earned_pct=(earned * 100.0) if earned is not None else None,
                has_grades=has_grades,
            )
        )

    if weight_of_graded == 0:
        return CurrentGrade(percentage=None, letter=None, breakdown=breakdown)

    # numerator here is Σ(earned_fraction × weight_pct). Divide by Σweight_pct
    # to get a weighted-mean fraction, then × 100 for percentage.
    percentage = (numerator / weight_of_graded) * 100.0
    letter = letter_for(percentage, bands)
    return CurrentGrade(percentage=percentage, letter=letter, breakdown=breakdown)


# --- target + letter resolution --------------------------------------------


def resolve_target(target: str | float, bands: Iterable[ScaleBand]) -> float | None:
    """Resolve a target into a percentage.

    Numeric targets (`90`, `88.5`, or numeric-in-a-string `"90"`) are returned
    as-is. Letter targets (`"A"`, `"A-"`) resolve to their band's `min_pct`
    by **exact** letter match — a "+/-" school student who wants the A- bar
    types `"A-"` explicitly (SPEC).

    Returns None if the input is a letter that doesn't match any band.
    """
    if isinstance(target, (int, float)):
        return float(target)

    s = str(target).strip()
    if not s:
        return None

    # Try numeric first — supports "90", "88.5", " 92 ".
    try:
        return float(s)
    except ValueError:
        pass

    # Exact letter match against the band list.
    for band in bands:
        if band.letter == s:
            return band.min_pct
    return None


def resolve_passing_pct(bands: Iterable[ScaleBand]) -> float | None:
    """Return the min_pct of the lowest non-F band — the "passing" threshold.

    "F variants" (F, F+, F-, Fail, …) and empty letters are excluded. A band
    at 0% that isn't clearly a letter grade is also skipped so a malformed
    syllabus scale can't collapse "passing" to 0%. If nothing qualifies,
    returns None so the caller can degrade gracefully.
    """
    ordered = sorted(bands, key=lambda b: b.min_pct)
    for b in ordered:
        letter = (b.letter or "").strip().upper()
        if not letter or letter.startswith("F"):
            continue
        # A 0% non-F band is almost certainly a mis-extracted "fail"/NC row.
        if b.min_pct <= 0:
            continue
        return b.min_pct
    return None


def letter_for(percentage: float, bands: Iterable[ScaleBand]) -> str | None:
    """Return the letter for a given percentage.

    Walks bands by `min_pct` descending and returns the first band whose
    `min_pct <= percentage`. Returns None if the scale doesn't cover this
    number (shouldn't happen for a well-formed scale that includes an F band
    at 0).
    """
    ordered = sorted(bands, key=lambda b: b.min_pct, reverse=True)
    for band in ordered:
        if percentage >= band.min_pct:
            return band.letter
    return None


# --- prediction ------------------------------------------------------------


def _sum_other_weighted_earned(
    entries: list[EntryInput],
    categories: list[CategoryInput],
    exclude_category_id: int,
) -> tuple[float, list[CategoryInput]]:
    """Sum `earned_c × weight_c` for all categories except the excluded one.

    Returns `(sum_as_fraction_of_100, ungraded_categories)`. Ungraded means
    the category has no graded entries — the caller decides whether to treat
    that as an error or fill with an assumption.
    """
    total = 0.0
    ungraded: list[CategoryInput] = []
    for c in categories:
        if c.id == exclude_category_id:
            continue
        earned = compute_category_earned(
            _entries_for_category(entries, c.id),
            drop_lowest_n=c.drop_lowest_n,
        )
        if earned is None:
            ungraded.append(c)
            continue
        # `earned * weight_pct` where earned is fraction and weight_pct is
        # 0-100 → contributes points-out-of-100 directly to the final grade.
        total += earned * c.weight_pct
    return total, ungraded


def predict_category_needed(
    target_pct: float,
    target_category_id: int,
    entries: Iterable[EntryInput],
    categories: Iterable[CategoryInput],
) -> PredictionResult:
    """SPEC §Prediction — what average does `target_category` need to hit `target_pct`?

    Assumes all other categories finish at their current earned. If any other
    category is ungraded, returns a helpful "need more grades" message rather
    than guessing.
    """
    entries_list = list(entries)
    cats = list(categories)
    target_cat = next((c for c in cats if c.id == target_category_id), None)
    if target_cat is None:
        return PredictionResult(
            needed_pct=None,
            needed_points=None,
            reachable=False,
            already_locked_in=False,
            explanation="That category doesn't exist on this course.",
        )
    if target_cat.weight_pct <= 0:
        return PredictionResult(
            needed_pct=None,
            needed_points=None,
            reachable=False,
            already_locked_in=False,
            explanation=(
                f"{target_cat.name} has 0% weight — it can't affect the grade."
            ),
        )

    sum_other, ungraded_other = _sum_other_weighted_earned(
        entries_list, cats, target_category_id
    )
    if ungraded_other:
        names = ", ".join(c.name for c in ungraded_other)
        return PredictionResult(
            needed_pct=None,
            needed_points=None,
            reachable=False,
            already_locked_in=False,
            explanation=(
                f"Need at least one grade in {names} before I can predict."
            ),
        )

    # SPEC formula, in units where target_pct is a percent (0-100) and
    # earned × weight is (fraction × percent) which is also percent-points.
    #   needed_x_fraction × weight_pct_x = target_pct − sum_other
    # ⇒ needed_x_fraction = (target_pct − sum_other) / weight_pct_x
    needed_frac = (target_pct - sum_other) / target_cat.weight_pct
    needed_pct = needed_frac * 100.0

    if needed_pct <= 0:
        return PredictionResult(
            needed_pct=needed_pct,
            needed_points=None,
            reachable=True,
            already_locked_in=True,
            explanation=(
                f"Locked in — even a 0 in {target_cat.name} keeps you at or "
                f"above {_fmt_pct(target_pct)}."
            ),
        )
    if needed_pct > 100.0 + 1e-6:
        return PredictionResult(
            needed_pct=needed_pct,
            needed_points=None,
            reachable=False,
            already_locked_in=False,
            explanation=(
                f"{_fmt_pct(target_pct)} isn't reachable — you'd need "
                f"{_fmt_pct(needed_pct)} in {target_cat.name}."
            ),
        )
    return PredictionResult(
        needed_pct=needed_pct,
        needed_points=None,
        reachable=True,
        already_locked_in=False,
        explanation=(
            f"You need {_fmt_pct(needed_pct)} in {target_cat.name} to hit "
            f"{_fmt_pct(target_pct)}."
        ),
    )


def predict_entry_needed(
    target_pct: float,
    entry: EntryInput,
    entries: Iterable[EntryInput],
    categories: Iterable[CategoryInput],
    entry_name: str = "this entry",
) -> PredictionResult:
    """What score on a specific ungraded entry hits `target_pct`?

    Assumes `entry` is the only ungraded normal entry in its category (all
    others in the category are graded or are ignored). Ungraded entries in
    OTHER categories still trigger the "need more grades" fallback via
    `predict_category_needed`.
    """
    entries_list = list(entries)
    cats = list(categories)

    if entry.category_id is None:
        return PredictionResult(
            needed_pct=None,
            needed_points=None,
            reachable=False,
            already_locked_in=False,
            explanation=(
                "This entry isn't in any grade category yet — assign it to "
                "one first."
            ),
        )
    if entry.points_possible <= 0:
        # Pure-EC entry — you don't "get an A on the extra credit", so we
        # can't answer meaningfully. Return a friendly note.
        return PredictionResult(
            needed_pct=None,
            needed_points=None,
            reachable=False,
            already_locked_in=False,
            explanation=(
                "This is a pure extra-credit entry (0 points possible), so "
                "any positive score helps but there's no fixed number to hit."
            ),
        )

    target_cat = next((c for c in cats if c.id == entry.category_id), None)
    if target_cat is None:
        return PredictionResult(
            needed_pct=None,
            needed_points=None,
            reachable=False,
            already_locked_in=False,
            explanation="This entry's category doesn't exist.",
        )
    if target_cat.weight_pct <= 0:
        return PredictionResult(
            needed_pct=None,
            needed_points=None,
            reachable=False,
            already_locked_in=False,
            explanation=(
                f"{target_cat.name} has 0% weight — it can't affect the grade."
            ),
        )

    sum_other, ungraded_other = _sum_other_weighted_earned(
        entries_list, cats, target_cat.id
    )
    if ungraded_other:
        names = ", ".join(c.name for c in ungraded_other)
        return PredictionResult(
            needed_pct=None,
            needed_points=None,
            reachable=False,
            already_locked_in=False,
            explanation=(
                f"Need at least one grade in {names} before I can predict."
            ),
        )

    # Everything except this entry (and hidden entries) inside the target
    # category — solve for the ratio r on `entry` that makes the category's
    # earned_c hit `needed_earned_cat`.
    cat_entries = [e for e in entries_list if e.category_id == target_cat.id]
    other_normal = [
        e
        for e in cat_entries
        if e.id != entry.id
        and not e.hidden
        and e.points_earned is not None
        and e.points_possible > 0
    ]
    other_ec = [
        e
        for e in cat_entries
        if e.id != entry.id
        and not e.hidden
        and e.points_earned is not None
        and e.points_possible == 0
        and (e.points_earned or 0) > 0
    ]

    needed_earned_cat = (target_pct - sum_other) / target_cat.weight_pct
    # Fold entry.points_possible into typical_pp so the EC scaling is stable
    # even in "this entry is the only normal in its category" scenarios.
    normal_pps = [e.points_possible for e in other_normal] + [entry.points_possible]
    typical_pp = sum(normal_pps) / len(normal_pps) if normal_pps else 100.0
    ec_bonus = (
        sum(e.points_earned or 0 for e in other_ec) / typical_pp
        if typical_pp > 0
        else 0.0
    )
    sum_other_ratios = sum(
        e.points_earned / e.points_possible for e in other_normal  # type: ignore[operator]
    )
    n = len(other_normal) + 1  # +1 for the entry we're solving

    # `mean(ratios) + ec_bonus = needed_earned_cat`
    # (sum_other_ratios + r_x) / n + ec_bonus = needed_earned_cat
    r_x = (needed_earned_cat - ec_bonus) * n - sum_other_ratios
    needed_pct = r_x * 100.0
    needed_points = r_x * entry.points_possible

    tolerance = 1e-6
    if needed_pct <= tolerance:
        return PredictionResult(
            needed_pct=needed_pct,
            needed_points=needed_points,
            reachable=True,
            already_locked_in=True,
            explanation=(
                f"Locked in — even a 0 on {entry_name} keeps you at or above "
                f"{_fmt_pct(target_pct)}."
            ),
        )
    # Allow slight bonus scoring (up to 105%) as reachable.
    if needed_pct > 100.0 + 5.0 + tolerance:
        return PredictionResult(
            needed_pct=needed_pct,
            needed_points=needed_points,
            reachable=False,
            already_locked_in=False,
            explanation=(
                f"{_fmt_pct(target_pct)} isn't reachable — you'd need "
                f"{_fmt_pct(needed_pct)} on {entry_name}."
            ),
        )
    return PredictionResult(
        needed_pct=needed_pct,
        needed_points=needed_points,
        reachable=True,
        already_locked_in=False,
        explanation=(
            f"You need {_fmt_points(needed_points, entry.points_possible)} "
            f"({_fmt_pct(needed_pct)}) on {entry_name} to hit "
            f"{_fmt_pct(target_pct)}."
        ),
    )


# --- scenario planning -----------------------------------------------------


@dataclass(frozen=True)
class ScenarioLeg:
    """One item's assumed score within a scenario. Both anchor and solve
    items are surfaced so the UI can render an unambiguous per-item plan."""

    entry_id: int
    entry_name: str
    role: str  # "anchor" | "solve"
    pct: float  # 0-100+, the assumed score for this item in this scenario


@dataclass(frozen=True)
class Scenario:
    """One row of a scenarios table."""

    id: str  # "ace" | "steady" | "recover"
    label: str
    description: str
    anchor_pct: float | None  # None for the "steady" scenario (anchor == solve)
    solve_pct: float | None  # what's needed on the solve set; None if no solve set
    resulting_grade_pct: float
    resulting_letter: str | None
    reachable: bool
    already_locked_in: bool
    legs: list[ScenarioLeg]


def list_ungraded_entries(
    entries: Iterable[EntryInput],
    categories: Iterable[CategoryInput],
) -> list[EntryInput]:
    """Return unhidden, ungraded, normal-scoring entries in chronological order.

    "Ungraded" = points_earned is None. Pure extra credit (points_possible = 0)
    is excluded — there's no meaningful "score needed" on a 0-point item.
    Only entries in a real weighted category are considered.
    """
    valid_cat_ids = {c.id for c in categories if c.weight_pct > 0}
    ungraded = [
        e
        for e in entries
        if e.points_earned is None
        and not e.hidden
        and e.points_possible > 0
        and e.category_id in valid_cat_ids
    ]
    # Sort: earliest due date first; entries without a due date come last so a
    # "next test" anchor never picks a dateless row over a real one; then id
    # as a stable tiebreaker.
    ungraded.sort(key=lambda e: (e.due_date is None, e.due_date or "", e.id))
    return ungraded


def _category_stats(
    entries: list[EntryInput], categories: list[CategoryInput]
) -> dict[int, dict]:
    """Precompute per-category numbers used by the scenario solver.

    Returns a dict keyed by category_id with:
      - N: total normal entries (points_possible > 0), including ungraded
      - graded_ratio_sum: Σ ratios over graded normal entries
      - ec_bonus: pure-EC contribution to earned_c (fraction)
      - weight_pct: category weight

    Categories with weight_pct == 0 are skipped (they don't affect the grade).
    """
    out: dict[int, dict] = {}
    for c in categories:
        if c.weight_pct <= 0:
            continue
        cat_entries = [e for e in entries if e.category_id == c.id and not e.hidden]
        normals = [e for e in cat_entries if e.points_possible > 0]
        graded_normals = [e for e in normals if e.points_earned is not None]
        # Mirror compute_category_earned: drop the lowest graded ratios first.
        drop_applied = min(max(c.drop_lowest_n, 0), len(graded_normals))
        if drop_applied:
            graded_normals = sorted(
                graded_normals,
                key=lambda e: (e.points_earned or 0) / e.points_possible,
            )[drop_applied:]
        graded_ratio_sum = sum(
            e.points_earned / e.points_possible for e in graded_normals  # type: ignore[operator]
        )
        typical_pp = (
            sum(e.points_possible for e in normals) / len(normals) if normals else 100.0
        )
        ec_graded = [
            e
            for e in cat_entries
            if e.points_possible == 0
            and e.points_earned is not None
            and (e.points_earned or 0) > 0
        ]
        ec_bonus = (
            sum(e.points_earned or 0 for e in ec_graded) / typical_pp
            if typical_pp > 0
            else 0.0
        )
        out[c.id] = {
            # Effective slot count after drops (kept graded + still-ungraded).
            "N": len(normals) - drop_applied,
            "graded_ratio_sum": graded_ratio_sum,
            "ec_bonus": ec_bonus,
            "weight_pct": c.weight_pct,
        }
    return out


def _solve_uniform(
    target_pct: float,
    stats: dict[int, dict],
    anchor_entries: list[EntryInput],
    solve_entries: list[EntryInput],
    anchor_pct: float,
) -> float | None:
    """Solve for the uniform pct on `solve_entries` such that the final grade
    equals `target_pct`, given all `anchor_entries` are set to `anchor_pct`.

    All math is linear in `x` (the solve pct). Returns None if the coefficient
    of x is zero (no leverage on the target) — the caller handles that.
    """
    total_weight = sum(s["weight_pct"] for s in stats.values())
    if total_weight <= 0:
        return None

    # Baseline "percent-point" contribution from graded entries + EC bonuses.
    base = 0.0
    for s in stats.values():
        if s["N"] == 0:
            # Category has no normal entries at all — earned_c is just ec_bonus.
            base += s["ec_bonus"] * s["weight_pct"]
        else:
            base += (
                s["graded_ratio_sum"] / s["N"] + s["ec_bonus"]
            ) * s["weight_pct"]

    coef_anchor = 0.0
    for e in anchor_entries:
        s = stats.get(e.category_id or -1)
        if s and s["N"] > 0:
            coef_anchor += s["weight_pct"] / (100.0 * s["N"])

    coef_solve = 0.0
    for e in solve_entries:
        s = stats.get(e.category_id or -1)
        if s and s["N"] > 0:
            coef_solve += s["weight_pct"] / (100.0 * s["N"])

    if coef_solve == 0:
        return None

    # target_pct = (base + coef_anchor * anchor_pct + coef_solve * x) / total_weight * 100
    # ⇒ x = (target_pct * total_weight / 100 - base - coef_anchor * anchor_pct) / coef_solve
    return (
        (target_pct * total_weight / 100.0) - base - coef_anchor * anchor_pct
    ) / coef_solve


def _grade_at(
    stats: dict[int, dict],
    anchor_entries: list[EntryInput],
    solve_entries: list[EntryInput],
    anchor_pct: float,
    solve_pct: float,
    bands: list[ScaleBand],
) -> tuple[float, str | None]:
    """Compute the final grade percentage + letter given assumed anchor/solve
    scores. Uses the same linear formula the solver uses (so it round-trips)."""
    total_weight = sum(s["weight_pct"] for s in stats.values())
    if total_weight <= 0:
        return 0.0, None
    base = 0.0
    for s in stats.values():
        if s["N"] == 0:
            base += s["ec_bonus"] * s["weight_pct"]
        else:
            base += (s["graded_ratio_sum"] / s["N"] + s["ec_bonus"]) * s["weight_pct"]
    for e in anchor_entries:
        s = stats.get(e.category_id or -1)
        if s and s["N"] > 0:
            base += (anchor_pct / 100.0) * s["weight_pct"] / s["N"]
    for e in solve_entries:
        s = stats.get(e.category_id or -1)
        if s and s["N"] > 0:
            base += (solve_pct / 100.0) * s["weight_pct"] / s["N"]
    pct = base / total_weight * 100.0
    return pct, letter_for(pct, bands)


# Anchor score levels. Chosen for readable stories: "if you ace it", "steady",
# "if you struggle". Tuned so most students see three genuinely different
# solve numbers rather than three near-duplicates.
_ACE_PCT = 100.0
_RECOVER_PCT = 60.0


def anchor_scenarios(
    target_pct: float,
    entries: Iterable[EntryInput],
    categories: Iterable[CategoryInput],
    bands: Iterable[ScaleBand],
    mentioned_entry_id: int | None = None,
) -> tuple[list[Scenario], list[EntryInput], list[EntryInput]]:
    """Generate an anchor-scenarios table for multi-item prediction.

    Split rule (per the "chrono-nearest anchor" design decision):
      - If `mentioned_entry_id` names an ungraded entry, that's the solve set
        and every OTHER remaining ungraded entry is an anchor.
      - Otherwise the chrono-nearest ungraded entry is the anchor and every
        other remaining ungraded entry is the solve set.

    Returns (scenarios, anchor_entries, solve_entries). If there are 0 or 1
    ungraded entries there's nothing to plan — returns ([], [], []).
    """
    ent_list = list(entries)
    cat_list = list(categories)
    band_list = list(bands)
    ungraded = list_ungraded_entries(ent_list, cat_list)
    if len(ungraded) < 2:
        return [], [], []

    if mentioned_entry_id is not None and any(
        e.id == mentioned_entry_id for e in ungraded
    ):
        solve_entries = [e for e in ungraded if e.id == mentioned_entry_id]
        anchor_entries = [e for e in ungraded if e.id != mentioned_entry_id]
    else:
        anchor_entries = [ungraded[0]]
        solve_entries = ungraded[1:]

    if not anchor_entries or not solve_entries:
        return [], [], []

    stats = _category_stats(ent_list, cat_list)

    anchor_display = _join_names(anchor_entries)
    solve_display = _join_names(solve_entries)

    scenarios: list[Scenario] = []

    # 1. Ace the anchor
    x = _solve_uniform(target_pct, stats, anchor_entries, solve_entries, _ACE_PCT)
    scenarios.append(
        _build_scenario(
            id_="ace",
            label=f"Ace {anchor_display}",
            description=(
                f"If you get {_fmt_pct(_ACE_PCT)} on {anchor_display}, you'd need "
                f"{_needed_str(x, solve_display)} to hit {_fmt_pct(target_pct)}."
            ),
            anchor_pct=_ACE_PCT,
            solve_pct=x,
            anchor_entries=anchor_entries,
            solve_entries=solve_entries,
            stats=stats,
            bands=band_list,
            target_pct=target_pct,
        )
    )

    # 2. Steady across the board — anchor == solve == same variable
    steady = _solve_uniform(target_pct, stats, [], anchor_entries + solve_entries, 0.0)
    scenarios.append(
        _build_scenario(
            id_="steady",
            label="Steady across the board",
            description=(
                f"Get {_needed_str(steady, 'every remaining item')} to hit "
                f"{_fmt_pct(target_pct)}."
            ),
            anchor_pct=None,
            solve_pct=steady,
            anchor_entries=[],  # legs will list all remaining as solve@steady
            solve_entries=anchor_entries + solve_entries,
            stats=stats,
            bands=band_list,
            target_pct=target_pct,
        )
    )

    # 3. Recover — anchor at low score, solve for what covers you
    x = _solve_uniform(target_pct, stats, anchor_entries, solve_entries, _RECOVER_PCT)
    scenarios.append(
        _build_scenario(
            id_="recover",
            label=f"If you struggle on {anchor_display}",
            description=(
                f"If you get {_fmt_pct(_RECOVER_PCT)} on {anchor_display}, you'd "
                f"need {_needed_str(x, solve_display)} to still hit "
                f"{_fmt_pct(target_pct)}."
            ),
            anchor_pct=_RECOVER_PCT,
            solve_pct=x,
            anchor_entries=anchor_entries,
            solve_entries=solve_entries,
            stats=stats,
            bands=band_list,
            target_pct=target_pct,
        )
    )

    return scenarios, anchor_entries, solve_entries


def _build_scenario(
    *,
    id_: str,
    label: str,
    description: str,
    anchor_pct: float | None,
    solve_pct: float | None,
    anchor_entries: list[EntryInput],
    solve_entries: list[EntryInput],
    stats: dict[int, dict],
    bands: list[ScaleBand],
    target_pct: float,
) -> Scenario:
    tolerance = 1e-6
    # Negative / zero solve means the target is already cleared even at 0% on
    # the remaining items — that's locked-in, not a miss. (Previously we
    # required solve_pct >= 0 for reachable, so negatives showed as "miss"
    # while the ceiling grade still looked fine — contradictory UX.)
    already_locked_in = solve_pct is not None and solve_pct <= tolerance
    reachable = solve_pct is not None and (
        already_locked_in or solve_pct <= 105.0 + tolerance
    )

    if solve_pct is not None:
        if already_locked_in:
            # Floor path: even zeros on the solve set keep you at/above target.
            effective_solve = 0.0
        elif reachable:
            effective_solve = solve_pct
        else:
            # Ceiling: best-you-could-do under this anchor (still short).
            effective_solve = 100.0
        final_pct, letter = _grade_at(
            stats,
            anchor_entries,
            solve_entries,
            anchor_pct if anchor_pct is not None else effective_solve,
            effective_solve,
            bands,
        )
    else:
        final_pct, letter = 0.0, None

    # Never surface negative leg percentages in the UI — clamp to 0 when
    # locked in (or whenever the algebra went negative).
    display_solve = (
        0.0
        if solve_pct is not None and solve_pct < 0
        else (solve_pct if solve_pct is not None else 0.0)
    )

    legs: list[ScenarioLeg] = []
    for e in anchor_entries:
        legs.append(
            ScenarioLeg(
                entry_id=e.id,
                entry_name=e.name or f"Entry #{e.id}",
                role="anchor",
                pct=anchor_pct if anchor_pct is not None else display_solve,
            )
        )
    for e in solve_entries:
        legs.append(
            ScenarioLeg(
                entry_id=e.id,
                entry_name=e.name or f"Entry #{e.id}",
                role="solve",
                pct=display_solve,
            )
        )

    return Scenario(
        id=id_,
        label=label,
        description=description,
        anchor_pct=anchor_pct,
        # Keep the raw solve for math/tests; UI reads legs + flags.
        solve_pct=solve_pct,
        resulting_grade_pct=final_pct,
        resulting_letter=letter,
        reachable=reachable,
        already_locked_in=already_locked_in,
        legs=legs,
    )


def _join_names(entries: list[EntryInput]) -> str:
    names = [e.name or f"Entry #{e.id}" for e in entries]
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return ", ".join(names[:-1]) + f", and {names[-1]}"


def _needed_str(x: float | None, label: str) -> str:
    if x is None:
        return f"any score on {label}"
    if x <= 1e-6:
        return f"literally anything on {label}"
    if x > 105.0 + 1e-6:
        return f"{_fmt_pct(x)} on {label} — not reachable"
    return f"{_fmt_pct(x)} on {label}"


# --- reweight helper -------------------------------------------------------


@dataclass(frozen=True)
class ReweightInfo:
    """Applied when the user announces a new category weight mid-course
    ("my final is worth 20%"). Existing categories are scaled proportionally
    so the total stays 100%; the new category is added with a single synthetic
    entry (points_possible = 100)."""

    new_category_name: str
    new_weight_pct: float
    # `[(original_name, original_pct, scaled_pct)]` for every existing category.
    scaled: list[tuple[str, float, float]]


def apply_reweight(
    entries: list[EntryInput],
    categories: list[CategoryInput],
    new_category_name: str,
    new_weight_pct: float,
) -> tuple[list[EntryInput], list[CategoryInput], EntryInput, ReweightInfo]:
    """Return (entries', categories', synthetic_entry, info) with the reweight
    applied.

    - Existing categories are scaled by `(100 - new_weight_pct) / total_existing`
      so weights still sum to 100.
    - A new category is appended at a fresh (negative) id — negative so it
      can never collide with real ORM ids from the same request.
    - A single ungraded entry is inserted into the new category with
      `points_possible = 100`, also at a fresh negative id.
    """
    if new_weight_pct <= 0 or new_weight_pct >= 100:
        raise ValueError("new_weight_pct must be in (0, 100).")

    existing_total = sum(c.weight_pct for c in categories) or 100.0
    scale = (100.0 - new_weight_pct) / existing_total

    scaled_cats: list[CategoryInput] = []
    scaled_report: list[tuple[str, float, float]] = []
    for c in categories:
        new_w = c.weight_pct * scale
        scaled_cats.append(
            CategoryInput(
                id=c.id,
                name=c.name,
                weight_pct=new_w,
                drop_lowest_n=c.drop_lowest_n,
            )
        )
        scaled_report.append((c.name, c.weight_pct, new_w))

    used_ids = {c.id for c in categories} | {e.id for e in entries}
    synth_cat_id = -1
    while synth_cat_id in used_ids:
        synth_cat_id -= 1
    used_ids.add(synth_cat_id)
    synth_entry_id = synth_cat_id - 1
    while synth_entry_id in used_ids:
        synth_entry_id -= 1

    scaled_cats.append(
        CategoryInput(
            id=synth_cat_id,
            name=new_category_name,
            weight_pct=new_weight_pct,
            drop_lowest_n=0,
        )
    )
    synthetic_entry = EntryInput(
        id=synth_entry_id,
        category_id=synth_cat_id,
        points_earned=None,
        points_possible=100.0,
        hidden=False,
        name=new_category_name,
    )
    entries_out = list(entries) + [synthetic_entry]

    info = ReweightInfo(
        new_category_name=new_category_name,
        new_weight_pct=new_weight_pct,
        scaled=scaled_report,
    )
    return entries_out, scaled_cats, synthetic_entry, info


# --- formatting helpers ----------------------------------------------------


def _fmt_pct(value: float) -> str:
    # Trim to at most 2 decimal places; drop trailing zeros for integer-ish values.
    rounded = round(value, 2)
    if rounded == int(rounded):
        return f"{int(rounded)}%"
    text = f"{rounded:.2f}".rstrip("0").rstrip(".")
    return f"{text}%"


def _fmt_points(earned: float, possible: float) -> str:
    def _num(x: float) -> str:
        rounded = round(x, 2)
        if rounded == int(rounded):
            return str(int(rounded))
        return f"{rounded:g}"

    return f"{_num(earned)}/{_num(possible)}"
