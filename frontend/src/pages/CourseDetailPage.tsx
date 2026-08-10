import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useCourse } from "@/api/courses";
import { useNotes } from "@/api/liveViews";
import type { SyllabusExtractResponse } from "@/api/types";
import { BrandMark } from "@/components/BrandMark";
import { AssignmentsTab } from "@/components/courseDetail/AssignmentsTab";
import { GradebookTab } from "@/components/courseDetail/GradebookTab";
import { InstructorsTab } from "@/components/courseDetail/InstructorsTab";
import { MaterialsTab } from "@/components/courseDetail/MaterialsTab";
import { MeetingsTab } from "@/components/courseDetail/MeetingsTab";
import { NotesTab } from "@/components/courseDetail/NotesTab";
import { TabNav, type CourseTabId } from "@/components/courseDetail/TabNav";
import { EditCourseModal } from "@/components/EditCourseModal";
import { SyllabusUpload } from "@/components/SyllabusUpload";
import { emptyManualExtraction } from "@/components/syllabusReview/constants";
import { useAuth } from "@/contexts/AuthContext";

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: course, isLoading, error } = useCourse(slug ?? null);

  const [tab, setTab] = useState<CourseTabId>("gradebook");
  const [editOpen, setEditOpen] = useState(false);
  // Notes tab is conditional on there being at least one note — SPEC.
  // The hook is enabled even before the course loads so the count is ready.
  const notesQ = useNotes(course?.syllabus_committed_at ? course.slug : null);
  const showNotes = (notesQ.data?.length ?? 0) > 0;

  function goToReview(response: SyllabusExtractResponse, manual = false) {
    if (!course) return;
    navigate(`/courses/${course.slug}/review`, {
      state: { response, manual },
    });
  }

  function handleSetupManually() {
    if (!course) return;
    goToReview(
      {
        extraction: emptyManualExtraction(course),
        looks_incomplete: false,
        has_no_assignments: true,
      },
      true,
    );
  }

  return (
    <div
      className="min-h-screen"
      style={course ? { ["--color-accent" as string]: course.color } : undefined}
    >
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <BrandMark />
            <span className="hidden text-muted sm:inline">/</span>
            <Link
              to="/"
              className="hidden text-sm font-medium text-muted hover:text-fg sm:inline"
            >
              Semester
            </Link>
          </div>
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

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        {isLoading ? (
          <p className="text-sm text-muted">Loading course…</p>
        ) : error || !course ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-muted">
              Couldn't load that course. It may have been deleted, or the server
              is unreachable.
            </p>
            <Link to="/" className="mt-4 inline-block text-sm text-accent hover:underline">
              Back to semester
            </Link>
          </div>
        ) : (
          <>
            <div className="group/course mb-6 flex items-start gap-3 sm:gap-4">
              <span
                aria-hidden
                className="mt-1.5 h-6 w-6 flex-shrink-0 rounded-md"
                style={{ backgroundColor: course.color }}
              />
              <div className="min-w-0 flex-1">
                {course.code ? (
                  <p className="font-num text-xs uppercase tracking-wider text-muted">
                    {course.code}
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {course.name}
                  </h1>
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className={
                      "flex-shrink-0 rounded p-1.5 text-muted opacity-50 transition-opacity " +
                      "hover:bg-bg hover:text-fg hover:opacity-100 " +
                      "focus-visible:opacity-100 focus-visible:outline-none " +
                      "group-hover/course:opacity-100"
                    }
                    aria-label="Edit course details"
                    title="Edit course"
                  >
                    <PencilIcon />
                  </button>
                </div>
                {course.instructor_name ? (
                  <p className="mt-1 text-sm text-muted">{course.instructor_name}</p>
                ) : null}
              </div>
            </div>

            <EditCourseModal
              open={editOpen}
              onClose={() => setEditOpen(false)}
              course={course}
            />

            {course.syllabus_committed_at ? (
              <>
                <TabNav
                  active={tab}
                  onSelect={setTab}
                  showNotes={showNotes}
                />
                <div className="mt-6">
                  {tab === "gradebook" ? (
                    <GradebookTab courseSlug={course.slug} />
                  ) : null}
                  {tab === "assignments" ? (
                    <AssignmentsTab
                      courseSlug={course.slug}
                      timezone={course.timezone}
                    />
                  ) : null}
                  {tab === "instructors" ? (
                    <InstructorsTab courseSlug={course.slug} />
                  ) : null}
                  {tab === "meetings" ? (
                    <MeetingsTab courseSlug={course.slug} />
                  ) : null}
                  {tab === "materials" ? (
                    <MaterialsTab courseSlug={course.slug} />
                  ) : null}
                  {tab === "notes" && showNotes ? (
                    <NotesTab courseSlug={course.slug} />
                  ) : null}
                </div>
              </>
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
                    office hours, and materials. You review and edit everything
                    on the next screen before anything is saved.
                  </p>
                </div>

                <SyllabusUpload
                  courseSlug={course.slug}
                  courseColor={course.color}
                  onExtracted={(response) => goToReview(response)}
                />

                <div className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-8 text-center">
                  <p className="text-sm text-muted">
                    No syllabus handy? You can still fill everything in by hand.
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleSetupManually}
                  >
                    Set up manually
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
