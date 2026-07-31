import { Link, useNavigate, useParams } from "react-router-dom";

import { useCourse } from "@/api/courses";
import { BrandMark } from "@/components/BrandMark";
import { SyllabusUpload } from "@/components/SyllabusUpload";
import { useAuth } from "@/contexts/AuthContext";

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: course, isLoading, error } = useCourse(slug ?? null);

  return (
    <div
      className="min-h-screen"
      style={course ? { ["--color-accent" as string]: course.color } : undefined}
    >
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="text-muted">/</span>
            <Link
              to="/"
              className="text-sm font-medium text-muted hover:text-fg"
            >
              Semester
            </Link>
          </div>
          {user ? (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted">{user.email}</span>
              <button className="btn-ghost" onClick={signOut} type="button">
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-8">
        {isLoading ? (
          <p className="text-sm text-muted">Loading course…</p>
        ) : error || !course ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-muted">Couldn't load that course.</p>
            <Link to="/" className="mt-4 inline-block text-sm text-accent hover:underline">
              Back to semester
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8 flex items-center gap-4">
              <span
                aria-hidden
                className="h-6 w-6 flex-shrink-0 rounded-md"
                style={{ backgroundColor: course.color }}
              />
              <div>
                {course.code ? (
                  <p className="font-num text-xs uppercase tracking-wider text-muted">
                    {course.code}
                  </p>
                ) : null}
                <h1 className="text-3xl font-semibold tracking-tight">
                  {course.name}
                </h1>
                {course.instructor_name ? (
                  <p className="mt-1 text-sm text-muted">{course.instructor_name}</p>
                ) : null}
              </div>
            </div>

            {course.syllabus_committed_at ? (
              <CommittedShell />
            ) : (
              <section>
                <div className="mb-6">
                  <p className="text-xs font-medium uppercase tracking-wider text-accent">
                    Step 1
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Bring this course to life.
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted">
                    Upload the syllabus (PDF, or paste the text). Vivifi extracts
                    the course meta, grade breakdown, assignments, exams, hosts,
                    and office hours. You review and edit everything on the next
                    screen before anything is saved.
                  </p>
                </div>

                <SyllabusUpload
                  courseSlug={course.slug}
                  courseColor={course.color}
                  onExtracted={(response) =>
                    navigate(`/courses/${course.slug}/review`, {
                      state: { response },
                    })
                  }
                />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CommittedShell() {
  // Milestone 2 lands the ingestion pipeline; the live Gradebook / Assignments
  // / Instructors tabs come in Milestone 3. This is the intentional stub.
  return (
    <div className="card p-8">
      <p className="text-xs font-medium uppercase tracking-wider text-accent">
        Syllabus committed
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">
        Your syllabus is live.
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        The Gradebook, Assignments, Instructors, and Calendar tabs land in the
        next milestone. Your data is safely stored — nothing you commit here is
        lost.
      </p>
    </div>
  );
}
