import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
}

/** Top-level card wrapping one section of the Syllabus Review page
 * (categories, scale, assignments, hosts, etc.). */
export function SectionCard({ title, description, aside, children }: SectionCardProps) {
  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
          ) : null}
        </div>
        {aside ? <div className="flex-shrink-0">{aside}</div> : null}
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
}

interface AddRowButtonProps {
  onClick: () => void;
  label: string;
}

export function AddRowButton({ onClick, label }: AddRowButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <span aria-hidden>+</span>
      <span>{label}</span>
    </button>
  );
}
