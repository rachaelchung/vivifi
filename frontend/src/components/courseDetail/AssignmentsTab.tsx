import { useMemo, useRef, useState } from "react";

import type { Assignment, AssignmentKind } from "@/api/types";
import {
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useUpdateAssignment,
} from "@/api/liveViews";
import { InlineEditableText } from "@/components/InlineEditableText";

interface AssignmentsTabProps {
  courseSlug: string;
  /** IANA timezone for the course — used to place the Today marker. */
  timezone: string;
}

/**
 * The Assignments tab (task/schedule side of the split model).
 *
 * SPEC:
 * - `completed` is per-row and does NOT touch the paired GradebookEntry.
 * - `source` badge visible.
 * - Kind: assignment | exam. Exams render distinctively.
 * - Delete prompts: "Also delete the linked gradebook entry?" (yes → cascade,
 *   no → orphan the entry).
 *
 * Ordering: strict chronological, undated rows at the bottom. Completed rows
 * stay in place (greyed + struck through) so the list reads like a timeline.
 * A quiet Today marker sits between past and upcoming dated rows.
 */
export function AssignmentsTab({ courseSlug, timezone }: AssignmentsTabProps) {
  const q = useAssignments(courseSlug);
  const [showAdd, setShowAdd] = useState(false);

  const sorted = useMemo(() => sortForTimeline(q.data ?? []), [q.data]);
  const todayIndex = useMemo(
    () => todayMarkerIndex(sorted, todayInTimezone(timezone)),
    [sorted, timezone],
  );

  if (q.isLoading) {
    return <p className="text-sm text-muted">Loading assignments…</p>;
  }
  if (q.error) {
    return (
      <p className="text-sm text-danger">Couldn't load assignments.</p>
    );
  }

  const empty = sorted.length === 0;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Assignments</h2>
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => setShowAdd(true)}
        >
          + Add assignment
        </button>
      </div>

      {empty ? (
        <p className="text-sm text-muted">
          Nothing on your task list yet — add an assignment or exam manually,
          or upload your syllabus and Vivifi will fill this in.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((a, i) => (
            <div
              key={a.slug}
              className={todayIndex === i ? "space-y-2" : undefined}
            >
              {todayIndex === i ? <TodayMarker /> : null}
              <AssignmentRow courseSlug={courseSlug} assignment={a} />
            </div>
          ))}
          {todayIndex === sorted.length ? <TodayMarker /> : null}
        </div>
      )}

      {showAdd ? (
        <AddAssignmentForm
          courseSlug={courseSlug}
          onClose={() => setShowAdd(false)}
        />
      ) : null}
    </section>
  );
}

/** Thin hairline + label — orientation only, not a section header. */
function TodayMarker() {
  return (
    <div
      role="separator"
      aria-label="Today"
      className="flex items-center gap-2.5 py-0.5"
    >
      <div className="h-px flex-1 bg-accent/35" />
      <span className="font-num text-[10px] font-medium uppercase tracking-[0.14em] text-accent">
        Today
      </span>
      <div className="h-px flex-1 bg-accent/35" />
    </div>
  );
}

/**
 * Index at which to insert the Today marker: before the first dated row
 * with due_date >= today. Undated rows stay at the bottom; if every dated
 * row is past, the marker goes after the last dated row (before undated).
 * Returns -1 when there are no dated rows (nothing to orient against).
 */
function todayMarkerIndex(rows: Assignment[], today: string): number {
  let hasDated = false;
  let insertAt = -1;
  for (let i = 0; i < rows.length; i++) {
    const due = rows[i].due_date;
    if (!due) continue;
    hasDated = true;
    if (due >= today) {
      insertAt = i;
      break;
    }
  }
  if (!hasDated) return -1;
  if (insertAt === -1) {
    // All dated rows are past — place after the last dated row.
    let lastDated = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].due_date) lastDated = i;
    }
    return lastDated + 1;
  }
  return insertAt;
}

/** YYYY-MM-DD for "now" in the course timezone (SPEC display truth). */
function todayInTimezone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    // Invalid IANA name — fall back to the browser's local calendar day.
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
}

function sortForTimeline(rows: Assignment[]): Assignment[] {
  return [...rows].sort((a, b) => {
    if (a.due_date && b.due_date) {
      if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
    } else if (a.due_date && !b.due_date) {
      return -1;
    } else if (!a.due_date && b.due_date) {
      return 1;
    }
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? -1 : 1;
    }
    return 0;
  });
}

