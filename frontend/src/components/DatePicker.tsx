import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const POPOVER_WIDTH_PX = 280;

type DatePickerVariant = "field" | "chip";

interface DatePickerProps {
  value: string | null;
  onChange: (next: string | null) => void;
  id?: string;
  ariaLabel?: string;
  /** Shown on the trigger when no date is selected. */
  placeholder?: string;
  /** Footer action that clears the value. Pass null to hide. */
  clearLabel?: string | null;
  variant?: DatePickerVariant;
  className?: string;
  struck?: boolean;
  accent?: boolean;
}

/**
 * Shared calendar picker. Native `input[type=date]` (and showPicker on a
 * hidden input) often ignores outside clicks; this popover closes on
 * outside click, Escape, and selection.
 */
export function DatePicker({
  value,
  onChange,
  id,
  ariaLabel,
  placeholder = "No date",
  clearLabel = "Clear",
  variant = "field",
  className,
  struck = false,
  accent = false,
}: DatePickerProps) {
  const iso = value || null;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      const t = event.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const pop = popoverRef.current;
    if (!trigger || !pop) return;

    function place() {
      const el = triggerRef.current;
      const panel = popoverRef.current;
      if (!el || !panel) return;
      const rect = el.getBoundingClientRect();
      const popH = panel.offsetHeight;
      const popW = panel.offsetWidth || POPOVER_WIDTH_PX;
      const gap = 6;
      const pad = 8;

      let top = rect.bottom + gap;
      if (top + popH > window.innerHeight - pad && rect.top - gap - popH >= pad) {
        top = rect.top - gap - popH;
      }

      const alignEnd = variant === "chip";
      let left = alignEnd ? rect.right - popW : rect.left;
      left = Math.min(Math.max(pad, left), window.innerWidth - popW - pad);

      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
    }

    place();
    const ro = new ResizeObserver(place);
    ro.observe(pop);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, variant]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className={
          variant === "chip"
            ? cn(
                "block w-[7.5rem] shrink-0 rounded-md border px-2.5 py-1 text-right font-num text-xs text-fg",
                accent
                  ? "border-accent/40 bg-accent/10 hover:border-accent/70"
                  : "border-border bg-surface hover:border-fg/30",
                struck && "line-through",
                className,
              )
            : cn(
                "input text-left font-num",
                !iso && "text-muted",
                open && "border-accent",
                className,
              )
        }
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={ariaLabel ?? "Choose date"}
      >
        {iso ? formatDisplay(iso) : placeholder}
      </button>
      {open
        ? createPortal(
            <DatePickerPopover
              popoverRef={popoverRef}
              value={iso}
              clearLabel={clearLabel}
              onSelect={(next) => {
                if (next !== iso) onChange(next);
                setOpen(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function DatePickerPopover({
  value,
  onSelect,
  clearLabel,
  popoverRef,
}: {
  value: string | null;
  onSelect: (next: string | null) => void;
  clearLabel: string | null;
  popoverRef: Ref<HTMLDivElement>;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = value ? parseISODate(value) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = monthCells(year, month);
  const todayIso = toISODate(new Date());
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Choose date"
      className="fixed z-[70] w-[17.5rem] rounded-xl border border-border bg-surface p-3 shadow-card"
      style={{ top: 0, left: 0 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
          aria-label="Previous month"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
        >
          <ChevronIcon dir="left" />
        </button>
        <p className="text-sm font-medium">{monthLabel}</p>
        <button
          type="button"
          className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
          aria-label="Next month"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
        >
          <ChevronIcon dir="right" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d, i) => (
          <div
            key={`${d}-${i}`}
            className="py-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted"
          >
            {d}
          </div>
        ))}
        {cells.map((cell, i) =>
          cell ? (
            <button
              key={cell}
              type="button"
              onClick={() => onSelect(cell)}
              className={
                "h-8 rounded-md font-num text-xs transition-colors " +
                (cell === value
                  ? "bg-accent text-accent-fg "
                  : cell === todayIso
                    ? "text-accent hover:bg-bg "
                    : "text-fg hover:bg-bg ")
              }
            >
              {Number(cell.slice(8))}
            </button>
          ) : (
            <div key={`pad-${i}`} />
          ),
        )}
      </div>
      {clearLabel ? (
        <button
          type="button"
          className="mt-2 w-full rounded-md py-1.5 text-xs text-muted hover:bg-bg hover:text-fg"
          onClick={() => onSelect(null)}
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
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
      {dir === "left" ? (
        <path d="M15 18l-6-6 6-6" />
      ) : (
        <path d="M9 18l6-6-6-6" />
      )}
    </svg>
  );
}

function formatDisplay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Local calendar day as YYYY-MM-DD (avoids UTC shift from toISOString). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function monthCells(year: number, month: number): (string | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    cells.push(toISODate(new Date(year, month, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
