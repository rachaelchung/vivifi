import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "@/api/client";
import { useUpdateSemester } from "@/api/semesters";
import type { Semester } from "@/api/types";
import { DatePicker } from "@/components/DatePicker";
import { Modal } from "@/components/Modal";

interface EditSemesterModalProps {
  open: boolean;
  onClose: () => void;
  semester: Semester;
}

export function EditSemesterModal({
  open,
  onClose,
  semester,
}: EditSemesterModalProps) {
  const [name, setName] = useState(semester.name);
  const [startDate, setStartDate] = useState(semester.start_date ?? "");
  const [endDate, setEndDate] = useState(semester.end_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const updateSemester = useUpdateSemester();

  useEffect(() => {
    if (!open) return;
    setName(semester.name);
    setStartDate(semester.start_date ?? "");
    setEndDate(semester.end_date ?? "");
    setError(null);
  }, [open, semester]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give this semester a name.");
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError("End date can't be before start date.");
      return;
    }

    try {
      await updateSemester.mutateAsync({
        slug: semester.slug,
        payload: {
          name: trimmed,
          start_date: startDate || null,
          end_date: endDate || null,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't update semester.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit semester">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="label" htmlFor="edit-semester-name">
            Semester name
          </label>
          <input
            id="edit-semester-name"
            className="input"
            placeholder="Fall 2025"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="edit-semester-start">
              Start date <span className="text-muted">(optional)</span>
            </label>
            <DatePicker
              id="edit-semester-start"
              value={startDate || null}
              placeholder="No date"
              clearLabel="Clear"
              ariaLabel="Semester start date"
              onChange={(next) => setStartDate(next ?? "")}
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-semester-end">
              End date <span className="text-muted">(optional)</span>
            </label>
            <DatePicker
              id="edit-semester-end"
              value={endDate || null}
              placeholder="No date"
              clearLabel="Clear"
              ariaLabel="Semester end date"
              onChange={(next) => setEndDate(next ?? "")}
            />
          </div>
        </div>
        <p className="text-xs text-muted">
          Changing dates updates the semester window only — existing assignment
          due dates stay put.
        </p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={updateSemester.isPending || !name.trim()}
          >
            {updateSemester.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
