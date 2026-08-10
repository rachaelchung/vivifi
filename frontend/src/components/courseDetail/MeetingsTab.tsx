import { useState } from "react";

import type {
  ClassMeeting,
  ClassMeetingCreatePayload,
  ClassMeetingKind,
  ClassMeetingUpdatePayload,
} from "@/api/types";
import {
  useClassMeetings,
  useCreateClassMeeting,
  useDeleteClassMeeting,
  useUpdateClassMeeting,
} from "@/api/liveViews";
import { cn } from "@/lib/utils";
import {
  formatTimeRangeCompact,
  readTimeFormat,
  type TimeFormat,
} from "@/lib/timeFormat";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const KIND_ORDER: ClassMeetingKind[] = [
  "lecture",
  "recitation",
  "lab",
  "seminar",
  "other",
];

const KIND_LABELS: Record<ClassMeetingKind, string> = {
  lecture: "Lecture",
  recitation: "Recitation",
  lab: "Lab",
  seminar: "Seminar",
  other: "Other",
};

interface MeetingsTabProps {
  courseSlug: string;
}

/**
 * Always-on Class Meetings tab: grouped by kind, mine rows pinned and
 * highlighted. Editable after syllabus commit like other live tabs.
 */
export function MeetingsTab({ courseSlug }: MeetingsTabProps) {
  const q = useClassMeetings(courseSlug);
  const [showAdd, setShowAdd] = useState(false);
  const [timeFormat] = useState<TimeFormat>(() => readTimeFormat());

  if (q.isLoading) {
    return <p className="text-sm text-muted">Loading meetings…</p>;
  }
  if (q.error) {
    return <p className="text-sm text-danger">Couldn't load class meetings.</p>;
  }

  const meetings = q.data ?? [];
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: meetings.filter((m) => m.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Meetings</h2>
          <p className="mt-1 text-sm text-muted">
            Mark Mine on the sessions you attend. Those appear on your Week
            Schedule.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => setShowAdd(true)}
        >
          + Add meeting
        </button>
      </div>

      {meetings.length === 0 ? (
        <p className="text-sm text-muted">No class meetings yet.</p>
      ) : (
        <div className="space-y-8">
          {groups.map(({ kind, items }) => (
            <MeetingGroup
              key={kind}
              label={KIND_LABELS[kind]}
              items={items}
              courseSlug={courseSlug}
              timeFormat={timeFormat}
            />
          ))}
        </div>
      )}

      {showAdd ? (
        <MeetingForm
          courseSlug={courseSlug}
          onClose={() => setShowAdd(false)}
        />
      ) : null}
    </section>
  );
}

function MeetingGroup({
  label,
  items,
  courseSlug,
  timeFormat,
}: {
  label: string;
  items: ClassMeeting[];
  courseSlug: string;
  timeFormat: TimeFormat;
}) {
  const sorted = [...items].sort((a, b) => {
    if (a.is_mine !== b.is_mine) return a.is_mine ? -1 : 1;
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return a.start_time.localeCompare(b.start_time);
  });

  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </h3>
      <div className="space-y-3">
        {sorted.map((m) => (
          <MeetingCard
            key={m.id}
            courseSlug={courseSlug}
            meeting={m}
            timeFormat={timeFormat}
          />
        ))}
      </div>
    </div>
  );
}

