import { useEffect, useMemo, useRef, useState } from "react";

import type {
  CurrentGrade,
  GradeCategory,
  GradeScaleBand,
  GradebookEntry,
} from "@/api/types";
import {
  useCategories,
  useCreateGradebookEntry,
  useCurrentGrade,
  useDeleteGradebookEntry,
  useGradebookEntries,
  useGradingScale,
  useUpdateGradebookEntry,
} from "@/api/liveViews";
import { PredictionBox } from "@/components/courseDetail/PredictionBox";
import { InlineEditableText } from "@/components/InlineEditableText";

interface GradebookTabProps {
  courseSlug: string;
}

/**
 * The Gradebook tab.
 *
 * SPEC:
 * - Groups entries by category.
 * - Inline edits for name, `points_earned`, and `points_possible`; toggling
 *   `hidden` collapses the row into a "hidden" section but doesn't delete it.
 *   Deleting an entry doesn't touch the paired Assignment (split model).
 * - Prediction "query box, not a chat" sits at the top of the tab.
 * - Course grading scale (`GradeScaleBand`) is shown alongside the current
 *   grade so letter cutoffs are visible without leaving the tab.
 */
export function GradebookTab({ courseSlug }: GradebookTabProps) {
  const grade = useCurrentGrade(courseSlug);
  const entriesQ = useGradebookEntries(courseSlug);
  const categoriesQ = useCategories(courseSlug);
  const scaleQ = useGradingScale(courseSlug);

  if (grade.isLoading || entriesQ.isLoading || categoriesQ.isLoading) {
    return <p className="text-sm text-muted">Loading gradebook…</p>;
  }
  if (grade.error || entriesQ.error || categoriesQ.error) {
    return (
      <p className="text-sm text-danger">
        Couldn't load the gradebook. Refresh to try again.
      </p>
    );
  }

  const categories = categoriesQ.data ?? [];
  const entries = entriesQ.data ?? [];

  return (
    <div className="space-y-8">
      <CurrentGradeHeader
        grade={grade.data ?? null}
        bands={scaleQ.data ?? []}
        scaleLoading={scaleQ.isLoading}
        scaleError={!!scaleQ.error}
      />
      <PredictionBox courseSlug={courseSlug} />
      <EntriesByCategory
        courseSlug={courseSlug}
        entries={entries}
        categories={categories}
      />
    </div>
  );
}

// --- header --------------------------------------------------------------

