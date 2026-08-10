import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useCourse } from "@/api/courses";
import { useCommitSyllabus } from "@/api/syllabus";
import type {
  ClassMeetingKind,
  SyllabusExtraction,
  SyllabusExtractResponse,
} from "@/api/types";
import { BrandMark } from "@/components/BrandMark";
import { DEFAULT_SCALE } from "@/components/syllabusReview/constants";
import {
  AssignmentsSection,
  CategoriesSection,
  ClassMeetingsSection,
  CourseMetaSection,
  GradingScaleSection,
  HostsSection,
  MaterialsSection,
  NotesSection,
  OfficeHoursSection,
} from "@/components/syllabusReview/sections";
import { useAuth } from "@/contexts/AuthContext";

const MEETING_KIND_LABELS: Record<ClassMeetingKind, string> = {
  lecture: "Lecture",
  recitation: "Recitation",
  lab: "Lab",
  seminar: "Seminar",
  other: "Other",
};

/** Kinds that list ≥2 distinct non-null sections with none marked mine. */
function unmetSectionPicks(extraction: SyllabusExtraction): ClassMeetingKind[] {
  const byKind = new Map<ClassMeetingKind, typeof extraction.class_meetings>();
  for (const m of extraction.class_meetings) {
    const list = byKind.get(m.kind) ?? [];
    list.push(m);
    byKind.set(m.kind, list);
  }
  const unmet: ClassMeetingKind[] = [];
  for (const [kind, rows] of byKind) {
    const sections = new Set(
      rows
        .map((r) => r.section?.trim())
        .filter((s): s is string => !!s),
    );
    if (sections.size < 2) continue;
    const anyMine = rows.some((r) => r.is_mine && r.section?.trim());
    if (!anyMine) unmet.push(kind);
  }
  return unmet;
}

interface LocationState {
  response?: SyllabusExtractResponse;
  /** True when the user skipped syllabus upload and opened an empty review. */
  manual?: boolean;
}