function MeetingCard({
  courseSlug,
  meeting,
  timeFormat,
}: {
  courseSlug: string;
  meeting: ClassMeeting;
  timeFormat: TimeFormat;
}) {
  const update = useUpdateClassMeeting(courseSlug);
  const del = useDeleteClassMeeting(courseSlug);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <MeetingForm
        courseSlug={courseSlug}
        meeting={meeting}
        onClose={() => setEditing(false)}
      />
    );
  }

  const when = `${WEEKDAYS[meeting.day_of_week] ?? "?"} · ${formatTimeRangeCompact(
    meeting.start_time,
    meeting.end_time,
    timeFormat,
  )}`;

  return (
    <article
      className={cn(
        "card p-5",
        meeting.is_mine && "ring-1 ring-accent/40 bg-accent/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
              {KIND_LABELS[meeting.kind]}
            </span>
            {meeting.section ? (
              <span className="inline-flex items-center rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                {meeting.section}
              </span>
            ) : null}
            {meeting.is_mine ? (
              <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                Mine
              </span>
            ) : null}
          </div>
          <p className="mt-2 font-num text-base font-semibold tracking-tight">
            {when}
          </p>
          {meeting.location ? (
            <p className="mt-1 text-sm text-muted">{meeting.location}</p>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={meeting.is_mine}
              disabled={update.isPending}
              onChange={(e) =>
                update.mutate({
                  id: meeting.id,
                  payload: { is_mine: e.target.checked },
                })
              }
            />
            Mine
          </label>
          <div className="flex gap-1">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn-ghost text-xs text-danger"
              onClick={() => {
                if (window.confirm("Remove this class meeting?")) {
                  del.mutate(meeting.id);
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function MeetingForm({
  courseSlug,
  meeting,
  onClose,
}: {
  courseSlug: string;
  meeting?: ClassMeeting;
  onClose: () => void;
}) {
  const create = useCreateClassMeeting(courseSlug);
  const update = useUpdateClassMeeting(courseSlug);
  const isEdit = !!meeting;

  const [draft, setDraft] = useState({
    kind: meeting?.kind ?? ("lecture" as ClassMeetingKind),
    section: meeting?.section ?? "",
    is_mine: meeting?.is_mine ?? true,
    day_of_week: meeting?.day_of_week ?? 0,
    start_time: (meeting?.start_time ?? "10:00").slice(0, 5),
    end_time: (meeting?.end_time ?? "11:20").slice(0, 5),
    location: meeting?.location ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (draft.end_time <= draft.start_time) {
      setError("End time must be after start time.");
      return;
    }
    setError(null);
    const payload: ClassMeetingCreatePayload | ClassMeetingUpdatePayload = {
      kind: draft.kind,
      section: draft.section.trim() || null,
      is_mine: draft.is_mine,
      day_of_week: draft.day_of_week,
      start_time: draft.start_time,
      end_time: draft.end_time,
      location: draft.location.trim() || null,
    };
    try {
      if (isEdit && meeting) {
        await update.mutateAsync({ id: meeting.id, payload });
      } else {
        await create.mutateAsync(payload as ClassMeetingCreatePayload);
      }
      onClose();
    } catch {
      setError("Couldn't save meeting.");
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {isEdit ? "Edit meeting" : "Add meeting"}
        </h3>
        <button type="button" className="btn-ghost text-xs" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="hint">Kind</label>
          <select
            className="input"
            value={draft.kind}
            onChange={(e) =>
              setDraft({
                ...draft,
                kind: e.target.value as ClassMeetingKind,
              })
            }
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hint">Section (optional)</label>
          <input
            className="input"
            value={draft.section}
            placeholder="e.g. A, L01"
            onChange={(e) => setDraft({ ...draft, section: e.target.value })}
          />
        </div>
        <div>
          <label className="hint">Day</label>
          <select
            className="input"
            value={draft.day_of_week}
            onChange={(e) =>
              setDraft({ ...draft, day_of_week: Number(e.target.value) })
            }
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hint">Start</label>
          <input
            className="input font-num"
            type="time"
            value={draft.start_time}
            onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
          />
        </div>
        <div>
          <label className="hint">End</label>
          <input
            className="input font-num"
            type="time"
            value={draft.end_time}
            onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
          />
        </div>
        <div>
          <label className="hint">Location</label>
          <input
            className="input"
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.is_mine}
          onChange={(e) => setDraft({ ...draft, is_mine: e.target.checked })}
        />
        Mine (show on Week Schedule)
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button type="submit" className="btn-primary text-sm" disabled={pending}>
        {pending ? "Saving…" : isEdit ? "Save" : "Add meeting"}
      </button>
    </form>
  );
}