function CurrentGradeHeader({
  grade,
  bands,
  scaleLoading,
  scaleError,
}: {
  grade: CurrentGrade | null;
  bands: GradeScaleBand[];
  scaleLoading: boolean;
  scaleError: boolean;
}) {
  if (!grade) return null;
  const hasGrade = grade.percentage !== null;
  const sorted = [...bands].sort((a, b) => b.min_pct - a.min_pct);
  const showScale = !scaleLoading && !scaleError && sorted.length > 0;

  return (
    <section className="card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">
            Current grade
          </p>
          {hasGrade ? (
            <p className="font-num mt-1 text-5xl font-semibold tracking-tight">
              {Math.round(grade.percentage! * 10) / 10}%
              {grade.letter ? (
                <span className="ml-3 text-2xl text-muted">
                  {grade.letter}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 max-w-md text-sm text-muted">
              No grades yet. Add scores to entries below to see your current
              grade appear here.
            </p>
          )}
        </div>
        {grade.target ? (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted">Target</p>
            <p className="font-num mt-1 text-2xl font-medium">
              {grade.target}
              {grade.target_pct !== null &&
              String(grade.target_pct) !== grade.target ? (
                <span className="ml-2 text-sm text-muted">
                  ({Math.round(grade.target_pct * 10) / 10}%)
                </span>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>

      {hasGrade && grade.breakdown.some((b) => b.has_grades) ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grade.breakdown.map((cat) => (
            <div
              key={cat.category_id}
              className="rounded-lg border border-border bg-bg/40 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">{cat.name}</p>
                <p className="font-num text-xs text-muted">
                  {cat.weight_pct}%
                </p>
              </div>
              <p className="font-num mt-1 text-lg">
                {cat.earned_pct !== null
                  ? `${Math.round(cat.earned_pct * 10) / 10}%`
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {showScale ? (
        <p className="font-num mt-5 overflow-x-auto whitespace-nowrap border-t border-border pt-3 text-xs text-muted">
          {sorted.map((band, i) => (
            <span key={band.id}>
              {i > 0 ? <span className="mx-2 text-border">·</span> : null}
              <span className="text-fg/80">{band.letter}</span>
              <span className="ml-1">{formatPct(band.min_pct)}%+</span>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

function formatPct(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// --- entries -------------------------------------------------------------

function EntriesByCategory({
  courseSlug,
  entries,
  categories,
}: {
  courseSlug: string;
  entries: GradebookEntry[];
  categories: GradeCategory[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const { visibleByCategory, hidden, uncategorized } = useMemo(() => {
    const byCat: Map<number | null, GradebookEntry[]> = new Map();
    const hiddenList: GradebookEntry[] = [];
    for (const e of entries) {
      if (e.hidden) {
        hiddenList.push(e);
        continue;
      }
      const list = byCat.get(e.category_id ?? null) ?? [];
      list.push(e);
      byCat.set(e.category_id ?? null, list);
    }
    const visible: { category: GradeCategory; entries: GradebookEntry[] }[] = [];
    for (const cat of categories) {
      visible.push({ category: cat, entries: byCat.get(cat.id) ?? [] });
    }
    const un = byCat.get(null) ?? [];
    return {
      visibleByCategory: visible,
      hidden: hiddenList,
      uncategorized: un,
    };
  }, [entries, categories]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Entries</h2>
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => setShowAdd(true)}
        >
          + Add entry
        </button>
      </div>

      <div className="space-y-6">
        {visibleByCategory.map(({ category, entries: rows }) => (
          <CategoryBlock
            key={category.id}
            courseSlug={courseSlug}
            category={category}
            entries={rows}
            categories={categories}
          />
        ))}
        {uncategorized.length > 0 ? (
          <CategoryBlock
            courseSlug={courseSlug}
            entries={uncategorized}
            categories={categories}
          />
        ) : null}
      </div>

      {hidden.length > 0 ? (
        <div className="mt-6">
          <button
            type="button"
            className="text-sm text-muted hover:underline"
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? "Hide" : "Show"} hidden ({hidden.length})
          </button>
          {showHidden ? (
            <div className="mt-3 space-y-2">
              {hidden.map((e) => (
                <EntryRow
                  key={e.slug}
                  courseSlug={courseSlug}
                  entry={e}
                  categories={categories}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showAdd ? (
        <AddEntryForm
          courseSlug={courseSlug}
          categories={categories}
          onClose={() => setShowAdd(false)}
        />
      ) : null}
    </section>
  );
}

function CategoryBlock({
  courseSlug,
  category,
  entries,
  categories,
}: {
  courseSlug: string;
  category?: GradeCategory;
  entries: GradebookEntry[];
  categories: GradeCategory[];
}) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-medium">
          {category ? category.name : "Uncategorized"}
        </h3>
        {category ? (
          <span className="font-num text-xs text-muted">
            {category.weight_pct}%
            {category.drop_lowest_n > 0
              ? ` · drops lowest ${category.drop_lowest_n}`
              : ""}
          </span>
        ) : (
          <span className="text-xs text-danger">
            Assign these rows to a category to count toward the grade.
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No entries yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <EntryRow
              key={entry.slug}
              courseSlug={courseSlug}
              entry={entry}
              categories={categories}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({
  courseSlug,
  entry,
  categories,
}: {
  courseSlug: string;
  entry: GradebookEntry;
  categories: GradeCategory[];
}) {
  const update = useUpdateGradebookEntry(courseSlug);
  const del = useDeleteGradebookEntry(courseSlug);

  const [earnedInput, setEarnedInput] = useState<string>(
    entry.points_earned !== null ? String(entry.points_earned) : "",
  );
  const [possibleInput, setPossibleInput] = useState<string>(
    String(entry.points_possible),
  );
  const [editingPossible, setEditingPossible] = useState(false);
  const possibleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEarnedInput(
      entry.points_earned !== null ? String(entry.points_earned) : "",
    );
  }, [entry.points_earned]);

  useEffect(() => {
    if (!editingPossible) {
      setPossibleInput(String(entry.points_possible));
    }
  }, [entry.points_possible, editingPossible]);

  useEffect(() => {
    if (editingPossible) {
      possibleRef.current?.focus();
      possibleRef.current?.select();
    }
  }, [editingPossible]);

  function commitEarned() {
    const parsed = earnedInput.trim() === "" ? null : Number(earnedInput);
    if (parsed !== null && Number.isNaN(parsed)) {
      setEarnedInput(
        entry.points_earned !== null ? String(entry.points_earned) : "",
      );
      return;
    }
    if (parsed === entry.points_earned) return;
    update.mutate({
      entrySlug: entry.slug,
      payload: { points_earned: parsed },
    });
  }

  function commitPossible() {
    const parsed = Number(possibleInput);
    if (Number.isNaN(parsed) || parsed < 0) {
      setPossibleInput(String(entry.points_possible));
      setEditingPossible(false);
      return;
    }
    if (parsed !== entry.points_possible) {
      update.mutate({
        entrySlug: entry.slug,
        payload: { points_possible: parsed },
      });
    }
    setEditingPossible(false);
  }

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-lg border border-border bg-bg/40 px-3 py-2">
      <div className="min-w-0">
        <InlineEditableText
          value={entry.name}
          ariaLabel={`Rename ${entry.name}`}
          onSave={(name) =>
            update.mutateAsync({
              entrySlug: entry.slug,
              payload: { name },
            })
          }
        />
        <p className="mt-0.5 text-xs text-muted">
          <SourceBadge source={entry.source} />
          {entry.hidden ? <span className="ml-2">Hidden</span> : null}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <input
          className="input w-20 py-1 text-right font-num"
          type="number"
          step="0.5"
          value={earnedInput}
          onChange={(e) => setEarnedInput(e.target.value)}
          onBlur={commitEarned}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          aria-label={`Points earned on ${entry.name}`}
        />
        <span className="font-num text-sm text-muted">/</span>
        {editingPossible ? (
          <input
            ref={possibleRef}
            className="w-16 border-0 border-b border-border bg-transparent py-1 text-right font-num text-sm text-muted outline-none focus:border-fg"
            type="number"
            min="0"
            step="0.5"
            value={possibleInput}
            onChange={(e) => setPossibleInput(e.target.value)}
            onBlur={commitPossible}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setPossibleInput(String(entry.points_possible));
                setEditingPossible(false);
              }
            }}
            aria-label={`Points possible on ${entry.name}`}
            title="Points possible (0 = pure extra credit)"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setPossibleInput(String(entry.points_possible));
              setEditingPossible(true);
            }}
            className="min-w-[2.5rem] rounded px-1 py-1 text-right font-num text-sm text-muted underline-offset-2 hover:bg-bg hover:text-fg hover:underline"
            aria-label={`Edit points possible on ${entry.name}`}
            title="Points possible — click to edit (0 = pure extra credit)"
          >
            {entry.points_possible}
          </button>
        )}
      </div>
      <select
        className="input h-8 w-32 py-0 text-xs"
        value={entry.category_id ?? ""}
        onChange={(e) =>
          update.mutate({
            entrySlug: entry.slug,
            payload: {
              category_id: e.target.value ? Number(e.target.value) : null,
            },
          })
        }
        aria-label={`Category of ${entry.name}`}
      >
        <option value="">Uncategorized</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() =>
            update.mutate({
              entrySlug: entry.slug,
              payload: { hidden: !entry.hidden },
            })
          }
          className="rounded p-1.5 text-muted hover:bg-bg hover:text-fg"
          aria-label={entry.hidden ? "Unhide entry" : "Hide entry"}
          title={entry.hidden ? "Unhide" : "Hide from grade math"}
        >
          {entry.hidden ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                `Delete gradebook entry "${entry.name}"? The linked assignment (if any) will stay on your task list.`,
              )
            ) {
              del.mutate(entry.slug);
            }
          }}
          className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
          aria-label={`Delete ${entry.name}`}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// --- add entry -----------------------------------------------------------

function AddEntryForm({
  courseSlug,
  categories,
  onClose,
}: {
  courseSlug: string;
  categories: GradeCategory[];
  onClose: () => void;
}) {
  const create = useCreateGradebookEntry(courseSlug);
  const [name, setName] = useState("");
  const [pointsPossible, setPointsPossible] = useState("100");
  const [pointsEarned, setPointsEarned] = useState("");
  const [categoryId, setCategoryId] = useState<string>(
    categories[0]?.id ? String(categories[0].id) : "",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      points_possible: Number(pointsPossible) || 0,
      points_earned: pointsEarned.trim() === "" ? null : Number(pointsEarned),
      category_id: categoryId ? Number(categoryId) : null,
    });
    onClose();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <p className="mb-3 text-sm font-medium">New gradebook entry</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <input
          className="input"
          placeholder="Attendance, Extra credit, HW11…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
        <select
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          className="input font-num"
          type="number"
          min="0"
          step="0.5"
          placeholder="Earned"
          value={pointsEarned}
          onChange={(e) => setPointsEarned(e.target.value)}
        />
        <input
          className="input font-num"
          type="number"
          min="0"
          step="0.5"
          placeholder="Possible"
          value={pointsPossible}
          onChange={(e) => setPointsPossible(e.target.value)}
          required
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        Set <span className="font-medium">points possible = 0</span> for pure
        extra credit; extra credit adds a bonus without penalizing you.
      </p>
      <div className="mt-3 flex items-center justify-end gap-3">
        <button
          type="button"
          className="text-sm text-muted hover:underline"
          onClick={onClose}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add entry"}
        </button>
      </div>
    </form>
  );
}

// --- badges / icons ------------------------------------------------------

function SourceBadge({ source }: { source: string }) {
  const label =
    source === "syllabus"
      ? "Syllabus"
      : source === "manual"
        ? "Manual"
        : source === "sms"
          ? "Texted"
          : source;
  return (
    <span className="inline-flex items-center rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
      {label}
    </span>
  );
}

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.79 19.79 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.79 19.79 0 0 1-3.16 4.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
