import type { Course } from "@/api/types";

interface CourseCardProps {
  course: Course;
  onDelete?: (slug: string) => void;
}

export function CourseCard({ course, onDelete }: CourseCardProps) {
  return (
    <article
      className="card group relative flex flex-col overflow-hidden"
      style={{ ["--color-accent" as string]: course.color }}
    >
      <div
        aria-hidden
        className="h-20"
        style={{ backgroundColor: "var(--color-accent)" }}
      />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
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
          {onDelete ? (
            <button
              type="button"
              className="rounded p-1 text-muted opacity-0 transition-opacity hover:bg-bg group-hover:opacity-100"
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
        </div>
        {course.instructor_name ? (
          <p className="mt-2 text-sm text-muted">{course.instructor_name}</p>
        ) : null}

        <div className="mt-auto pt-6">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Grade</span>
            <span className="font-num text-2xl font-semibold text-fg">—</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Upload a syllabus to bring this course to life.
          </p>
        </div>
      </div>
    </article>
  );
}
