import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import type { HostRole, OfficeHour, OfficeHourHost } from "@/api/types";
import {
  useCreateOfficeHour,
  useCreateOfficeHourHost,
  useDeleteOfficeHour,
  useDeleteOfficeHourHost,
  useOfficeHourHosts,
  useOfficeHours,
  useUpdateOfficeHour,
  useUpdateOfficeHourHost,
} from "@/api/liveViews";
import { Modal } from "@/components/Modal";
import { COURSE_COLOR_CHOICES } from "@/lib/courseColors";
import {
  formatTime,
  formatTimeRangeCompact,
  minutesToTime,
  readTimeFormat,
  timeToMinutes,
  writeTimeFormat,
  type TimeFormat,
} from "@/lib/timeFormat";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_MINUTES = 30;
const SLOT_PX = 28;
const DEFAULT_START_MIN = 8 * 60;
const DEFAULT_END_MIN = 20 * 60;
const RANGE_PAD_MIN = 30;

interface InstructorsTabProps {
  courseSlug: string;
}

/**
 * Instructors tab: host directory (card browse + bulk-edit modal) and a
 * Google Calendar–style weekly office-hours grid (bulk-edit modal + 12/24h).
 */
export function InstructorsTab({ courseSlug }: InstructorsTabProps) {
  const hostsQ = useOfficeHourHosts(courseSlug);
  const hoursQ = useOfficeHours(courseSlug);

  if (hostsQ.isLoading || hoursQ.isLoading) {
    return <p className="text-sm text-muted">Loading instructors…</p>;
  }
  if (hostsQ.error || hoursQ.error) {
    return <p className="text-sm text-danger">Couldn't load instructors.</p>;
  }

  const hosts = hostsQ.data ?? [];
  const hours = hoursQ.data ?? [];

  return (
    <div className="space-y-8">
      <HostDirectory courseSlug={courseSlug} hosts={hosts} hours={hours} />
      <WeeklyGrid courseSlug={courseSlug} hosts={hosts} hours={hours} />
    </div>
  );
}

// --- host directory -----------------------------------------------------

function HostDirectory({
  courseSlug,
  hosts,
  hours,
}: {
  courseSlug: string;
  hosts: OfficeHourHost[];
  hours: OfficeHour[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <section>
      <div className="group mb-4 flex items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Directory</h2>
        <button
          type="button"
          className="rounded p-1 text-muted opacity-0 transition-opacity hover:bg-bg hover:text-fg group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => setEditing(true)}
          aria-label="Edit directory"
        >
          <PencilIcon />
        </button>
      </div>
      {hosts.length === 0 ? (
        <p className="text-sm text-muted">
          No instructors or TAs added yet. Hover the title and click the pencil
          to add hosts.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hosts.map((host) => (
            <HostCard key={host.id} host={host} />
          ))}
        </div>
      )}
      <EditDirectoryModal
        open={editing}
        onClose={() => setEditing(false)}
        courseSlug={courseSlug}
        hosts={hosts}
        hours={hours}
      />
    </section>
  );
}

function HostCard({ host }: { host: OfficeHourHost }) {
  return (
    <article className="card p-5">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted">
          {host.role}
        </p>
        <h3 className="mt-1 truncate text-base font-semibold">{host.name}</h3>
      </div>
      {host.email ? (
        <p className="mt-3 truncate text-sm">
          <a href={`mailto:${host.email}`} className="text-accent hover:underline">
            {host.email}
          </a>
        </p>
      ) : null}
      {host.zoom_link ? (
        <p className="mt-1 truncate text-sm">
          <a
            href={host.zoom_link}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            Personal Zoom room
          </a>
        </p>
      ) : null}
      {host.notes ? (
        <p className="mt-2 text-sm text-muted">{host.notes}</p>
      ) : null}
    </article>
  );
}

type HostDraft = {
  key: string;
  id?: number;
  name: string;
  role: HostRole;
  email: string;
  zoom_link: string;
  notes: string;
};

