import type {
  ClassMeetingKind,
  ExtractedAssignment,
  ExtractedClassMeeting,
  ExtractedCourseMeta,
  ExtractedGradeCategory,
  ExtractedGradeScaleBand,
  ExtractedMaterial,
  ExtractedNote,
  ExtractedOfficeHour,
  ExtractedOfficeHourHost,
  HostRole,
  MaterialKind,
  MaterialRequirement,
} from "@/api/types";
import {
  AddRowButton,
  SectionCard,
} from "@/components/syllabusReview/SectionCard";
import { RowCard } from "@/components/syllabusReview/RowCard";
import {
  DEFAULT_SCALE,
  WEEKDAYS,
  emptyAssignment,
  emptyCategory,
  emptyClassMeeting,
  emptyHost,
  emptyMaterial,
  emptyNote,
  emptyOfficeHour,
  emptyScaleBand,
} from "@/components/syllabusReview/constants";
import { cn } from "@/lib/utils";

const MEETING_KINDS: { value: ClassMeetingKind; label: string }[] = [
  { value: "lecture", label: "Lecture" },
  { value: "recitation", label: "Recitation" },
  { value: "lab", label: "Lab" },
  { value: "seminar", label: "Seminar" },
  { value: "other", label: "Other" },
];

const KIND_ORDER: ClassMeetingKind[] = [
  "lecture",
  "recitation",
  "lab",
  "seminar",
  "other",
];

function kindLabel(kind: ClassMeetingKind): string {
  return MEETING_KINDS.find((k) => k.value === kind)?.label ?? kind;
}
// --- Course meta ------------------------------------------------------------

export function CourseMetaSection({
  value,
  onChange,
}: {
  value: ExtractedCourseMeta;
  onChange: (v: ExtractedCourseMeta) => void;
}) {
  return (
    <SectionCard
      title="Course"
      description="Display name for the course card. If the syllabus has multiple or section-dependent instructors, list everyone under Instructors & TAs, then put your section's contact here."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="course-name">
            Name
          </label>
          <input
            id="course-name"
            className="input"
            value={value.name ?? ""}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="course-code">
            Code
          </label>
          <input
            id="course-code"
            className="input"
            value={value.code ?? ""}
            placeholder="15-113"
            onChange={(e) =>
              onChange({ ...value, code: e.target.value.trim() || null })
            }
          />
        </div>
        <div>
          <label className="label" htmlFor="course-instructor">
            Instructor
          </label>
          <input
            id="course-instructor"
            className="input"
            value={value.instructor_name ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                instructor_name: e.target.value.trim() || null,
              })
            }
          />
        </div>
        <div>
          <label className="label" htmlFor="course-instructor-email">
            Instructor email
          </label>
          <input
            id="course-instructor-email"
            className="input"
            type="email"
            value={value.instructor_email ?? ""}
            placeholder="Your section's professor"
            onChange={(e) =>
              onChange({
                ...value,
                instructor_email: e.target.value.trim() || null,
              })
            }
          />
          <p className="hint mt-1">
            One email only. Co-instructors belong on the roster below.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

// --- Grade categories -------------------------------------------------------

