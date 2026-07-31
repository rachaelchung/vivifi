import type { ReactNode } from "react";

interface RowCardProps {
  children: ReactNode;
  onRemove?: () => void;
  ariaLabel?: string;
}

/** One editable row on the Syllabus Review screen. A card-ish wrapper with a
 * trash icon on the right; used across categories, assignments, hosts, etc. */
export function RowCard({ children, onRemove, ariaLabel }: RowCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        {onRemove ? (
          <button
            type="button"
            className="rounded p-2 text-muted hover:bg-bg hover:text-danger"
            onClick={onRemove}
            aria-label={ariaLabel ?? "Remove row"}
          >
            <svg
              aria-hidden
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