function AssignmentRow({
  courseSlug,
  assignment,
}: {
  courseSlug: string;
  assignment: Assignment;
}) {
  const update = useUpdateAssignment(courseSlug);
  const del = useDeleteAssignment(courseSlug);
  const isExam = assignment.kind === "exam";
  const done = assignment.completed;

  function handleDelete() {
    const cascade = window.confirm(
      `Delete "${assignment.name}"? Click OK to also delete the linked gradebook entry, Cancel to keep the gradebook entry (it'll become a manual row).`,
    );
    if (
      !window.confirm(
        cascade
          ? `Confirm: delete "${assignment.name}" AND its gradebook entry?`
          : `Confirm: delete just the assignment "${assignment.name}"?`,
      )
    ) {
      return;
    }
    del.mutate({ assignmentSlug: assignment.slug, cascadeGradebook: cascade });
  }

  return (
    <div
      className={
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-opacity " +
        (isExam
          ? "border-accent/40 bg-accent/5 "
          : "border-border bg-surface ") +
        (done ? "opacity-60" : "")
      }
    >
      <input
        type="checkbox"
        checked={done}
        onChange={(e) =>
          update.mutate({
            assignmentSlug: assignment.slug,
            payload: { completed: e.target.checked },
          })
        }
        className="h-4 w-4 flex-shrink-0 accent-current"
        aria-label={`Mark ${assignment.name} ${done ? "not done" : "done"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <InlineEditableText
            value={assignment.name}
            struck={done}
            ariaLabel={`Rename ${assignment.name}`}
            onSave={(name) =>
              update.mutateAsync({
                assignmentSlug: assignment.slug,
                payload: { name },
              })
            }
          />
          {isExam ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-fg">
              Exam
            </span>
          ) : null}
          <SourceBadge source={assignment.source} />
        </div>
        {assignment.notes ? (
          <p className={"mt-1 truncate text-xs " + (done ? "text-muted line-through" : "text-muted")}>
            {assignment.notes}
          </p>
        ) : null}
      </div>
      <DueDateControl
        value={assignment.due_date}
        struck={done}
        accent={isExam}
        ariaLabel={`Change due date for ${assignment.name}`}
        onChange={(due_date) =>
          update.mutate({
            assignmentSlug: assignment.slug,
            payload: { due_date },
          })
        }
      />
      <button
        type="button"
        onClick={handleDelete}
        className="flex-shrink-0 rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
        aria-label={`Delete ${assignment.name}`}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

/**
 * Visible date chip that opens the native calendar on click.
 * (A transparent overlay input often fails to open the picker in Chrome/Safari.)
 */
function DueDateControl({
  value,
  onChange,
  ariaLabel,
  struck = false,
  accent = false,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  ariaLabel: string;
  struck?: boolean;
  accent?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      // showPicker can throw if the browser blocks it; fall through.
    }
    el.focus();
    el.click();
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={openPicker}
        className={
          "block w-[7.5rem] rounded-md border px-2.5 py-1 text-right font-num text-xs text-fg " +
          (accent
            ? "border-accent/40 bg-accent/10 hover:border-accent/70 "
            : "border-border bg-surface hover:border-fg/30 ") +
          (struck ? "line-through " : "")
        }
        aria-label={ariaLabel}
        title="Change due date"
      >
        {formatDate(value)}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}

function AddAssignmentForm({
  courseSlug,
  onClose,
}: {
  courseSlug: string;
  onClose: () => void;
}) {
  const create = useCreateAssignment(courseSlug);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssignmentKind>("assignment");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      kind,
      due_date: dueDate || null,
      notes: notes.trim() || null,
    });
    onClose();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <p className="mb-3 text-sm font-medium">New assignment</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <input
          className="input"
          placeholder="Reading response, project draft…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
        <select
          className="input"
          value={kind}
          onChange={(e) => setKind(e.target.value as AssignmentKind)}
        >
          <option value="assignment">Assignment</option>
          <option value="exam">Exam</option>
        </select>
        <input
          className="input"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <textarea
        className="input mt-3 min-h-[60px]"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="mt-3 flex items-center justify-end gap-3">
        <button
          type="button"
          className="text-sm text-muted hover:underline"
          onClick={onClose}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}

// --- utilities ------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
