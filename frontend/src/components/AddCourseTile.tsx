interface AddCourseTileProps {
  onClick: () => void;
  emphasis?: boolean;
}

export function AddCourseTile({ onClick, emphasis = false }: AddCourseTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        emphasis
          ? "card flex min-h-[220px] flex-col items-center justify-center gap-2 border-2 border-dashed bg-surface p-6 text-fg transition-colors hover:bg-bg"
          : "card flex min-h-[220px] flex-col items-center justify-center gap-2 border-2 border-dashed border-border bg-transparent p-6 text-muted transition-colors hover:bg-surface hover:text-fg"
      }
      style={
        emphasis
          ? {
              borderColor: "color-mix(in oklab, var(--color-accent) 40%, transparent)",
            }
          : undefined
      }
    >
      <span
        aria-hidden
        className="flex h-10 w-10 items-center justify-center rounded-full text-accent"
        style={{
          backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </span>
      <span className="text-sm font-medium">Add course</span>
      <span className="text-xs text-muted">
        Start with a name; then upload the syllabus.
      </span>
    </button>
  );
}
