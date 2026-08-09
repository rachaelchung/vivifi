import FullCalendar from "@fullcalendar/react";
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, apiRequest } from "@/api/client";
import { useCoursesForSemester } from "@/api/courses";
import { useSemesters, useUpdateSemester } from "@/api/semesters";
import type { Assignment, Course } from "@/api/types";
import { BrandMark } from "@/components/BrandMark";
import { SemesterSwitcher } from "@/components/SemesterSwitcher";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Multi-course calendar view.
 *
 * SPEC:
 * - Month view first (list/week are Stretch #3).
 * - Assignments are draggable → PATCH `due_date` server-side.
 * - Exams render distinctively AND are non-draggable.
 * - Completion toggles the Assignment row only (split model — never the
 *   gradebook). Completed rows fade + strike through, matching Assignments.
 * - Events show the course name under the title; legend uses course names.
 */
export default function CalendarPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const calRef = useRef<FullCalendar | null>(null);
  const [title, setTitle] = useState<string>("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const semestersQ = useSemesters();
  const updateSemester = useUpdateSemester();
  const semesters = semestersQ.data;

  useEffect(() => {
    if (!semesters || semesters.length === 0) return;
    if (selectedSlug && semesters.some((s) => s.slug === selectedSlug)) return;
    const active = semesters.find((s) => s.is_active) ?? semesters[0];
    setSelectedSlug(active.slug);
  }, [semesters, selectedSlug]);

  const activeSemester = useMemo(
    () => semesters?.find((s) => s.slug === selectedSlug) ?? null,
    [semesters, selectedSlug],
  );

  const coursesQ = useCoursesForSemester(selectedSlug);
  const courses = coursesQ.data ?? [];
  const qc = useQueryClient();

  const assignmentQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ["assignments", c.slug] as const,
      queryFn: () =>
        apiRequest<Assignment[]>(`/courses/${c.slug}/assignments`),
      enabled: !!c.slug,
    })),
  });

  const anyLoading =
    semestersQ.isLoading ||
    coursesQ.isLoading ||
    assignmentQueries.some((q) => q.isLoading);

  const events: EventInput[] = useMemo(() => {
    const out: EventInput[] = [];
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const rows = assignmentQueries[i]?.data ?? [];
      for (const a of rows) {
        if (!a.due_date) continue;
        const isExam = a.kind === "exam";
        const done = a.completed;
        out.push({
          id: `${course.slug}:${a.slug}`,
          title: a.name,
          start: a.due_date,
          allDay: true,
          editable: !isExam && !done,
          startEditable: !isExam && !done,
          durationEditable: false,
          backgroundColor: course.color,
          borderColor: course.color,
          textColor: readableTextColor(course.color),
          classNames: [
            isExam ? "vv-event-exam" : "vv-event-assignment",
            done ? "vv-event-done" : "",
          ].filter(Boolean),
          extendedProps: {
            courseSlug: course.slug,
            courseName: course.name,
            assignmentSlug: a.slug,
            completed: done,
            kind: a.kind,
          },
        });
      }
    }
    return out;
  }, [courses, assignmentQueries]);

  function handleSelectSemester(slug: string) {
    // Clicking the already-selected semester leaves calendar for that hub.
    if (slug === selectedSlug) {
      navigate("/");
      return;
    }
    setSelectedSlug(slug);
    const target = semesters?.find((s) => s.slug === slug);
    if (target && !target.is_active) {
      updateSemester.mutate({ slug, payload: { is_active: true } });
    }
  }

  async function handleEventDrop(info: EventDropArg) {
    const { courseSlug, assignmentSlug, kind } = info.event.extendedProps as {
      courseSlug: string;
      assignmentSlug: string;
      kind: string;
    };
    if (kind === "exam") {
      info.revert();
      return;
    }
    const iso = info.event.start?.toISOString().slice(0, 10);
    if (!iso) {
      info.revert();
      return;
    }

    try {
      await apiRequest<Assignment>(
        `/courses/${courseSlug}/assignments/${assignmentSlug}`,
        { method: "PATCH", body: { due_date: iso } },
      );
      qc.invalidateQueries({ queryKey: ["assignments", courseSlug] });
    } catch (err) {
      const detail =
        err instanceof ApiError ? err.detail : "Reschedule failed.";
      window.alert(detail);
      info.revert();
    }
  }

  async function toggleCompleted(
    courseSlug: string,
    assignmentSlug: string,
    next: boolean,
  ) {
    await apiRequest<Assignment>(
      `/courses/${courseSlug}/assignments/${assignmentSlug}`,
      { method: "PATCH", body: { completed: next } },
    );
    qc.invalidateQueries({ queryKey: ["assignments", courseSlug] });
  }

  function handleEventClick(info: EventClickArg) {
    // Ignore clicks that originated on the checkbox (it handles itself).
    const target = info.jsEvent.target as HTMLElement | null;
    if (target?.closest("[data-vv-complete]")) {
      info.jsEvent.preventDefault();
      return;
    }
    const { courseSlug } = info.event.extendedProps as { courseSlug: string };
    navigate(`/courses/${courseSlug}`);
  }

  function renderEventContent(arg: EventContentArg) {
    const {
      courseName,
      courseSlug,
      assignmentSlug,
      completed,
    } = arg.event.extendedProps as {
      courseName: string;
      courseSlug: string;
      assignmentSlug: string;
      completed: boolean;
    };

    return (
      <div
        className={
          "vv-event-inner flex min-w-0 items-start gap-1.5 " +
          (completed ? "opacity-55" : "")
        }
      >
        <input
          data-vv-complete
          type="checkbox"
          checked={completed}
          className="vv-event-check mt-0.5 h-3 w-3 flex-shrink-0 accent-current"
          aria-label={
            completed
              ? `Mark ${arg.event.title} not done`
              : `Mark ${arg.event.title} done`
          }
          onClick={(e) => {
            e.stopPropagation();
          }}
          onChange={(e) => {
            e.stopPropagation();
            void toggleCompleted(
              courseSlug,
              assignmentSlug,
              e.target.checked,
            );
          }}
        />
        <div className="min-w-0 flex-1 leading-tight">
          <div
            className={
              "truncate font-medium " +
              (completed ? "line-through opacity-80" : "")
            }
          >
            {arg.event.title}
          </div>
          <div
            className={
              "truncate text-[10px] font-normal opacity-80 " +
              (completed ? "line-through" : "")
            }
          >
            {courseName}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <BrandMark />
          <div className="flex items-center gap-4 text-sm">
            {user ? (
              <>
                <span className="text-muted">{user.email}</span>
                <button className="btn-ghost" onClick={signOut} type="button">
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-8">
        {semestersQ.isLoading || !semesters ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <SemesterSwitcher
              semesters={semesters}
              activeSlug={selectedSlug}
              onSelect={handleSelectSemester}
              calendarActive
            />

            <div className="mb-6 mt-8 flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Calendar
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Everything due across your courses in{" "}
                  {activeSemester?.name ?? "this semester"}. Drag to reschedule
                  an assignment; exams are locked. Check off tasks here — same
                  list as Assignments.
                </p>
              </div>
              {courses.length > 0 ? <CourseLegend courses={courses} /> : null}
            </div>

            {anyLoading ? (
              <p className="text-sm text-muted">Loading calendar…</p>
            ) : courses.length === 0 ? (
              <p className="text-sm text-muted">
                No courses in this semester yet.{" "}
                <Link to="/" className="text-accent hover:underline">
                  Add one from the hub
                </Link>
                .
              </p>
            ) : (
              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium">{title}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => calRef.current?.getApi().prev()}
                    >
                      ‹ Prev
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => calRef.current?.getApi().today()}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => calRef.current?.getApi().next()}
                    >
                      Next ›
                    </button>
                  </div>
                </div>
                <FullCalendar
                  ref={calRef}
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  headerToolbar={false}
                  height="auto"
                  firstDay={0}
                  events={events}
                  eventContent={renderEventContent}
                  eventDrop={handleEventDrop}
                  eventClick={handleEventClick}
                  datesSet={(info: DatesSetArg) => setTitle(info.view.title)}
                  eventDisplay="block"
                  displayEventTime={false}
                  dayMaxEventRows={5}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CourseLegend({ courses }: { courses: Course[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
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

function readableTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "#ffffff";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 145 ? "#1b1b1f" : "#ffffff";
}
