import { useMemo, useState } from "react";

import type { HostRole, OfficeHour, OfficeHourHost } from "@/api/types";
import {
  useCreateOfficeHour,
  useCreateOfficeHourHost,
  useDeleteOfficeHour,
  useDeleteOfficeHourHost,
  useOfficeHourHosts,
  useOfficeHours,
} from "@/api/liveViews";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface InstructorsTabProps {
  courseSlug: string;
}

/**
 * Instructors tab: host directory + weekly office-hours grid.
 *
 * The weekly grid follows the "Office Hour Week" idea from the SPEC but
 * scoped to a single course. Cross-course consolidation is Stretch #1.
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
      <HostDirectory courseSlug={courseSlug} hosts={hosts} />
      <WeeklyGrid hosts={hosts} hours={hours} courseSlug={courseSlug} />
    </div>
  );
}

// --- host directory -----------------------------------------------------

function HostDirectory({
  courseSlug,
  hosts,
}: {
  courseSlug: string;
  hosts: OfficeHourHost[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const del = useDeleteOfficeHourHost(courseSlug);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Directory</h2>
        <button
          className="btn-secondary text-sm"
          type="button"
          onClick={() => setShowAdd(true)}
        >
          + Add host
        </button>
      </div>
      {hosts.length === 0 ? (
        <p className="text-sm text-muted">
          No instructors or TAs added yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hosts.map((host) => (
            <HostCard
              key={host.id}
              host={host}
              onDelete={() => {
                if (
                  window.confirm(
                    `Remove ${host.name} and all their office hours?`,
                  )
                ) {
                  del.mutate(host.id);
                }
              }}
            />
          ))}
        </div>
      )}
      {showAdd ? (
        <AddHostForm courseSlug={courseSlug} onClose={() => setShowAdd(false)} />
      ) : null}
    </section>
  );
}

function HostCard({
  host,
  onDelete,
}: {
  host: OfficeHourHost;
  onDelete: () => void;
}) {
  return (
    <article className="card p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted">
            {host.role}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold">{host.name}</h3>
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
          onClick={onDelete}
          aria-label={`Remove ${host.name}`}
        >
          <TrashIcon />
        </button>
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

function AddHostForm({
  courseSlug,
  onClose,
}: {
  courseSlug: string;
  onClose: () => void;
}) {
  const create = useCreateOfficeHourHost(courseSlug);
  const [name, setName] = useState("");
  const [role, setRole] = useState<HostRole>("TA");
  const [email, setEmail] = useState("");
  const [zoomLink, setZoomLink] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      role,
      email: email.trim() || null,
      zoom_link: zoomLink.trim() || null,
    });
    onClose();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <p className="mb-3 text-sm font-medium">New host</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <input
          className="input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
        <select
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value as HostRole)}
        >
          <option value="Professor">Professor</option>
          <option value="TA">TA</option>
          <option value="Learning Assistant">Learning Assistant</option>
        </select>
        <input
          className="input"
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          placeholder="Personal Zoom (optional)"
          value={zoomLink}
          onChange={(e) => setZoomLink(e.target.value)}
        />
      </div>
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
  const [showAdd, setShowAdd] = useState(false);
  const del = useDeleteOfficeHour(courseSlug);
  const hostById = useMemo(
    () => new Map(hosts.map((h) => [h.id, h])),
    [hosts],
  );

  const byDay: OfficeHour[][] = useMemo(() => {
    const buckets: OfficeHour[][] = [[], [], [], [], [], [], []];
    for (const h of hours) {
      buckets[h.day_of_week]?.push(h);
    }
    for (const day of buckets) {
      day.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return buckets;
  }, [hours]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Weekly hours</h2>
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => setShowAdd(true)}
          disabled={hosts.length === 0}
          title={hosts.length === 0 ? "Add a host first" : undefined}
        >
          + Add block
        </button>
      </div>

      {hours.length === 0 ? (
        <p className="text-sm text-muted">
          No office hours yet. Add a host, then add their weekly blocks.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          {WEEKDAYS.map((day, idx) => (
            <div
              key={day}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                {day}
              </p>
              <div className="mt-2 space-y-2">
                {byDay[idx].length === 0 ? (
                  <p className="text-xs text-muted">—</p>
                ) : (
                  byDay[idx].map((oh) => (
                    <OfficeHourCard
                      key={oh.id}
                      oh={oh}
                      host={hostById.get(oh.host_id) ?? null}
                      onDelete={() => del.mutate(oh.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <AddHourForm
          courseSlug={courseSlug}
          hosts={hosts}
          onClose={() => setShowAdd(false)}
        />
      ) : null}
    </section>
  );
}

function OfficeHourCard({
  oh,
  host,
  onDelete,
}: {
  oh: OfficeHour;
  host: OfficeHourHost | null;
  onDelete: () => void;
}) {
  const location = oh.location || host?.zoom_link || null;
  const isLink = location && /^https?:\/\//i.test(location);

  return (
    <div className="group relative rounded-lg border border-border bg-bg/40 p-2 text-xs">
      <p className="font-num font-semibold">
        {oh.start_time.slice(0, 5)}–{oh.end_time.slice(0, 5)}
      </p>
      <p className="mt-0.5 text-muted">{host?.name ?? "—"}</p>
      {location ? (
        isLink ? (
          <a
            href={location}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-accent hover:underline"
          >
            Zoom
          </a>
        ) : (
          <p className="mt-1 truncate text-muted">{location}</p>
        )
      ) : null}
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-1 top-1 rounded p-0.5 text-muted opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
        aria-label="Delete block"
      >
        <MiniX />
      </button>
    </div>
  );
}

function AddHourForm({
  courseSlug,
  hosts,
  onClose,
}: {
  courseSlug: string;
  hosts: OfficeHourHost[];
  onClose: () => void;
}) {
  const create = useCreateOfficeHour(courseSlug);
  const [hostId, setHostId] = useState(String(hosts[0]?.id ?? ""));
  const [day, setDay] = useState("0");
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("15:00");
  const [location, setLocation] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hostId) return;
    await create.mutateAsync({
      host_id: Number(hostId),
      day_of_week: Number(day),
      start_time: startTime,
      end_time: endTime,
      location: location.trim() || null,
    });
    onClose();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <p className="mb-3 text-sm font-medium">New office-hour block</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr]">
        <select
          className="input"
          value={hostId}
          onChange={(e) => setHostId(e.target.value)}
          required
        >
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        >
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <input
          className="input font-num"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <input
          className="input font-num"
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />
        <input
          className="input"
          placeholder="Room or Zoom URL"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>
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

// --- icons --------------------------------------------------------------

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

function MiniX() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}