export function CategoriesSection({
  value,
  onChange,
}: {
  value: ExtractedGradeCategory[];
  onChange: (v: ExtractedGradeCategory[]) => void;
}) {
  const sum = value.reduce((total, c) => total + (Number(c.weight_pct) || 0), 0);
  const roundedSum = Math.round(sum * 100) / 100;
  const isCorrect = Math.abs(sum - 100) < 0.5;

  function update(idx: number, patch: Partial<ExtractedGradeCategory>) {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <SectionCard
      title="Grade categories"
      description="Each category is a weight bucket (e.g. Homework 20%). Weights must sum to 100 to commit."
      aside={
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted">Sum</p>
          <p
            className={
              isCorrect
                ? "font-num text-2xl font-semibold text-fg"
                : "font-num text-2xl font-semibold text-danger"
            }
          >
            {roundedSum}%
          </p>
          {!isCorrect ? (
            <p className="mt-1 text-xs text-danger">Should equal 100</p>
          ) : null}
        </div>
      }
    >
      {value.map((cat, idx) => (
        <RowCard
          key={idx}
          onRemove={() => remove(idx)}
          ariaLabel={`Remove category ${cat.name || idx + 1}`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_120px]">
            <div>
              <label className="hint">Name</label>
              <input
                className="input"
                value={cat.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                placeholder="Homework"
              />
            </div>
            <div>
              <label className="hint">Weight (%)</label>
              <input
                className="input font-num"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={cat.weight_pct}
                onChange={(e) =>
                  update(idx, { weight_pct: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="hint">Drop lowest</label>
              <input
                className="input font-num"
                type="number"
                min={0}
                step="1"
                value={cat.drop_lowest_n}
                onChange={(e) =>
                  update(idx, { drop_lowest_n: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        </RowCard>
      ))}
      <AddRowButton
        label="Add a category"
        onClick={() => onChange([...value, emptyCategory()])}
      />
    </SectionCard>
  );
}

// --- Grading scale ----------------------------------------------------------

export function GradingScaleSection({
  value,
  onChange,
}: {
  value: ExtractedGradeScaleBand[];
  onChange: (v: ExtractedGradeScaleBand[]) => void;
}) {
  function update(idx: number, patch: Partial<ExtractedGradeScaleBand>) {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <SectionCard
      title="Grading scale"
      description="Letter cutoffs used to render your current grade. +/- schools just have more rows."
      aside={
        value.length === 0 ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onChange(DEFAULT_SCALE)}
          >
            Use standard 10-point scale
          </button>
        ) : null
      }
    >
      {value.map((band, idx) => (
        <RowCard
          key={idx}
          onRemove={() => remove(idx)}
          ariaLabel={`Remove band ${band.letter || idx + 1}`}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[120px_1fr]">
            <div>
              <label className="hint">Letter</label>
              <input
                className="input font-num uppercase"
                value={band.letter}
                onChange={(e) => update(idx, { letter: e.target.value })}
                maxLength={4}
                placeholder="A-"
              />
            </div>
            <div>
              <label className="hint">Minimum %</label>
              <input
                className="input font-num"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={band.min_pct}
                onChange={(e) =>
                  update(idx, { min_pct: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        </RowCard>
      ))}
      <AddRowButton
        label="Add a band"
        onClick={() => onChange([...value, emptyScaleBand()])}
      />
    </SectionCard>
  );
}

// --- Assignments (+ exams) --------------------------------------------------

export function AssignmentsSection({
  value,
  onChange,
  categoryNames,
}: {
  value: ExtractedAssignment[];
  onChange: (v: ExtractedAssignment[]) => void;
  categoryNames: string[];
}) {
  function update(idx: number, patch: Partial<ExtractedAssignment>) {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <SectionCard
      title="Assignments & exams"
      description="Everything with a due date. Exams render distinctively on the calendar and can't be dragged."
    >
      {value.map((a, idx) => (
        <RowCard
          key={idx}
          onRemove={() => remove(idx)}
          ariaLabel={`Remove ${a.name || `assignment ${idx + 1}`}`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_110px_150px_1fr_110px]">
            <div>
              <label className="hint">Name</label>
              <input
                className="input"
                value={a.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                placeholder="HW 3"
              />
            </div>
            <div>
              <label className="hint">Type</label>
              <select
                className="input"
                value={a.kind}
                onChange={(e) =>
                  update(idx, {
                    kind: e.target.value as ExtractedAssignment["kind"],
                  })
                }
              >
                <option value="assignment">Assignment</option>
                <option value="exam">Exam</option>
              </select>
            </div>
            <div>
              <label className="hint">Due date</label>
              <input
                className="input"
                type="date"
                value={a.due_date ?? ""}
                onChange={(e) =>
                  update(idx, { due_date: e.target.value || null })
                }
              />
            </div>
            <div>
              <label className="hint">Category</label>
              <select
                className="input"
                value={a.category_name ?? ""}
                onChange={(e) =>
                  update(idx, { category_name: e.target.value || null })
                }
              >
                <option value="">— None —</option>
                {categoryNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hint">Points</label>
              <input
                className="input font-num"
                type="number"
                min={0}
                step="0.01"
                value={a.points_possible}
                onChange={(e) =>
                  update(idx, { points_possible: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        </RowCard>
      ))}
      <AddRowButton
        label="Add an assignment or exam"
        onClick={() => onChange([...value, emptyAssignment()])}
      />
    </SectionCard>
  );
}

// --- Office hour hosts ------------------------------------------------------

export function HostsSection({
  value,
  onChange,
}: {
  value: ExtractedOfficeHourHost[];
  onChange: (v: ExtractedOfficeHourHost[]) => void;
}) {
  function update(idx: number, patch: Partial<ExtractedOfficeHourHost>) {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <SectionCard
      title="Instructors & TAs"
      description="Full roster: professors (including section-dependent co-instructors), TAs, and LAs. Every office-hour block is owned by exactly one host. Personal Zoom is only for hosts who always use the same room — leave it blank otherwise."
    >
      {value.map((h, idx) => (
        <RowCard
          key={idx}
          onRemove={() => remove(idx)}
          ariaLabel={`Remove host ${h.name || idx + 1}`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_1fr_1fr]">
            <div>
              <label className="hint">Name</label>
              <input
                className="input"
                value={h.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                placeholder="Prof. Taylor"
              />
            </div>
            <div>
              <label className="hint">Role</label>
              <select
                className="input"
                value={h.role}
                onChange={(e) =>
                  update(idx, { role: e.target.value as HostRole })
                }
              >
                <option value="Professor">Professor</option>
                <option value="TA">TA</option>
                <option value="Learning Assistant">Learning Assistant</option>
              </select>
            </div>
            <div>
              <label className="hint">Email</label>
              <input
                className="input"
                type="email"
                value={h.email ?? ""}
                onChange={(e) =>
                  update(idx, { email: e.target.value.trim() || null })
                }
              />
            </div>
            <div>
              <label className="hint">Personal Zoom (optional)</label>
              <input
                className="input"
                value={h.zoom_link ?? ""}
                placeholder="https://zoom.us/j/…"
                onChange={(e) =>
                  update(idx, { zoom_link: e.target.value.trim() || null })
                }
              />
            </div>
          </div>
        </RowCard>
      ))}
      <AddRowButton
        label="Add a host"
        onClick={() => onChange([...value, emptyHost()])}
      />
    </SectionCard>
  );
}

// --- Office hours -----------------------------------------------------------

export function OfficeHoursSection({
  value,
  onChange,
  hostNames,
}: {
  value: ExtractedOfficeHour[];
  onChange: (v: ExtractedOfficeHour[]) => void;
  hostNames: string[];
}) {
  function update(idx: number, patch: Partial<ExtractedOfficeHour>) {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  const hasHosts = hostNames.length > 0;

  return (
    <SectionCard
      title="Office hours"
      description="Weekly blocks that show up on the Week Schedule office-hours layer. Location can be a room, a Zoom URL, a hybrid string, or empty — whatever the syllabus says."
    >
      {!hasHosts && value.length > 0 ? (
        <p className="text-sm text-danger">
          Every office-hour block needs a host — add one in the Instructors
          section first.
        </p>
      ) : null}
      {value.map((oh, idx) => (
        <RowCard
          key={idx}
          onRemove={() => remove(idx)}
          ariaLabel={`Remove office hour block ${idx + 1}`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[130px_110px_110px_1fr_1fr]">
            <div>
              <label className="hint">Day</label>
              <select
                className="input"
                value={oh.day_of_week}
                onChange={(e) =>
                  update(idx, { day_of_week: Number(e.target.value) })
                }
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hint">Start</label>
              <input
                className="input font-num"
                type="time"
                value={oh.start_time.slice(0, 5)}
                onChange={(e) => update(idx, { start_time: e.target.value })}
              />
            </div>
            <div>
              <label className="hint">End</label>
              <input
                className="input font-num"
                type="time"
                value={oh.end_time.slice(0, 5)}
                onChange={(e) => update(idx, { end_time: e.target.value })}
              />
            </div>
            <div>
              <label className="hint">Location</label>
              <input
                className="input"
                value={oh.location ?? ""}
                placeholder="GHC 5219 or zoom link"
                onChange={(e) =>
                  update(idx, { location: e.target.value.trim() || null })
                }
              />
            </div>
            <div>
              <label className="hint">Host</label>
              <select
                className="input"
                value={oh.host_name}
                onChange={(e) => update(idx, { host_name: e.target.value })}
              >
                <option value="">— Pick a host —</option>
                {hostNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </RowCard>
      ))}
      <AddRowButton
        label="Add an office-hour block"
        onClick={() =>
          onChange([...value, emptyOfficeHour(hostNames[0] ?? "")])
        }
      />
    </SectionCard>
  );
}

// --- Class meetings ---------------------------------------------------------

export function ClassMeetingsSection({
  value,
  onChange,
}: {
  value: ExtractedClassMeeting[];
  onChange: (v: ExtractedClassMeeting[]) => void;
}) {
  function update(idx: number, patch: Partial<ExtractedClassMeeting>) {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  // Stable display order: by kind, then mine first, then original index.
  const ordered = value
    .map((cm, idx) => ({ cm, idx }))
    .sort((a, b) => {
      const ka = KIND_ORDER.indexOf(a.cm.kind);
      const kb = KIND_ORDER.indexOf(b.cm.kind);
      if (ka !== kb) return ka - kb;
      if (a.cm.is_mine !== b.cm.is_mine) return a.cm.is_mine ? -1 : 1;
      return a.idx - b.idx;
    });

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    rows: ordered.filter((r) => r.cm.kind === kind),
  })).filter((g) => g.rows.length > 0);

  return (
    <SectionCard
      title="Class meetings"
      description="Lectures, recitations, labs, and other sessions. Mark Mine on the ones you attend — those show on your Week Schedule. When a syllabus lists alternate sections, pick yours before committing."
    >
      {groups.map(({ kind, rows }) => (
        <div key={kind} className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">{kindLabel(kind)}</h3>
          {rows.map(({ cm, idx }) => (
            <RowCard
              key={idx}
              onRemove={() => remove(idx)}
              ariaLabel={`Remove class meeting ${idx + 1}`}
              className={cn(
                cm.is_mine && "ring-1 ring-accent/40 bg-accent/5",
              )}
            >
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={cm.is_mine}
                    onChange={(e) => update(idx, { is_mine: e.target.checked })}
                  />
                  Mine
                </label>
                {cm.is_mine ? (
                  <span className="text-xs font-medium text-accent">
                    On your schedule
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="hint">Kind</label>
                  <select
                    className="input"
                    value={cm.kind}
                    onChange={(e) =>
                      update(idx, {
                        kind: e.target.value as ClassMeetingKind,
                      })
                    }
                  >
                    {MEETING_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="hint">Section (optional)</label>
                  <input
                    className="input"
                    placeholder="e.g. A, L01"
                    value={cm.section ?? ""}
                    onChange={(e) =>
                      update(idx, {
                        section: e.target.value.trim() || null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="hint">Day</label>
                  <select
                    className="input"
                    value={cm.day_of_week}
                    onChange={(e) =>
                      update(idx, { day_of_week: Number(e.target.value) })
                    }
                  >
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="hint">Start</label>
                  <input
                    className="input font-num"
                    type="time"
                    value={cm.start_time.slice(0, 5)}
                    onChange={(e) => update(idx, { start_time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="hint">End</label>
                  <input
                    className="input font-num"
                    type="time"
                    value={cm.end_time.slice(0, 5)}
                    onChange={(e) => update(idx, { end_time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="hint">Location</label>
                  <input
                    className="input"
                    value={cm.location ?? ""}
                    onChange={(e) =>
                      update(idx, { location: e.target.value.trim() || null })
                    }
                  />
                </div>
              </div>
            </RowCard>
          ))}
        </div>
      ))}
      <AddRowButton
        label="Add a class meeting"
        onClick={() => onChange([...value, emptyClassMeeting()])}
      />
    </SectionCard>
  );
}

// --- Materials --------------------------------------------------------------

export function MaterialsSection({
  value,
  onChange,
}: {
  value: ExtractedMaterial[];
  onChange: (v: ExtractedMaterial[]) => void;
}) {
  function update(idx: number, patch: Partial<ExtractedMaterial>) {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <SectionCard
      title="Materials"
      description="Textbooks, readings, and other supplies — structured so you can scan them instead of reading a bibliography blob."
    >
      {value.length === 0 ? (
        <p className="text-sm text-muted">
          No materials found. Add a textbook, book, or other item if the course
          needs one.
        </p>
      ) : null}
      {value.map((m, idx) => (
        <RowCard
          key={idx}
          onRemove={() => remove(idx)}
          ariaLabel={`Remove material ${m.title || idx + 1}`}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="hint">Kind</label>
                <select
                  className="input"
                  value={m.kind}
                  onChange={(e) =>
                    update(idx, { kind: e.target.value as MaterialKind })
                  }
                >
                  <option value="textbook">Textbook</option>
                  <option value="book">Book</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="hint">Requirement</label>
                <select
                  className="input"
                  value={m.requirement}
                  onChange={(e) =>
                    update(idx, {
                      requirement: e.target.value as MaterialRequirement,
                    })
                  }
                >
                  <option value="required">Required</option>
                  <option value="recommended">Recommended</option>
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className="hint">
                  {m.kind === "other" ? "Name" : "Title"}
                </label>
                <input
                  className="input"
                  value={m.title}
                  onChange={(e) => update(idx, { title: e.target.value })}
                  placeholder={
                    m.kind === "other" ? "TI-84 calculator" : "Book title"
                  }
                />
              </div>
            </div>

            {m.kind !== "other" ? (
              <div>
                <label className="hint">Author(s)</label>
                <input
                  className="input"
                  value={m.authors ?? ""}
                  onChange={(e) =>
                    update(idx, { authors: e.target.value.trim() || null })
                  }
                  placeholder="Last, First; Last2, First2"
                />
              </div>
            ) : null}

            {m.kind === "textbook" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="hint">Edition</label>
                  <input
                    className="input"
                    value={m.edition ?? ""}
                    onChange={(e) =>
                      update(idx, { edition: e.target.value.trim() || null })
                    }
                  />
                </div>
                <div>
                  <label className="hint">ISBN</label>
                  <input
                    className="input font-num"
                    value={m.isbn ?? ""}
                    onChange={(e) =>
                      update(idx, { isbn: e.target.value.trim() || null })
                    }
                  />
                </div>
                <div>
                  <label className="hint">Publisher</label>
                  <input
                    className="input"
                    value={m.publisher ?? ""}
                    onChange={(e) =>
                      update(idx, { publisher: e.target.value.trim() || null })
                    }
                  />
                </div>
                <div>
                  <label className="hint">Year</label>
                  <input
                    className="input font-num"
                    type="number"
                    min={1000}
                    max={2100}
                    value={m.year ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      update(idx, {
                        year: raw === "" ? null : Number(raw) || null,
                      });
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="hint">URL</label>
                  <input
                    className="input"
                    value={m.url ?? ""}
                    onChange={(e) =>
                      update(idx, { url: e.target.value.trim() || null })
                    }
                    placeholder="https://"
                  />
                </div>
              </div>
            ) : null}

            {m.kind === "book" ? (
              <div>
                <label className="hint">URL (optional)</label>
                <input
                  className="input"
                  value={m.url ?? ""}
                  onChange={(e) =>
                    update(idx, { url: e.target.value.trim() || null })
                  }
                />
              </div>
            ) : null}

            <div>
              <label className="hint">Notes</label>
              <textarea
                className="input min-h-[60px]"
                value={m.notes ?? ""}
                onChange={(e) =>
                  update(idx, { notes: e.target.value.trim() || null })
                }
                placeholder="Any edition OK; bring to exams…"
              />
            </div>
          </div>
        </RowCard>
      ))}
      <AddRowButton
        label="Add a material"
        onClick={() => onChange([...value, emptyMaterial()])}
      />
    </SectionCard>
  );
}

// --- Course notes -----------------------------------------------------------

export function NotesSection({
  value,
  onChange,
}: {
  value: ExtractedNote[];
  onChange: (v: ExtractedNote[]) => void;
}) {
  function update(idx: number, patch: Partial<ExtractedNote>) {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <SectionCard
      title="Course notes"
      description="Course-specific policies the instructor emphasized. Boilerplate (Title IX, generic academic-integrity language, etc.) is filtered out."
    >
      {value.length === 0 ? (
        <p className="text-sm text-muted">
          No course-specific notes were found — that's normal. You can add any
          policy worth remembering.
        </p>
      ) : null}
      {value.map((n, idx) => (
        <RowCard
          key={idx}
          onRemove={() => remove(idx)}
          ariaLabel={`Remove note ${n.heading || idx + 1}`}
        >
          <div className="space-y-3">
            <div>
              <label className="hint">Heading</label>
              <input
                className="input"
                value={n.heading}
                onChange={(e) => update(idx, { heading: e.target.value })}
                placeholder="Late-work policy"
              />
            </div>
            <div>
              <label className="hint">Body</label>
              <textarea
                className="input min-h-[80px]"
                value={n.body}
                onChange={(e) => update(idx, { body: e.target.value })}
              />
            </div>
          </div>
        </RowCard>
      ))}
      <AddRowButton
        label="Add a note"
        onClick={() => onChange([...value, emptyNote()])}
      />
    </SectionCard>
  );
}
