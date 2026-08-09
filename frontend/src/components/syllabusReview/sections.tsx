import type {
  ExtractedAssignment,
  ExtractedClassMeeting,
  ExtractedCourseMeta,
  ExtractedGradeCategory,
  ExtractedGradeScaleBand,
  ExtractedNote,
  ExtractedOfficeHour,
  ExtractedOfficeHourHost,
  HostRole,
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
  emptyNote,
  emptyOfficeHour,
  emptyScaleBand,
} from "@/components/syllabusReview/constants";

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
                step="0.5"
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
      description="Weekly blocks that show up on the Office Hour Week grid. Location can be a room, a Zoom URL, a hybrid string, or empty — whatever the syllabus says."
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

  return (
    <SectionCard
      title="Class meetings"
      description="Regular lecture/lab times. Persisted for future features; no MVP UI beyond this section."
    >
      {value.map((cm, idx) => (
        <RowCard
          key={idx}
          onRemove={() => remove(idx)}
          ariaLabel={`Remove class meeting ${idx + 1}`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[130px_110px_110px_1fr]">
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
      <AddRowButton
        label="Add a class meeting"
        onClick={() => onChange([...value, emptyClassMeeting()])}
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
