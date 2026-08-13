import { useEffect, useState } from "react";

import { ApiError } from "@/api/client";
import { useReplaceGradingScale } from "@/api/liveViews";
import type { GradeScaleBand } from "@/api/types";
import { Modal } from "@/components/Modal";
import { DEFAULT_SCALE } from "@/components/syllabusReview/constants";

interface EditGradingScaleModalProps {
  open: boolean;
  onClose: () => void;
  courseSlug: string;
  bands: GradeScaleBand[];
}

type BandDraft = {
  key: string;
  letter: string;
  minPct: string;
};

function bandsToDrafts(bands: GradeScaleBand[]): BandDraft[] {
  return [...bands]
    .sort((a, b) => b.min_pct - a.min_pct)
    .map((b) => ({
      key: `id-${b.id}`,
      letter: b.letter,
      minPct: String(b.min_pct),
    }));
}

function newDraft(minPct = ""): BandDraft {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    letter: "",
    minPct,
  };
}

export function EditGradingScaleModal({
  open,
  onClose,
  courseSlug,
  bands,
}: EditGradingScaleModalProps) {
  const replace = useReplaceGradingScale(courseSlug);
  const [drafts, setDrafts] = useState<BandDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDrafts(bandsToDrafts(bands));
    setError(null);
  }, [open, bands]);

  function updateDraft(key: string, patch: Partial<BandDraft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  }

  async function handleSave() {
    const parsed: { letter: string; min_pct: number }[] = [];
    for (const d of drafts) {
      const letter = d.letter.trim();
      const minPct = Number(d.minPct);
      if (!letter && d.minPct.trim() === "") continue;
      if (!letter) {
        setError("Every band needs a letter.");
        return;
      }
      if (Number.isNaN(minPct) || minPct < 0 || minPct > 100) {
        setError(`"${letter}" needs a minimum % between 0 and 100.`);
        return;
      }
      parsed.push({ letter, min_pct: minPct });
    }

    const letters = parsed.map((b) => b.letter.toLowerCase());
    if (new Set(letters).size !== letters.length) {
      setError("Each letter can only appear once.");
      return;
    }

    setError(null);
    try {
      await replace.mutateAsync(parsed);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Couldn't save the grading scale.",
      );
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit grading scale" size="md">
      <p className="mb-4 text-sm text-muted">
        Letter cutoffs used to render your current grade. +/- schools just have
        more rows.
      </p>
      <div className="space-y-2">
        {drafts.length === 0 ? (
          <p className="text-sm text-muted">No bands yet.</p>
        ) : (
          drafts.map((d) => (
            <div
              key={d.key}
              className="grid grid-cols-[7rem_1fr_auto] items-center gap-2"
            >
              <input
                className="input font-num uppercase"
                value={d.letter}
                onChange={(e) => updateDraft(d.key, { letter: e.target.value })}
                maxLength={8}
                placeholder="A-"
                aria-label="Letter"
              />
              <div className="flex items-center gap-1.5">
                <input
                  className="input font-num"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={d.minPct}
                  onChange={(e) =>
                    updateDraft(d.key, { minPct: e.target.value })
                  }
                  placeholder="90"
                  aria-label={`Minimum percent for ${d.letter || "band"}`}
                />
                <span className="shrink-0 text-xs text-muted">%+</span>
              </div>
              <button
                type="button"
                className="rounded p-2 text-muted hover:bg-danger/10 hover:text-danger"
                onClick={() =>
                  setDrafts((prev) => prev.filter((row) => row.key !== d.key))
                }
                aria-label={`Remove ${d.letter || "band"}`}
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => setDrafts((prev) => [...prev, newDraft()])}
        >
          + Add a band
        </button>
        {drafts.length === 0 ? (
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() =>
              setDrafts(
                DEFAULT_SCALE.map((b) => ({
                  key: `std-${b.letter}`,
                  letter: b.letter,
                  minPct: String(b.min_pct),
                })),
              )
            }
          >
            Use standard 10-point scale
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          className="text-sm text-muted hover:underline"
          onClick={onClose}
          disabled={replace.isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={replace.isPending}
        >
          {replace.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function TrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