export default function SyllabusReviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const state = (location.state as LocationState | null) ?? null;
  const { data: course } = useCourse(slug ?? null);
  const commit = useCommitSyllabus(slug ?? "");
  const isManual = state?.manual === true;

  // Local editable copy of the extraction. Seed with the response from the
  // upload flow (or the empty manual payload). If no state is present
  // (e.g. hard refresh), redirect back.
  const [extraction, setExtraction] = useState<SyllabusExtraction | null>(
    state?.response?.extraction
      ? seedDefaults(state.response.extraction)
      : null,
  );
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    if (state?.response) return;
    if (!slug) return;
    navigate(`/courses/${slug}`, { replace: true });
  }, [state, slug, navigate]);

  const looksIncomplete = state?.response?.looks_incomplete ?? false;
  const hasNoAssignments = state?.response?.has_no_assignments ?? false;

  const weightSum = useMemo(() => {
    if (!extraction) return 0;
    return extraction.grade_categories.reduce(
      (t, c) => t + (Number(c.weight_pct) || 0),
      0,
    );
  }, [extraction]);

  const weightsOk = Math.abs(weightSum - 100) < 0.5;
  const sectionPicksNeeded = useMemo(
    () => (extraction ? unmetSectionPicks(extraction) : []),
    [extraction],
  );
  const sectionsOk = sectionPicksNeeded.length === 0;
  const canCommit =
    !!extraction &&
    extraction.grade_categories.length > 0 &&
    weightsOk &&
    sectionsOk;

  if (!slug) {
    return <Navigate to="/" replace />;
  }

  if (!extraction) {
    return <div className="p-6 text-sm text-muted">Redirecting…</div>;
  }

  const categoryNames = extraction.grade_categories
    .map((c) => c.name.trim())
    .filter(Boolean);
  const hostNames = extraction.office_hour_hosts
    .map((h) => h.name.trim())
    .filter(Boolean);

  async function handleCommit() {
    if (!extraction) return;
    setCommitError(null);
    try {
      await commit.mutateAsync(extraction);
      navigate(`/courses/${slug}`, { replace: true });
    } catch (err) {
      setCommitError(err instanceof ApiError ? err.detail : "Couldn't commit syllabus.");
    }
  }

  return (
    <div
      className="min-h-screen"
      style={course ? { ["--color-accent" as string]: course.color } : undefined}
    >
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="text-muted">/</span>
            <Link
              to={`/courses/${slug}`}
              className="text-sm font-medium text-muted hover:text-fg"
            >
              {course?.name ?? "Course"}
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

      <main className="mx-auto max-w-4xl space-y-6 px-6 pb-32 pt-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Step 2
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {isManual ? "Set up this course." : "Review the extraction."}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {isManual
              ? "Add categories, a grading scale, assignments, hosts, and anything else you want tracked. Nothing is saved until you hit commit."
              : "Edit anything Claude got wrong. Nothing is saved until you hit commit. If a whole section looks off, use the delete buttons and add rows manually."}
          </p>
        </div>

        {looksIncomplete ? (
          <Banner tone="danger">
            <div className="flex-1">
              <p className="text-sm font-semibold">This extraction looks incomplete.</p>
              <p className="mt-1 text-sm">
                If this is a scanned PDF or the layout was hard to read, try{" "}
                <Link
                  to={`/courses/${slug}`}
                  className="font-medium underline"
                >
                  pasting the syllabus text
                </Link>{" "}
                instead.
              </p>
            </div>
          </Banner>
        ) : null}

        {hasNoAssignments && !looksIncomplete && !isManual ? (
          <Banner tone="info">
            <p className="text-sm">
              No dated assignments were found in this syllabus. You can commit
              anyway and add them as they're posted.
            </p>
          </Banner>
        ) : null}

        {isManual ? (
          <Banner tone="info">
            <p className="text-sm">
              Starting from an empty shell with one <span className="font-medium">Overall</span>{" "}
              category at 100% and a standard grading scale. Restructure freely —
              you can add more later from the live tabs after commit.
            </p>
          </Banner>
        ) : null}

        <CourseMetaSection
          value={extraction.course}
          onChange={(course) => setExtraction({ ...extraction, course })}
        />

        <CategoriesSection
          value={extraction.grade_categories}
          onChange={(grade_categories) =>
            setExtraction({ ...extraction, grade_categories })
          }
        />

        <GradingScaleSection
          value={extraction.grading_scale}
          onChange={(grading_scale) =>
            setExtraction({ ...extraction, grading_scale })
          }
        />

        <AssignmentsSection
          value={extraction.assignments}
          onChange={(assignments) =>
            setExtraction({ ...extraction, assignments })
          }
          categoryNames={categoryNames}
        />

        <HostsSection
          value={extraction.office_hour_hosts}
          onChange={(office_hour_hosts) =>
            setExtraction({ ...extraction, office_hour_hosts })
          }
        />

        <OfficeHoursSection
          value={extraction.office_hours}
          onChange={(office_hours) =>
            setExtraction({ ...extraction, office_hours })
          }
          hostNames={hostNames}
        />

        <ClassMeetingsSection
          value={extraction.class_meetings}
          onChange={(class_meetings) =>
            setExtraction({ ...extraction, class_meetings })
          }
        />

        <MaterialsSection
          value={extraction.materials ?? []}
          onChange={(materials) => setExtraction({ ...extraction, materials })}
        />

        <NotesSection
          value={extraction.notes}
          onChange={(notes) => setExtraction({ ...extraction, notes })}
        />

        {commitError ? (
          <p className="text-sm text-danger">{commitError}</p>
        ) : null}
      </main>

      {/* Sticky commit bar — feedback on weights is always visible. */}
      <footer className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div className="text-sm">
            {!weightsOk ? (
              <span className="text-danger">
                Weights sum to {Math.round(weightSum * 100) / 100}% — must be
                100 to commit.
              </span>
            ) : !sectionsOk ? (
              <span className="text-danger">
                Mark which section is yours for{" "}
                {sectionPicksNeeded
                  .map((k) => MEETING_KIND_LABELS[k])
                  .join(", ")}
                .
              </span>
            ) : (
              <span className="text-muted">
                Weights sum to {Math.round(weightSum * 100) / 100}%.
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/courses/${slug}`}
              className="text-sm text-muted hover:underline"
            >
              Cancel
            </Link>
            <button
              type="button"
              className="btn-primary"
              onClick={handleCommit}
              disabled={!canCommit || commit.isPending}
            >
              {commit.isPending
                ? "Committing…"
                : isManual
                  ? "Save course"
                  : "Commit syllabus"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// SPEC: if the extraction returned no grading scale, pre-fill the standard
// 10-point scale on the review screen so the user can accept or edit.
function seedDefaults(extraction: SyllabusExtraction): SyllabusExtraction {
  const class_meetings = (extraction.class_meetings ?? []).map((m) => ({
    kind: m.kind ?? "lecture",
    section: m.section ?? null,
    is_mine: m.is_mine ?? true,
    day_of_week: m.day_of_week,
    start_time: m.start_time,
    end_time: m.end_time,
    location: m.location ?? null,
  }));
  const withDefaults: SyllabusExtraction = {
    ...extraction,
    materials: extraction.materials ?? [],
    class_meetings,
  };
  if (withDefaults.grading_scale.length === 0) {
    return {
      ...withDefaults,
      grading_scale: DEFAULT_SCALE.map((b) => ({ ...b })),
    };
  }
  return withDefaults;
}

function Banner({
  tone,
  children,
}: {
  tone: "danger" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "danger"
          ? "flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4 text-danger"
          : "flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-fg"
      }
    >
      <div aria-hidden className="mt-0.5">
        {tone === "danger" ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
