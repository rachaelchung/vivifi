import { useEffect, type ReactNode } from "react";

type ModalSize = "md" | "lg" | "xl";

const SIZE_CLASS: Record<ModalSize, string> = {
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: ModalSize;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <button
        aria-label="Close modal"
        className="absolute inset-0 backdrop-blur-sm"
        onClick={onClose}
        style={{ backgroundColor: "rgba(27, 27, 31, 0.3)" }}
      />
      <div className={`relative w-full ${SIZE_CLASS[size]}`}>
        <div className="card max-h-[85vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between">
            <h2 id="modal-title" className="text-xl font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-muted hover:bg-bg"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
