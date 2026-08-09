import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "@/api/client";
import { useCoursesForSemester } from "@/api/courses";
import { useSemesters, useUpdateSemester } from "@/api/semesters";
import type { Course, OfficeHour, OfficeHourHost } from "@/api/types";
import { BrandMark } from "@/components/BrandMark";
import { EmptyState } from "@/components/EmptyState";
import { SemesterSwitcher } from "@/components/SemesterSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatTime,
  formatTimeRangeCompact,
  minutesToTime,
  readTimeFormat,
  timeToMinutes,
  writeTimeFormat,
  type TimeFormat,
} from "@/lib/timeFormat";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_MINUTES = 30;
const SLOT_PX = 28;
const DEFAULT_START_MIN = 8 * 60;
const DEFAULT_END_MIN = 20 * 60;
const RANGE_PAD_MIN = 30;

type Block = {
  oh: OfficeHour;
  host: OfficeHourHost | null;
  course: Course;
};

/**
 * Consolidated Office Hour Week — all courses, colored by course, filterable
 * by host, with a live now-line (SPEC Screens & Navigation).
 */
export default function OfficeHoursPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [hostFilter, setHostFilter] = useState<string>("all");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() =>
    readTimeFormat(),
  );
  const [now, setNow] = useState(() => new Date());

  const semestersQ = useSemesters();
  const updateSemester = useUpdateSemester();
  const semesters = semestersQ.data;

  useEffect(() => {
    if (!semesters || semesters.length === 0) return;
    if (selectedSlug && semesters.some((s) => s.slug === selectedSlug)) return;
    const active = semesters.find((s) => s.is_active) ?? semesters[0];
    setSelectedSlug(active.slug);
  }, [semesters, selectedSlug]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const activeSemester = useMemo(
    () => semesters?.find((s) => s.slug === selectedSlug) ?? null,
    [semesters, selectedSlug],
  );

  const coursesQ = useCoursesForSemester(selectedSlug);
  const courses = coursesQ.data ?? [];

  const hostQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ["office-hour-hosts", c.slug] as const,
      queryFn: () =>
        apiRequest<OfficeHourHost[]>(`/courses/${c.slug}/office-hour-hosts`),
      enabled: !!c.slug,
    })),
  });

  const hourQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ["office-hours", c.slug] as const,
      queryFn: () =>
        apiRequest<OfficeHour[]>(`/courses/${c.slug}/office-hours`),
      enabled: !!c.slug,
    })),
  });

  const anyLoading =
    semestersQ.isLoading ||
    coursesQ.isLoading ||
    hostQueries.some((q) => q.isLoading) ||
    hourQueries.some((q) => q.isLoading);

  const blocks: Block[] = useMemo(() => {
    const out: Block[] = [];
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const hosts = hostQueries[i]?.data ?? [];
      const hours = hourQueries[i]?.data ?? [];
      const hostById = new Map(hosts.map((h) => [h.id, h]));
      for (const oh of hours) {
        out.push({
          oh,
          host: hostById.get(oh.host_id) ?? null,
          course,
        });
      }
    }
    return out;
  }, [courses, hostQueries, hourQueries]);

  const hostOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of blocks) {
      if (!b.host) continue;
      const key = `${b.course.slug}:${b.host.id}`;
      if (!seen.has(key)) {
        seen.set(key, `${b.host.name} · ${b.course.code || b.course.name}`);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [blocks]);

  const filtered = useMemo(() => {
    if (hostFilter === "all") return blocks;
    return blocks.filter((b) => {
      if (!b.host) return false;
      return `${b.course.slug}:${b.host.id}` === hostFilter;
    });
  }, [blocks, hostFilter]);

  function handleSelectSemester(slug: string) {
    if (slug === selectedSlug) {
      navigate("/");
      return;
    }
    setSelectedSlug(slug);
    setHostFilter("all");
    const target = semesters?.find((s) => s.slug === slug);
    if (target && !target.is_active) {
      updateSemester.mutate({ slug, payload: { is_active: true } });
    }
  }

  function toggleTimeFormat() {
    const next: TimeFormat = timeFormat === "24" ? "12" : "24";
    setTimeFormat(next);
    writeTimeFormat(next);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
          <BrandMark />
          <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-4">
            {user ? (
              <>
                <span className="hidden truncate text-muted sm:inline">
                  {user.email}
                </span>
                <button className="btn-ghost" onClick={signOut} type="button">
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        {semestersQ.isLoading || !semesters ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <SemesterSwitcher
              semesters={semesters}
              activeSlug={selectedSlug}
              onSelect={handleSelectSemester}
              officeHoursActive
            />

            <div className="mb-6 mt-8 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Office hours
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Weekly grid across every course in{" "}
                  {activeSemester?.name ?? "this semester"}. Blocks are colored
                  by course; filter by host when you need one person.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hostOptions.length > 0 ? (
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <span className="sr-only">Filter by host</span>
                    <select
                      className="input py-1.5 text-xs"
                      value={hostFilter}
                      onChange={(e) => setHostFilter(e.target.value)}
                    >
                      <option value="all">All hosts</option>
                      {hostOptions.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={toggleTimeFormat}
                >
                  {timeFormat === "24" ? "12h" : "24h"}
                </button>
              </div>
            </div>

            {courses.length > 0 && filtered.length > 0 ? (
              <CourseLegend courses={coursesWithBlocks(courses, filtered)} />
            ) : null}

            {anyLoading ? (
              <p className="mt-6 text-sm text-muted">Loading office hours…</p>
            ) : courses.length === 0 ? (
              <EmptyState
                title="No courses yet"
                description="Add a course and commit its syllabus — office hours extracted from the PDF show up here."
                action={
                  <Link to="/" className="btn-primary">
                    Back to semester hub
                  </Link>
                }
              />
            ) : blocks.length === 0 ? (
              <EmptyState
                title="No office hours this semester"
                description="Hours appear after a syllabus commit, or you can add them on each course’s Instructors tab."
                action={
                  <Link to="/" className="btn-primary">
                    Back to semester hub
                  </Link>
                }
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No hours for that host"
                description="Try another host, or clear the filter to see everyone."
                action={
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setHostFilter("all")}
                  >
                    Show all hosts
                  </button>
                }
              />
            ) : (
              <div className="mt-6">
                <ConsolidatedGrid
                  blocks={filtered}
                  timeFormat={timeFormat}
                  now={now}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function coursesWithBlocks(courses: Course[], blocks: Block[]): Course[] {
  const used = new Set(blocks.map((b) => b.course.slug));
  return courses.filter((c) => used.has(c.slug));
}

function CourseLegend({ courses }: { courses: Course[] }) {
  return (
    <ul className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {courses.map((c) => (
        <li key={c.slug} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: c.color }}
          />
          <span className="text-muted">{c.name}</span>
        </li>
      ))}
    </ul>
  );
}

function ConsolidatedGrid({
  blocks,
  timeFormat,
  now,
}: {
  blocks: Block[];
  timeFormat: TimeFormat;
  now: Date;
}) {
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (blocks.length === 0) {
      return { rangeStart: DEFAULT_START_MIN, rangeEnd: DEFAULT_END_MIN };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const b of blocks) {
      min = Math.min(min, timeToMinutes(b.oh.start_time));
      max = Math.max(max, timeToMinutes(b.oh.end_time));
    }
    let start = Math.max(
      0,
      Math.floor((min - RANGE_PAD_MIN) / SLOT_MINUTES) * SLOT_MINUTES,
    );
    let end = Math.min(
      24 * 60,
      Math.ceil((max + RANGE_PAD_MIN) / SLOT_MINUTES) * SLOT_MINUTES,
    );
    if (end - start < 4 * 60) {
      start = Math.min(start, DEFAULT_START_MIN);
      end = Math.max(end, Math.min(DEFAULT_END_MIN, start + 4 * 60));
    }
    return { rangeStart: start, rangeEnd: Math.max(end, start + SLOT_MINUTES) };
  }, [blocks]);

  const totalMinutes = rangeEnd - rangeStart;
  const totalHeight = (totalMinutes / SLOT_MINUTES) * SLOT_PX;

  const slots: number[] = [];
  for (let m = rangeStart; m < rangeEnd; m += SLOT_MINUTES) {
    slots.push(m);
  }

  const byDay = useMemo(() => {
    const buckets: Block[][] = [[], [], [], [], [], [], []];
    for (const b of blocks) {
      buckets[b.oh.day_of_week]?.push(b);
    }
    return buckets.map((day) => layoutOverlaps(day));
  }, [blocks]);

  // JS getDay(): 0=Sun … 6=Sat. Our grid: 0=Mon … 6=Sun.
  const jsDay = now.getDay();
  const gridDay = jsDay === 0 ? 6 : jsDay - 1;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine =
    nowMinutes >= rangeStart && nowMinutes <= rangeEnd;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}
      >
        <div className="border-b border-border" />
        {WEEKDAYS.map((day, dayIdx) => (
          <div
            key={day}
            className={cn(
              "border-b border-l border-border px-2 py-2 text-center text-xs font-medium uppercase tracking-wider",
              dayIdx === gridDay ? "text-fg" : "text-muted",
            )}
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

            {showNowLine && dayIdx === gridDay ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-20"
                style={{
                  top: ((nowMinutes - rangeStart) / SLOT_MINUTES) * SLOT_PX,
                }}
              >
                <div className="relative h-px bg-accent">
                  <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent" />
                </div>
              </div>
            ) : null}

            {byDay[dayIdx].map(({ block, col, colCount }) => {
              const start = timeToMinutes(block.oh.start_time);
              const end = timeToMinutes(block.oh.end_time);
              const top = ((start - rangeStart) / SLOT_MINUTES) * SLOT_PX;
              const height = Math.max(
                ((end - start) / SLOT_MINUTES) * SLOT_PX,
                SLOT_PX * 0.75,
              );
              const widthPct = 100 / colCount;
              const leftPct = col * widthPct;

              return (
                <OfficeHourBlock
                  key={`${block.course.slug}-${block.oh.id}`}
                  block={block}
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

function OfficeHourBlock({
  block,
  timeFormat,
  height,
  style,
}: {
  block: Block;
  timeFormat: TimeFormat;
  height: number;
  style: CSSProperties;
}) {
  const [tip, setTip] = useState<{
    left: number;
    top: number;
    above: boolean;
  } | null>(null);
  const color = block.course.color;
  const hostName = block.host?.name ?? "—";
  const location =
    block.oh.location || block.host?.zoom_link || null;
  const isLink = !!(location && /^https?:\/\//i.test(location));
  const locationLabel = location ? (isLink ? "Zoom" : location) : null;
  const fullTime = `${formatTime(block.oh.start_time, timeFormat)}–${formatTime(block.oh.end_time, timeFormat)}`;
  const compactTime = formatTimeRangeCompact(
    block.oh.start_time,
    block.oh.end_time,
    timeFormat,
  );
  const showTime = height >= SLOT_PX * 1.35;
  const showCourse = height >= SLOT_PX * 2.0;

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
        aria-label={`${hostName}, ${block.course.name}, ${fullTime}${locationLabel ? `, ${locationLabel}` : ""}`}
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
          {showCourse ? (
            <p className="mt-0.5 truncate text-muted">
              {block.course.code || block.course.name}
            </p>
          ) : null}
        </div>
      </div>
      {tip
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[60] w-max max-w-[240px] -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
              style={{
                left: tip.left,
                top: tip.top,
                transform: tip.above
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
              }}
            >
              <p className="font-semibold text-fg">{hostName}</p>
              {block.host?.role ? (
                <p className="text-muted">{block.host.role}</p>
              ) : null}
              <p className="mt-1 text-fg">
                {block.course.code || block.course.name}
              </p>
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

function layoutOverlaps(
  dayBlocks: Block[],
): { block: Block; col: number; colCount: number }[] {
  const sorted = [...dayBlocks].sort((a, b) => {
    const s =
      timeToMinutes(a.oh.start_time) - timeToMinutes(b.oh.start_time);
    if (s !== 0) return s;
    return timeToMinutes(a.oh.end_time) - timeToMinutes(b.oh.end_time);
  });

  type Active = { end: number; col: number };
  const result: { block: Block; col: number; cluster: number }[] = [];
  let active: Active[] = [];
  let clusterId = 0;

  for (const block of sorted) {
    const start = timeToMinutes(block.oh.start_time);
    const end = timeToMinutes(block.oh.end_time);
    active = active.filter((a) => a.end > start);
    if (active.length === 0) {
      clusterId += 1;
    }
    const used = new Set(active.map((a) => a.col));
    let col = 0;
    while (used.has(col)) col += 1;
    active.push({ end, col });
    result.push({ block, col, cluster: clusterId });
  }

  const maxByCluster = new Map<number, number>();
  for (const row of result) {
    maxByCluster.set(
      row.cluster,
      Math.max(maxByCluster.get(row.cluster) ?? 0, row.col + 1),
    );
  }

  return result.map((row) => ({
    block: row.block,
    col: row.col,
    colCount: maxByCluster.get(row.cluster) ?? 1,
  }));
}
