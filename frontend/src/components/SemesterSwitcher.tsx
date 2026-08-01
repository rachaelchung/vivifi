import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { Semester } from "@/api/types";
import { cn } from "@/lib/utils";

interface SemesterSwitcherProps {
  semesters: Semester[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
  onDelete?: (slug: string) => void;
  /** Called with the new name when an inline rename commits. */
  onRename?: (slug: string, name: string) => void | Promise<unknown>;
  /** When true, the calendar icon tab on the far right reads as selected. */
  calendarActive?: boolean;
}

export function SemesterSwitcher({
  semesters,
  activeSlug,
  onSelect,
  onDelete,
  onRename,
  calendarActive = false,
}: SemesterSwitcherProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renamingSlug, setRenamingSlug] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const hasMenu = !!(onDelete || onRename);

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

  useEffect(() => {
    if (renamingSlug) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingSlug]);

  async function commitRename(sem: Semester) {
    const next = renameDraft.trim();
    setRenamingSlug(null);
    if (!onRename || !next || next === sem.name) {
      setRenameDraft(sem.name);
      return;
    }
    await onRename(sem.slug, next);
  }

  function cancelRename(sem: Semester) {
    setRenameDraft(sem.name);
    setRenamingSlug(null);
  }

  return (
    <div className="flex flex-wrap items-end gap-1 border-b border-border">
      {semesters.map((sem) => {
        const isSelected = sem.slug === activeSlug;
        // On the calendar view the icon tab is "active"; still mark the
        // current semester so you can tell which term you're looking at.
        const isActiveTab = calendarActive ? false : isSelected;
        const isMenuOpen = menuOpen === sem.slug;
        const isRenaming = renamingSlug === sem.slug;
        const showMenu = isActiveTab && hasMenu && !isRenaming;
        return (
          <div
            key={sem.slug}
            className="relative"
            ref={isMenuOpen ? menuRef : undefined}
          >
            <div
              className={cn(
                "-mb-px flex items-center rounded-t-lg border border-transparent",
                isActiveTab || isRenaming
                  ? "border-border border-b-surface bg-surface text-fg"
                  : isSelected && calendarActive
                    ? "text-fg"
                    : "text-muted",
              )}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className="min-w-[6rem] max-w-[12rem] border-0 bg-transparent px-3 py-2 text-sm font-medium outline-none"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => {
                    void commitRename(sem);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelRename(sem);
                    }
                  }}
                  aria-label={`Rename ${sem.name}`}
                />
              ) : (
                <button
                  onClick={() => onSelect(sem.slug)}
                  className={cn(
                    "py-2 text-sm font-medium transition-colors",
                    showMenu ? "pl-4 pr-1.5" : "px-4",
                    !isActiveTab && !(isSelected && calendarActive)
                      ? "hover:text-fg"
                      : "",
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
              )}
              {showMenu ? (
                <button
                  aria-label={`Semester options: ${sem.name}`}
                  aria-expanded={isMenuOpen}
                  type="button"
                  onClick={() =>
                    setMenuOpen((current) =>
                      current === sem.slug ? null : sem.slug,
                    )
                  }
                  className="mr-1 rounded-md p-1.5 text-muted hover:bg-bg hover:text-fg"
                >
                  <DotsIcon />
                </button>
              ) : null}
            </div>
            {isMenuOpen && hasMenu ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-2 w-48 rounded-lg border border-border bg-surface p-1 shadow-card"
              >
                {onRename ? (
                  <button
                    role="menuitem"
                    className="block w-full rounded px-3 py-2 text-left text-sm text-fg hover:bg-bg"
                    onClick={() => {
                      setMenuOpen(null);
                      setRenameDraft(sem.name);
                      setRenamingSlug(sem.slug);
                    }}
                  >
                    Rename semester
                  </button>
                ) : null}
                {onDelete ? (
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
                ) : null}
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

      <Link
        to="/calendar"
        aria-label="Calendar"
        title="Calendar"
        className={cn(
          "ml-auto -mb-px inline-flex items-center justify-center rounded-t-lg border border-transparent px-3 py-2 transition-colors",
          calendarActive
            ? "border-border border-b-surface bg-surface text-fg"
            : "text-muted hover:text-fg",
        )}
      >
        <CalendarIcon />
      </Link>
    </div>
  );
}

function DotsIcon() {
  return (
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
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
