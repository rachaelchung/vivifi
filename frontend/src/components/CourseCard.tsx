import { Link } from "react-router-dom";

import { useCurrentGrade } from "@/api/liveViews";
import type { Course } from "@/api/types";

interface CourseCardProps {
  course: Course;
  onDelete?: (slug: string) => void;
}

export function CourseCard({ course, onDelete }: CourseCardProps) {
  const isCommitted = course.syllabus_committed_at !== null;
  // Only fetch grade for committed courses — uncommitted ones don't have any
  // categories / entries yet, so the query would return an empty result anyway.
  const gradeQ = useCurrentGrade(isCommitted ? course.slug : null);
  const percentage = gradeQ.data?.percentage;
  const letter = gradeQ.data?.letter;

  return (
    <article
      className="card group relative flex flex-col overflow-hidden"
      style={{ ["--color-accent" as string]: course.color }}
    >
      <Link
        to={`/courses/${course.slug}`}
        className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`Open ${course.name}`}
      >
        <div
          aria-hidden
          className="h-20"
          style={{ backgroundColor: "var(--color-accent)" }}
        />
        <div className="flex flex-1 flex-col p-5">
          <div>
            {course.code ? (
              <p className="font-num text-xs uppercase tracking-wider text-muted">
                {course.code}
              </p>
            ) : null}
            <h3 className="mt-1 text-lg font-semibold leading-tight text-fg">
              {course.name}
            </h3>
          </div>
          {course.instructor_name ? (
            <p className="mt-2 text-sm text-muted">{course.instructor_name}</p>
          ) : null}

          <div className="mt-auto pt-6">
            {isCommitted ? (
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Grade
                </span>
                <span className="font-num text-2xl font-semibold text-fg">
                  {percentage !== null && percentage !== undefined
                    ? `${Math.round(percentage * 10) / 10}%`
                    : "—"}
                  {letter ? (
                    <span className="ml-2 text-base text-muted">{letter}</span>
                  ) : null}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-accent">
                <svg
                  aria-hidden
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="font-medium">Upload syllabus</span>
              </div>
            )}
            <p className="mt-1 text-xs text-muted">
              {isCommitted
                ? percentage === null
                  ? "Enter your first grade to see it here."
                  : "From your gradebook"
                : "Bring this course to life."}
            </p>
          </div>
        </div>
      </Link>
      {onDelete ? (
        <button
          type="button"
          className="absolute right-3 top-3 rounded p-1 text-white/80 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100"
          aria-label={`Delete ${course.name}`}
          onClick={() => onDelete(course.slug)}
        >
          <svg
            aria-hidden
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
        </button>
      ) : null}
    </article>
  );
}
