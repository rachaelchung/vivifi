import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "@/api/client";
import { useUpdateCourse } from "@/api/courses";
import type { Course } from "@/api/types";
import { Modal } from "@/components/Modal";
import { COURSE_COLOR_CHOICES } from "@/lib/courseColors";

interface EditCourseModalProps {
  open: boolean;
  onClose: () => void;
  course: Course;
}

export function EditCourseModal({ open, onClose, course }: EditCourseModalProps) {
  const [name, setName] = useState(course.name);
  const [code, setCode] = useState(course.code ?? "");
  const [instructor, setInstructor] = useState(course.instructor_name ?? "");
  const [color, setColor] = useState(course.color);
  const [error, setError] = useState<string | null>(null);
  const updateCourse = useUpdateCourse();

  const colorChoices = COURSE_COLOR_CHOICES.includes(course.color)
    ? COURSE_COLOR_CHOICES
    : [course.color, ...COURSE_COLOR_CHOICES];

  useEffect(() => {
    if (!open) return;
    setName(course.name);
    setCode(course.code ?? "");
    setInstructor(course.instructor_name ?? "");
    setColor(course.color);
    setError(null);
  }, [open, course]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give this course a name.");
      return;
    }

    try {
      await updateCourse.mutateAsync({
        slug: course.slug,
        payload: {
          name: trimmed,
          code: code.trim() || null,
          instructor_name: instructor.trim() || null,
          color,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't update course.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit course">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="label" htmlFor="edit-course-name">
            Course name
          </label>
          <input
            id="edit-course-name"
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
            <label className="label" htmlFor="edit-course-code">
              Course code
            </label>
            <input
              id="edit-course-code"
              className="input"
              placeholder="15-113"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={40}
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-course-instructor">
              Instructor
            </label>
            <input
              id="edit-course-instructor"
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
            {colorChoices.map((choice) => (
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
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={updateCourse.isPending || !name.trim()}
          >
            {updateCourse.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
