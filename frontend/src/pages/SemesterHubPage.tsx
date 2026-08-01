import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useCoursesForSemester, useDeleteCourse } from "@/api/courses";
import { useDeleteSemester, useSemesters, useUpdateSemester } from "@/api/semesters";
import { AddCourseModal } from "@/components/AddCourseModal";
import { AddCourseTile } from "@/components/AddCourseTile";
import { BrandMark } from "@/components/BrandMark";
import { CourseCard } from "@/components/CourseCard";
import { SemesterSwitcher } from "@/components/SemesterSwitcher";
import { useAuth } from "@/contexts/AuthContext";

export default function SemesterHubPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: semesters, isLoading: semestersLoading } = useSemesters();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [addCourseOpen, setAddCourseOpen] = useState(false);

  const updateSemester = useUpdateSemester();
  const deleteSemester = useDeleteSemester();
  const deleteCourse = useDeleteCourse();

  // First-run redirect: if we know for sure the user has no semesters yet,
  // send them to the setup screen. `first_run=1` triggers the welcoming copy.
  useEffect(() => {
    if (!semestersLoading && semesters && semesters.length === 0) {
      navigate("/semester-setup?first_run=1", { replace: true });
    }
  }, [semestersLoading, semesters, navigate]);

  // Default the current selection to whichever semester is marked active.
  useEffect(() => {
    if (!semesters || semesters.length === 0) return;
    if (selectedSlug && semesters.some((s) => s.slug === selectedSlug)) return;
    const active = semesters.find((s) => s.is_active) ?? semesters[0];
    setSelectedSlug(active.slug);
  }, [semesters, selectedSlug]);

  const selectedSemester = useMemo(
    () => semesters?.find((s) => s.slug === selectedSlug) ?? null,
    [semesters, selectedSlug],
  );

  const { data: courses, isLoading: coursesLoading } = useCoursesForSemester(selectedSlug);

  function handleSelectSemester(slug: string) {
    setSelectedSlug(slug);
    const target = semesters?.find((s) => s.slug === slug);
    if (target && !target.is_active) {
      updateSemester.mutate({ slug, payload: { is_active: true } });
    }
  }

  async function handleDeleteSemester(slug: string) {
    const target = semesters?.find((s) => s.slug === slug);
    if (!target) return;
    const confirmed = window.confirm(
      `Delete "${target.name}" and everything in it? This cannot be undone.`,
    );
    if (!confirmed) return;
    await deleteSemester.mutateAsync(slug);
    if (selectedSlug === slug) setSelectedSlug(null);
  }

  function handleRenameSemester(slug: string, name: string) {
    updateSemester.mutate({ slug, payload: { name } });
  }

  async function handleDeleteCourse(slug: string) {
    const target = courses?.find((c) => c.slug === slug);
    if (!target) return;
    const confirmed = window.confirm(`Delete "${target.name}"? This cannot be undone.`);
    if (!confirmed) return;
    await deleteCourse.mutateAsync(slug);
  }

  const hasCourses = !!courses && courses.length > 0;

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
        {semestersLoading || !semesters ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <SemesterSwitcher
              semesters={semesters}
              activeSlug={selectedSlug}
              onSelect={handleSelectSemester}
              onRename={handleRenameSemester}
              onDelete={handleDeleteSemester}
            />

            <section className="mt-8">
              {selectedSemester ? (
                <div className="mb-6 flex items-baseline justify-between">
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight">
                      {selectedSemester.name}
                    </h1>
                    <p className="mt-1 text-sm text-muted">
                      {formatDateRange(
                        selectedSemester.start_date,
                        selectedSemester.end_date,
                      )}
                    </p>
                  </div>
                  {hasCourses ? (
                    <button
                      className="btn-secondary"
                      onClick={() => setAddCourseOpen(true)}
                      type="button"
                    >
                      + Add course
                    </button>
                  ) : null}
                </div>
              ) : null}

              {coursesLoading ? (
                <p className="text-sm text-muted">Loading courses…</p>
              ) : hasCourses ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {courses!.map((course) => (
                    <CourseCard
                      key={course.slug}
                      course={course}
                      onDelete={handleDeleteCourse}
                    />
                  ))}
                  <AddCourseTile onClick={() => setAddCourseOpen(true)} />
                </div>
              ) : selectedSemester ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <AddCourseTile onClick={() => setAddCourseOpen(true)} emphasis />
                </div>
              ) : null}
            </section>
          </>
        )}
      </main>

      {selectedSlug ? (
        <AddCourseModal
          open={addCourseOpen}
          onClose={() => setAddCourseOpen(false)}
          semesterSlug={selectedSlug}
        />
      ) : null}
    </div>
  );
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "No dates set";
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `Starts ${fmt(start)}`;
  return `Ends ${fmt(end!)}`;
}
