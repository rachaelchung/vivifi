import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { Semester } from "@/api/types";
import { cn } from "@/lib/utils";

interface SemesterSwitcherProps {
  semesters: Semester[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
  onDelete?: (slug: string) => void;
}

export function SemesterSwitcher({
  semesters,
  activeSlug,
  onSelect,
  onDelete,
}: SemesterSwitcherProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the popover when the user clicks anywhere outside it or hits Escape.
  useEffect(() => {
    if (menuOpen === null) return;

    function handlePointer(event: MouseEvent) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(null);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(null);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <div className="flex flex-wrap items-end gap-1 border-b border-border">
      {semesters.map((sem) => {
        const isActive = sem.slug === activeSlug;
        const isMenuOpen = menuOpen === sem.slug;
        return (
          <div
            key={sem.slug}
            className="relative"
            ref={isMenuOpen ? menuRef : undefined}
          >
            <button
              onClick={() => onSelect(sem.slug)}
              className={cn(
                "-mb-px rounded-t-lg border border-transparent px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-border border-b-surface bg-surface text-fg"
                  : "text-muted hover:text-fg",
              )}
            >
              <span className="flex items-center gap-2">
                {sem.name}
                {sem.is_active ? (
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
                  />
                ) : null}
              </span>
            </button>
            {isActive && onDelete ? (
              <button
                aria-label={`Semester options: ${sem.name}`}
                aria-expanded={isMenuOpen}
                type="button"
                onClick={() =>
                  setMenuOpen((current) => (current === sem.slug ? null : sem.slug))
                }
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-bg"
              >
                <svg
                  aria-hidden
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
            ) : null}
            {isMenuOpen && onDelete ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-2 w-48 rounded-lg border border-border bg-surface p-1 shadow-card"
              >
                <button
                  role="menuitem"
                  className="block w-full rounded px-3 py-2 text-left text-sm text-danger hover:bg-bg"
                  onClick={() => {
                    setMenuOpen(null);
                    onDelete(sem.slug);
                  }}
                >
                  Delete semester
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      <Link
        to="/semester-setup"
        className="-mb-px rounded-t-lg px-4 py-2 text-sm font-medium text-muted hover:text-fg"
      >
        + New semester
      </Link>
    </div>
  );
}
