import { useState, type FormEvent } from "react";

import { ApiError } from "@/api/client";
import { useCreateCourse } from "@/api/courses";
import { Modal } from "@/components/Modal";

interface AddCourseModalProps {
  open: boolean;
  onClose: () => void;
  semesterSlug: string;
}

// Curated palette of soft, distinguishable course accents. Not exhaustive —
// this is v1; users can override later.
const COLOR_CHOICES: string[] = [
  "#D97757",
  "#C6663F",
  "#B99A5C",
  "#7B9E67",
  "#5E8A8A",
  "#527AA6",
  "#7A6DAA",
  "#A56591",
];

export function AddCourseModal({ open, onClose, semesterSlug }: AddCourseModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [instructor, setInstructor] = useState("");
  const [color, setColor] = useState<string>(COLOR_CHOICES[0]);
  const [error, setError] = useState<string | null>(null);
  const createCourse = useCreateCourse();

  function resetAndClose() {
    setName("");
    setCode("");
    setInstructor("");
    setColor(COLOR_CHOICES[0]);
    setError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createCourse.mutateAsync({
        semester_slug: semesterSlug,
        name: name.trim(),
        code: code.trim() || null,
        instructor_name: instructor.trim() || null,
        color,
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      });
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't create course.");
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Add a course">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="label" htmlFor="course-name">
            Course name
          </label>
          <input
            id="course-name"
            className="input"
            placeholder="Intro to Computer Science"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="course-code">
              Course code
            </label>
            <input
              id="course-code"
              className="input"
              placeholder="15-113"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={40}
            />
          </div>
          <div>
            <label className="label" htmlFor="instructor">
              Instructor
            </label>
            <input
              id="instructor"
              className="input"
              placeholder="Prof. Taylor"
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <div>
          <span className="label">Accent color</span>
          <div className="flex flex-wrap gap-2">
            {COLOR_CHOICES.map((choice) => (
              <button
                type="button"
                key={choice}
                aria-label={`Choose ${choice}`}
                aria-pressed={choice === color}
                onClick={() => setColor(choice)}
                className={
                  choice === color
                    ? "h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-surface ring-fg"
                    : "h-9 w-9 rounded-full hover:opacity-80"
                }
                style={{ backgroundColor: choice }}
              />
            ))}
          </div>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" className="btn-ghost" onClick={resetAndClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={createCourse.isPending || !name.trim()}
          >
            {createCourse.isPending ? "Adding…" : "Add course"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
