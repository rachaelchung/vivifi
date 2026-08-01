import { useEffect, useRef, useState } from "react";

interface InlineEditableTextProps {
  value: string;
  onSave: (next: string) => void | Promise<unknown>;
  /** Extra class on the display text. */
  className?: string;
  /** Aria label for the edit control. */
  ariaLabel: string;
  /** When true, dim + strike the display text (e.g. completed assignment). */
  struck?: boolean;
  disabled?: boolean;
}

/**
 * Hover/focus reveals a pencil; click swaps the label for an inline input.
 * Enter / blur commits; Escape cancels. Empty commits are rejected.
 */
export function InlineEditableText({
  value,
  onSave,
  className = "",
  ariaLabel,
  struck = false,
  disabled = false,
}: InlineEditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    await onSave(next);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="input w-full min-w-0 py-1 text-sm font-medium"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="group/edit inline-flex max-w-full min-w-0 items-center gap-1">
      <p
        className={
          "truncate text-sm font-medium " +
          (struck ? "text-muted line-through " : "") +
          className
        }
      >
        {value}
      </p>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setDraft(value);
          setEditing(true);
        }}
        className={
          "flex-shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity " +
          "hover:bg-bg hover:text-fg " +
          "focus-visible:opacity-100 focus-visible:outline-none " +
          "group-hover/edit:opacity-100 " +
          (disabled ? "pointer-events-none" : "")
        }
        aria-label={ariaLabel}
        title="Rename"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