function hostsToDrafts(hosts: OfficeHourHost[]): HostDraft[] {
  return hosts.map((h) => ({
    key: `id-${h.id}`,
    id: h.id,
    name: h.name,
    role: h.role,
    email: h.email ?? "",
    zoom_link: h.zoom_link ?? "",
    notes: h.notes ?? "",
  }));
}

function EditDirectoryModal({
  open,
  onClose,
  courseSlug,
  hosts,
  hours,
}: {
  open: boolean;
  onClose: () => void;
  courseSlug: string;
  hosts: OfficeHourHost[];
  hours: OfficeHour[];
}) {
  const create = useCreateOfficeHourHost(courseSlug);
  const update = useUpdateOfficeHourHost(courseSlug);
  const del = useDeleteOfficeHourHost(courseSlug);
  const [drafts, setDrafts] = useState<HostDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDrafts(hostsToDrafts(hosts));
      setError(null);
      setSaving(false);
    }
  }, [open, hosts]);

  function updateDraft(key: string, patch: Partial<HostDraft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  function addDraft() {
    setDrafts((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        name: "",
        role: "TA",
        email: "",
        zoom_link: "",
        notes: "",
      },
    ]);
  }

  async function handleSave() {
    const trimmed = drafts.map((d) => ({
      ...d,
      name: d.name.trim(),
      email: d.email.trim(),
      zoom_link: d.zoom_link.trim(),
      notes: d.notes.trim(),
    }));
    if (trimmed.some((d) => !d.name)) {
      setError("Every host needs a name.");
      return;
    }

    const keptIds = new Set(
      trimmed.filter((d) => d.id != null).map((d) => d.id as number),
    );
    const toDelete = hosts.filter((h) => !keptIds.has(h.id));
    if (toDelete.length > 0) {
      const withHours = toDelete.filter((h) =>
        hours.some((oh) => oh.host_id === h.id),
      );
      const names = toDelete.map((h) => h.name).join(", ");
      const msg =
        withHours.length > 0
          ? `Remove ${names}? Their office hours will also be deleted.`
          : `Remove ${names}?`;
      if (!window.confirm(msg)) return;
    }

    setSaving(true);
    setError(null);
    try {
      for (const h of toDelete) {
        await del.mutateAsync(h.id);
      }
      const originalById = new Map(hosts.map((h) => [h.id, h]));
      for (const d of trimmed) {
        if (d.id == null) {
          await create.mutateAsync({
            name: d.name,
            role: d.role,
            email: d.email || null,
            zoom_link: d.zoom_link || null,
            notes: d.notes || null,
          });
          continue;
        }
        const orig = originalById.get(d.id);
        if (!orig) continue;
        const payload: {
          name?: string;
          role?: HostRole;
          email?: string | null;
          zoom_link?: string | null;
          notes?: string | null;
        } = {};
        if (d.name !== orig.name) payload.name = d.name;
        if (d.role !== orig.role) payload.role = d.role;
        if ((d.email || null) !== orig.email) payload.email = d.email || null;
        if ((d.zoom_link || null) !== orig.zoom_link)
          payload.zoom_link = d.zoom_link || null;
        if ((d.notes || null) !== orig.notes) payload.notes = d.notes || null;
        if (Object.keys(payload).length > 0) {
          await update.mutateAsync({ id: d.id, payload });
        }
      }
      onClose();
    } catch {
      setError("Couldn't save directory changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit directory" size="xl">
      <div className="space-y-3">
        {drafts.length === 0 ? (
          <p className="text-sm text-muted">No hosts yet.</p>
        ) : (
          drafts.map((d) => (
            <div
              key={d.key}
              className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-bg/40 p-3 sm:grid-cols-[1.4fr_1fr_1.2fr_1.2fr_auto] sm:items-start"
            >
              <input
                className="input"
                placeholder="Name"
                value={d.name}
                onChange={(e) => updateDraft(d.key, { name: e.target.value })}
                required
              />
              <select
                className="input"
                value={d.role}
                onChange={(e) =>
                  updateDraft(d.key, { role: e.target.value as HostRole })
                }
              >
                <option value="Professor">Professor</option>
                <option value="TA">TA</option>
                <option value="Learning Assistant">Learning Assistant</option>
              </select>
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={d.email}
                onChange={(e) => updateDraft(d.key, { email: e.target.value })}
              />
              <input
                className="input"
                placeholder="Zoom link"
                value={d.zoom_link}
                onChange={(e) =>
                  updateDraft(d.key, { zoom_link: e.target.value })
                }
              />
              <button
                type="button"
                className="rounded p-2 text-muted hover:bg-danger/10 hover:text-danger sm:justify-self-end"
                onClick={() => removeDraft(d.key)}
                aria-label={`Remove ${d.name || "host"}`}
              >
                <TrashIcon />
              </button>
              <input
                className="input sm:col-span-4"
                placeholder="Notes (optional)"
                value={d.notes}
                onChange={(e) => updateDraft(d.key, { notes: e.target.value })}
              />
            </div>
          ))
        )}
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={addDraft}
        >
          + Add host
        </button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            className="text-sm text-muted hover:underline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- weekly grid --------------------------------------------------------

function WeeklyGrid({
  courseSlug,
  hosts,
  hours,
}: {
  courseSlug: string;
  hosts: OfficeHourHost[];
  hours: OfficeHour[];
}) {
  const [editing, setEditing] = useState(false);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() =>
    readTimeFormat(),
  );

  function toggleFormat() {
    const next: TimeFormat = timeFormat === "24" ? "12" : "24";
    setTimeFormat(next);
    writeTimeFormat(next);
  }

  const hostById = useMemo(
    () => new Map(hosts.map((h) => [h.id, h])),
    [hosts],
  );

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="group flex items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Weekly hours</h2>
          <button
            type="button"
            className="rounded p-1 text-muted opacity-0 transition-opacity hover:bg-bg hover:text-fg group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
            onClick={() => setEditing(true)}
            disabled={hosts.length === 0}
            title={
              hosts.length === 0 ? "Add a host in the directory first" : undefined
            }
            aria-label="Edit weekly hours"
          >
            <PencilIcon />
          </button>
        </div>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={toggleFormat}
          aria-label={`Switch to ${timeFormat === "24" ? "12" : "24"}-hour time`}
        >
          {timeFormat === "24" ? "12-hour" : "24-hour"}
        </button>
      </div>

      {hours.length === 0 ? (
        <p className="mb-3 text-sm text-muted">
          {hosts.length === 0
            ? "Add a host, then edit weekly hours."
            : "No office hours yet. Hover the title and click the pencil to add blocks."}
        </p>
      ) : null}

      <CalendarGrid
        hours={hours}
        hostById={hostById}
        timeFormat={timeFormat}
      />

      <EditHoursModal
        open={editing}
        onClose={() => setEditing(false)}
        courseSlug={courseSlug}
        hosts={hosts}
        hours={hours}
      />
    </section>
  );
}

function hostColor(hostId: number): string {
  return COURSE_COLOR_CHOICES[hostId % COURSE_COLOR_CHOICES.length] ?? "#527AA6";
}

function CalendarGrid({
  hours,
  hostById,
  timeFormat,
}: {
  hours: OfficeHour[];
  hostById: Map<number, OfficeHourHost>;
  timeFormat: TimeFormat;
}) {
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (hours.length === 0) {
      return { rangeStart: DEFAULT_START_MIN, rangeEnd: DEFAULT_END_MIN };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const h of hours) {
      min = Math.min(min, timeToMinutes(h.start_time));
      max = Math.max(max, timeToMinutes(h.end_time));
    }
    let start = Math.max(
      0,
      Math.floor((min - RANGE_PAD_MIN) / SLOT_MINUTES) * SLOT_MINUTES,
    );
    let end = Math.min(
      24 * 60,
      Math.ceil((max + RANGE_PAD_MIN) / SLOT_MINUTES) * SLOT_MINUTES,
    );
    // Keep a usable window when the span is very narrow.
    if (end - start < 4 * 60) {
      start = Math.min(start, DEFAULT_START_MIN);
      end = Math.max(end, Math.min(DEFAULT_END_MIN, start + 4 * 60));
    }
    return { rangeStart: start, rangeEnd: Math.max(end, start + SLOT_MINUTES) };
  }, [hours]);

  const totalMinutes = rangeEnd - rangeStart;
  const totalHeight = (totalMinutes / SLOT_MINUTES) * SLOT_PX;

  const slots: number[] = [];
  for (let m = rangeStart; m < rangeEnd; m += SLOT_MINUTES) {
    slots.push(m);
  }

  const byDay = useMemo(() => {
    const buckets: OfficeHour[][] = [[], [], [], [], [], [], []];
    for (const h of hours) {
      buckets[h.day_of_week]?.push(h);
    }
    return buckets.map((day) => layoutOverlaps(day));
  }, [hours]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}
      >
        <div className="border-b border-border" />
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="border-b border-l border-border px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-muted"
          >
            {day}
          </div>
        ))}

        <div className="relative" style={{ height: totalHeight }}>
          {slots.map((m) => {
            const top = ((m - rangeStart) / SLOT_MINUTES) * SLOT_PX;
            const isHour = m % 60 === 0;
            return (
              <div
                key={m}
                className="absolute right-1 flex items-start justify-end"
                style={{ top, height: SLOT_PX }}
              >
                {isHour ? (
                  <span className="font-num -translate-y-1.5 text-[10px] text-muted">
                    {formatTime(minutesToTime(m), timeFormat)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        {WEEKDAYS.map((day, dayIdx) => (
          <div
            key={day}
            className="relative border-l border-border"
            style={{ height: totalHeight }}
          >
            {slots.map((m) => {
              const top = ((m - rangeStart) / SLOT_MINUTES) * SLOT_PX;
              const isHour = m % 60 === 0;
              return (
                <div
                  key={m}
                  className={`absolute inset-x-0 border-t ${
                    isHour ? "border-border" : "border-border/40"
                  }`}
                  style={{ top, height: SLOT_PX }}
                />
              );
            })}
            {byDay[dayIdx].map(({ oh, col, colCount }) => {
              const start = timeToMinutes(oh.start_time);
              const end = timeToMinutes(oh.end_time);
              const top = ((start - rangeStart) / SLOT_MINUTES) * SLOT_PX;
              const height = Math.max(
                ((end - start) / SLOT_MINUTES) * SLOT_PX,
                SLOT_PX * 0.75,
              );
              const widthPct = 100 / colCount;
              const leftPct = col * widthPct;

              return (
                <OfficeHourBlock
                  key={oh.id}
                  oh={oh}
                  host={hostById.get(oh.host_id) ?? null}
                  timeFormat={timeFormat}
                  height={height}
                  style={{
                    top,
                    height,
                    left: `calc(${leftPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Calendar block: host-first label that grows with height; hover reveals a
 * fixed popover with full time, host, and location (avoids overflow clipping).
 */
function OfficeHourBlock({
  oh,
  host,
  timeFormat,
  height,
  style,
}: {
  oh: OfficeHour;
  host: OfficeHourHost | null;
  timeFormat: TimeFormat;
  height: number;
  style: CSSProperties;
}) {
  const [tip, setTip] = useState<{
    left: number;
    top: number;
    above: boolean;
  } | null>(null);
  const color = hostColor(oh.host_id);
  const hostName = host?.name ?? "—";
  const location = oh.location || host?.zoom_link || null;
  const isLink = !!(location && /^https?:\/\//i.test(location));
  const locationLabel = location ? (isLink ? "Zoom" : location) : null;
  const fullTime = `${formatTime(oh.start_time, timeFormat)}–${formatTime(oh.end_time, timeFormat)}`;
  const compactTime = formatTimeRangeCompact(
    oh.start_time,
    oh.end_time,
    timeFormat,
  );

  // Density tiers: short → host only; medium → + compact time; tall → + location.
  const showTime = height >= SLOT_PX * 1.35;
  const showLocation = height >= SLOT_PX * 2.35 && !!locationLabel;

  function showTip(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const above = r.top > 140;
    setTip({
      left: r.left + r.width / 2,
      top: above ? r.top - 6 : r.bottom + 6,
      above,
    });
  }

  return (
    <>
      <div
        className="absolute cursor-default"
        style={style}
        onMouseEnter={(e) => showTip(e.currentTarget)}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => showTip(e.currentTarget)}
        onBlur={() => setTip(null)}
        tabIndex={0}
        aria-label={`${hostName}, ${fullTime}${locationLabel ? `, ${locationLabel}` : ""}`}
      >
        <div
          className="h-full overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 22%, white)`,
            borderLeft: `3px solid ${color}`,
            color: "var(--color-fg)",
          }}
        >
          <p className="truncate font-semibold">{hostName}</p>
          {showTime ? (
            <p className="font-num truncate text-muted">{compactTime}</p>
          ) : null}
          {showLocation ? (
            isLink ? (
              <a
                href={location!}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block truncate text-accent hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Zoom
              </a>
            ) : (
              <p className="mt-0.5 truncate text-muted">{locationLabel}</p>
            )
          ) : null}
        </div>
      </div>
      {tip
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[60] w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
              style={{
                left: tip.left,
                top: tip.top,
                transform: tip.above
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
              }}
            >
              <p className="font-semibold text-fg">{hostName}</p>
              {host?.role ? (
                <p className="text-muted">{host.role}</p>
              ) : null}
              <p className="font-num mt-1 text-fg">{fullTime}</p>
              {location ? (
                isLink ? (
                  <p className="mt-1 text-accent">Zoom</p>
                ) : (
                  <p className="mt-1 text-muted">{location}</p>
                )
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Greedy column assignment for overlapping blocks on one day. */
function layoutOverlaps(
  dayHours: OfficeHour[],
): { oh: OfficeHour; col: number; colCount: number }[] {
  const sorted = [...dayHours].sort((a, b) => {
    const s = timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
    if (s !== 0) return s;
    return timeToMinutes(a.end_time) - timeToMinutes(b.end_time);
  });

  type Active = { end: number; col: number };
  const result: { oh: OfficeHour; col: number; cluster: number }[] = [];
  let active: Active[] = [];
  let clusterId = 0;

  for (const oh of sorted) {
    const start = timeToMinutes(oh.start_time);
    const end = timeToMinutes(oh.end_time);
    active = active.filter((a) => a.end > start);
    if (active.length === 0) {
      clusterId += 1;
    }
    const used = new Set(active.map((a) => a.col));
    let col = 0;
    while (used.has(col)) col += 1;
    active.push({ end, col });
    result.push({ oh, col, cluster: clusterId });
  }

  const maxByCluster = new Map<number, number>();
  for (const row of result) {
    maxByCluster.set(
      row.cluster,
      Math.max(maxByCluster.get(row.cluster) ?? 0, row.col + 1),
    );
  }

  return result.map((row) => ({
    oh: row.oh,
    col: row.col,
    colCount: maxByCluster.get(row.cluster) ?? 1,
  }));
}

type HourDraft = {
  key: string;
  id?: number;
  host_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
};

function hoursToDrafts(hours: OfficeHour[]): HourDraft[] {
  return hours.map((h) => ({
    key: `id-${h.id}`,
    id: h.id,
    host_id: h.host_id,
    day_of_week: h.day_of_week,
    start_time: h.start_time.slice(0, 5),
    end_time: h.end_time.slice(0, 5),
    location: h.location ?? "",
  }));
}

function EditHoursModal({
  open,
  onClose,
  courseSlug,
  hosts,
  hours,
}: {
  open: boolean;
  onClose: () => void;
  courseSlug: string;
  hosts: OfficeHourHost[];
  hours: OfficeHour[];
}) {
  const create = useCreateOfficeHour(courseSlug);
  const update = useUpdateOfficeHour(courseSlug);
  const del = useDeleteOfficeHour(courseSlug);
  const [drafts, setDrafts] = useState<HourDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDrafts(hoursToDrafts(hours));
      setError(null);
      setSaving(false);
    }
  }, [open, hours]);

  function updateDraft(key: string, patch: Partial<HourDraft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  function addDraft() {
    if (hosts.length === 0) return;
    setDrafts((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        host_id: hosts[0].id,
        day_of_week: 0,
        start_time: "14:00",
        end_time: "15:00",
        location: "",
      },
    ]);
  }

  async function handleSave() {
    for (const d of drafts) {
      if (timeToMinutes(d.end_time) <= timeToMinutes(d.start_time)) {
        setError("Each block needs an end time after its start time.");
        return;
      }
      if (!hosts.some((h) => h.id === d.host_id)) {
        setError("Every block needs a host.");
        return;
      }
    }

    const keptIds = new Set(
      drafts.filter((d) => d.id != null).map((d) => d.id as number),
    );
    const toDelete = hours.filter((h) => !keptIds.has(h.id));

    setSaving(true);
    setError(null);
    try {
      for (const h of toDelete) {
        await del.mutateAsync(h.id);
      }
      const originalById = new Map(hours.map((h) => [h.id, h]));
      for (const d of drafts) {
        const location = d.location.trim() || null;
        if (d.id == null) {
          await create.mutateAsync({
            host_id: d.host_id,
            day_of_week: d.day_of_week,
            start_time: d.start_time,
            end_time: d.end_time,
            location,
          });
          continue;
        }
        const orig = originalById.get(d.id);
        if (!orig) continue;
        const payload: {
          host_id?: number;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          location?: string | null;
        } = {};
        if (d.host_id !== orig.host_id) payload.host_id = d.host_id;
        if (d.day_of_week !== orig.day_of_week)
          payload.day_of_week = d.day_of_week;
        if (d.start_time !== orig.start_time.slice(0, 5))
          payload.start_time = d.start_time;
        if (d.end_time !== orig.end_time.slice(0, 5))
          payload.end_time = d.end_time;
        if (location !== orig.location) payload.location = location;
        if (Object.keys(payload).length > 0) {
          await update.mutateAsync({ id: d.id, payload });
        }
      }
      onClose();
    } catch {
      setError("Couldn't save office hours. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit weekly hours" size="xl">
      <div className="space-y-3">
        {hosts.length === 0 ? (
          <p className="text-sm text-muted">
            Add at least one host in the directory before scheduling hours.
          </p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted">No office-hour blocks yet.</p>
        ) : (
          drafts.map((d) => (
            <div
              key={d.key}
              className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-bg/40 p-3 sm:grid-cols-[1.3fr_0.8fr_0.9fr_0.9fr_1.2fr_auto] sm:items-center"
            >
              <select
                className="input"
                value={d.host_id}
                onChange={(e) =>
                  updateDraft(d.key, { host_id: Number(e.target.value) })
                }
              >
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={d.day_of_week}
                onChange={(e) =>
                  updateDraft(d.key, { day_of_week: Number(e.target.value) })
                }
              >
                {WEEKDAYS.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </select>
              <input
                className="input font-num"
                type="time"
                value={d.start_time}
                onChange={(e) =>
                  updateDraft(d.key, { start_time: e.target.value })
                }
              />
              <input
                className="input font-num"
                type="time"
                value={d.end_time}
                onChange={(e) =>
                  updateDraft(d.key, { end_time: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Room or Zoom URL"
                value={d.location}
                onChange={(e) =>
                  updateDraft(d.key, { location: e.target.value })
                }
              />
              <button
                type="button"
                className="rounded p-2 text-muted hover:bg-danger/10 hover:text-danger sm:justify-self-end"
                onClick={() => removeDraft(d.key)}
                aria-label="Remove block"
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={addDraft}
          disabled={hosts.length === 0}
        >
          + Add block
        </button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            className="text-sm text-muted hover:underline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || hosts.length === 0}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- icons --------------------------------------------------------------

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
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
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
