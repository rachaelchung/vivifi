import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "@/api/client";
import { useCoursesForSemester } from "@/api/courses";
import { useSemesters, useUpdateSemester } from "@/api/semesters";
import type {
  ClassMeeting,
  ClassMeetingKind,
  Course,
  OfficeHour,
  OfficeHourHost,
} from "@/api/types";
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

const KIND_LABELS: Record<ClassMeetingKind, string> = {
  lecture: "Lecture",
  recitation: "Recitation",
  lab: "Lab",
  seminar: "Seminar",
  other: "Other",
};

type GridBlock =
  | {
      type: "office_hour";
      id: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      course: Course;
      oh: OfficeHour;
      host: OfficeHourHost | null;
    }
  | {
      type: "class_meeting";
      id: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      course: Course;
      meeting: ClassMeeting;
    };

/**
 * Cross-course Week Schedule — my class meetings (default) and/or office
 * hours, colored by course, with a live now-line.
 */
export default function OfficeHoursPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [hostFilter, setHostFilter] = useState<string>("all");
  const [showSchedule, setShowSchedule] = useState(true);
  const [showOfficeHours, setShowOfficeHours] = useState(false);
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
      enabled: !!c.slug && showOfficeHours,
    })),
  });

  const hourQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ["office-hours", c.slug] as const,
      queryFn: () =>
        apiRequest<OfficeHour[]>(`/courses/${c.slug}/office-hours`),
      enabled: !!c.slug && showOfficeHours,
    })),
  });

  const meetingQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ["class-meetings", c.slug] as const,
      queryFn: () =>
        apiRequest<ClassMeeting[]>(`/courses/${c.slug}/class-meetings`),
      enabled: !!c.slug && showSchedule,
    })),
  });

  const anyLoading =
    semestersQ.isLoading ||
    coursesQ.isLoading ||
    (showOfficeHours &&
      (hostQueries.some((q) => q.isLoading) ||
        hourQueries.some((q) => q.isLoading))) ||
    (showSchedule && meetingQueries.some((q) => q.isLoading));

  const ohBlocks: GridBlock[] = useMemo(() => {
    if (!showOfficeHours) return [];
    const out: GridBlock[] = [];
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const hosts = hostQueries[i]?.data ?? [];
      const hours = hourQueries[i]?.data ?? [];
      const hostById = new Map(hosts.map((h) => [h.id, h]));
      for (const oh of hours) {
        out.push({
          type: "office_hour",
          id: `oh-${course.slug}-${oh.id}`,
          day_of_week: oh.day_of_week,
          start_time: oh.start_time,
          end_time: oh.end_time,
          course,
          oh,
          host: hostById.get(oh.host_id) ?? null,
        });
      }
    }
    return out;
  }, [courses, hostQueries, hourQueries, showOfficeHours]);

  const classBlocks: GridBlock[] = useMemo(() => {
    if (!showSchedule) return [];
    const out: GridBlock[] = [];
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const meetings = meetingQueries[i]?.data ?? [];
      for (const meeting of meetings) {
        if (!meeting.is_mine) continue;
        out.push({
          type: "class_meeting",
          id: `cm-${course.slug}-${meeting.id}`,
          day_of_week: meeting.day_of_week,
          start_time: meeting.start_time,
          end_time: meeting.end_time,
          course,
          meeting,
        });
      }
    }
    return out;
  }, [courses, meetingQueries, showSchedule]);

  const hostOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of ohBlocks) {
      if (b.type !== "office_hour" || !b.host) continue;
      const key = `${b.course.slug}:${b.host.id}`;
      if (!seen.has(key)) {
        seen.set(key, `${b.host.name} · ${b.course.code || b.course.name}`);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [ohBlocks]);

  const filteredOh = useMemo(() => {
    if (hostFilter === "all") return ohBlocks;
    return ohBlocks.filter((b) => {
      if (b.type !== "office_hour" || !b.host) return false;
      return `${b.course.slug}:${b.host.id}` === hostFilter;
    });
  }, [ohBlocks, hostFilter]);

  const visibleBlocks = useMemo(
    () => [...classBlocks, ...filteredOh],
    [classBlocks, filteredOh],
  );

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

  const layersOff = !showSchedule && !showOfficeHours;
  const legendCourses = coursesWithBlocks(courses, visibleBlocks);

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

            <div className="mb-6 mt-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Week schedule
                </h1>
                <p className="mt-1 max-w-xl text-sm text-muted">
                  Your class meetings and office hours across{" "}
                  {activeSemester?.name ?? "this semester"}. Toggle layers to
                  focus; blocks are colored by course.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 self-end sm:self-start">
                <div className="flex items-center gap-2">
                  <div
                    role="group"
                    aria-label="Schedule layers"
                    className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
                  >
                    <button
                      type="button"
                      aria-pressed={showSchedule}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        showSchedule
                          ? "bg-fg text-bg"
                          : "text-muted hover:text-fg",
                      )}
                      onClick={() => setShowSchedule((v) => !v)}
                    >
                      My schedule
                    </button>
                    <button
                      type="button"
                      aria-pressed={showOfficeHours}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        showOfficeHours
                          ? "bg-fg text-bg"
                          : "text-muted hover:text-fg",
                      )}
                      onClick={() => setShowOfficeHours((v) => !v)}
                    >
                      Office hours
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={toggleTimeFormat}
                  >
                    {timeFormat === "24" ? "12h" : "24h"}
                  </button>
                </div>
                {showOfficeHours && hostOptions.length > 0 ? (
                  <label className="block w-[min(100%,14rem)]">
                    <span className="sr-only">Filter by host</span>
                    <select
                      className="input w-full truncate py-1.5 text-xs"
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
              </div>
            </div>

            {courses.length > 0 && visibleBlocks.length > 0 ? (
              <CourseLegend courses={legendCourses} />
            ) : null}

            {anyLoading ? (
              <p className="mt-6 text-sm text-muted">Loading schedule…</p>
            ) : courses.length === 0 ? (
              <EmptyState
                title="No courses yet"
                description="Add a course and commit its syllabus — class meetings and office hours show up here."
                action={
                  <Link to="/" className="btn-primary">
                    Back to semester hub
                  </Link>
                }
              />
            ) : layersOff ? (
              <EmptyState
                title="Nothing selected"
                description="Turn on My schedule, Office hours, or both to fill the week grid."
              />
            ) : visibleBlocks.length === 0 ? (
              <EmptyState
                title={
                  showSchedule && !showOfficeHours
                    ? "No class meetings on your schedule"
                    : showOfficeHours && !showSchedule
                      ? "No office hours this semester"
                      : "Nothing to show for these layers"
                }
                description={
                  showSchedule && !showOfficeHours
                    ? "Mark meetings as Mine on each course’s Meetings tab, or turn on Office hours."
                    : showOfficeHours && !showSchedule
                      ? "Hours appear after a syllabus commit, or add them on each course’s Instructors tab."
                      : "Try enabling the other layer, or clear the host filter."
                }
                action={
                  showOfficeHours &&
                  hostFilter !== "all" &&
                  filteredOh.length === 0 &&
                  ohBlocks.length > 0 ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setHostFilter("all")}
                    >
                      Show all hosts
                    </button>
                  ) : (
                    <Link to="/" className="btn-primary">
                      Back to semester hub
                    </Link>
                  )
                }
              />
            ) : (
              <div className="mt-6">
                <ConsolidatedGrid
                  blocks={visibleBlocks}
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

function coursesWithBlocks(courses: Course[], blocks: GridBlock[]): Course[] {
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
  blocks: GridBlock[];
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
      min = Math.min(min, timeToMinutes(b.start_time));
      max = Math.max(max, timeToMinutes(b.end_time));
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
    const buckets: GridBlock[][] = [[], [], [], [], [], [], []];
    for (const b of blocks) {
      buckets[b.day_of_week]?.push(b);
    }
    return buckets.map((day) => layoutOverlaps(day));
  }, [blocks]);

  const jsDay = now.getDay();
  const gridDay = jsDay === 0 ? 6 : jsDay - 1;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = nowMinutes >= rangeStart && nowMinutes <= rangeEnd;

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
              const start = timeToMinutes(block.start_time);
              const end = timeToMinutes(block.end_time);
              const top = ((start - rangeStart) / SLOT_MINUTES) * SLOT_PX;
              const height = Math.max(
                ((end - start) / SLOT_MINUTES) * SLOT_PX,
                SLOT_PX * 0.75,
              );
              const widthPct = 100 / colCount;
              const leftPct = col * widthPct;

              return (
                <ScheduleBlock
                  key={block.id}
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

function ScheduleBlock({
  block,
  timeFormat,
  height,
  style,
}: {
  block: GridBlock;
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
  const isClass = block.type === "class_meeting";
  const title = isClass
    ? KIND_LABELS[block.meeting.kind]
    : (block.host?.name ?? "—");
  const subtitle = isClass
    ? block.meeting.section
      ? `§ ${block.meeting.section}`
      : null
    : null;
  const location = isClass
    ? block.meeting.location
    : block.oh.location || block.host?.zoom_link || null;
  const isLink = !!(location && /^https?:\/\//i.test(location));
  const locationLabel = location ? (isLink ? "Zoom" : location) : null;
  const fullTime = `${formatTime(block.start_time, timeFormat)}–${formatTime(block.end_time, timeFormat)}`;
  const compactTime = formatTimeRangeCompact(
    block.start_time,
    block.end_time,
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
        aria-label={`${title}, ${block.course.name}, ${fullTime}${locationLabel ? `, ${locationLabel}` : ""}`}
      >
        <div
          className="h-full overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight"
          style={{
            backgroundColor: isClass
              ? `color-mix(in oklab, ${color} 38%, white)`
              : `color-mix(in oklab, ${color} 18%, white)`,
            borderLeft: `3px solid ${color}`,
            // Office-hour blocks use a dashed outline so they read apart from classes.
            boxShadow: isClass
              ? undefined
              : `inset 0 0 0 1px color-mix(in oklab, ${color} 45%, transparent)`,
            backgroundImage: isClass
              ? undefined
              : `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 4px,
                  color-mix(in oklab, ${color} 12%, transparent) 4px,
                  color-mix(in oklab, ${color} 12%, transparent) 5px
                )`,
            color: "var(--color-fg)",
          }}
        >
          <p className="truncate font-semibold">{title}</p>
          {subtitle ? (
            <p className="truncate text-muted">{subtitle}</p>
          ) : null}
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
              <p className="font-semibold text-fg">{title}</p>
              {isClass ? (
                <p className="text-muted">Class meeting</p>
              ) : block.host?.role ? (
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
  dayBlocks: GridBlock[],
): { block: GridBlock; col: number; colCount: number }[] {
  const sorted = [...dayBlocks].sort((a, b) => {
    const s = timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
    if (s !== 0) return s;
    return timeToMinutes(a.end_time) - timeToMinutes(b.end_time);
  });

  type Active = { end: number; col: number };
  const result: { block: GridBlock; col: number; cluster: number }[] = [];
  let active: Active[] = [];
  let clusterId = 0;

  for (const block of sorted) {
    const start = timeToMinutes(block.start_time);
    const end = timeToMinutes(block.end_time);
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
