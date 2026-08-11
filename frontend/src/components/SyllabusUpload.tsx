import { useState, useRef, type DragEvent, type FormEvent } from "react";

import { ApiError } from "@/api/client";
import { useUploadSyllabusPdf, useUploadSyllabusText } from "@/api/syllabus";
import type { SyllabusExtractResponse } from "@/api/types";
import { cn } from "@/lib/utils";

interface SyllabusUploadProps {
  courseSlug: string;
  courseColor: string;
  onExtracted: (response: SyllabusExtractResponse) => void;
}

// SPEC caps uploads at 10 MB. Enforce client-side so the user gets a fast
// friendly error instead of a 413 round-trip.
const MAX_BYTES = 10 * 1024 * 1024;

export function SyllabusUpload({
  courseSlug,
  courseColor,
  onExtracted,
}: SyllabusUploadProps) {
  const [tab, setTab] = useState<"pdf" | "text">("pdf");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadPdf = useUploadSyllabusPdf(courseSlug);
  const uploadText = useUploadSyllabusText(courseSlug);

  const busy = uploadPdf.isPending || uploadText.isPending;

  async function handlePdfFile(file: File) {
    setError(null);
    if (file.size === 0) {
      setError("That file is empty.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That PDF is over 10 MB. Try compressing it, or paste the text.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported. Use the paste-text tab for anything else.");
      return;
    }
    try {
      const response = await uploadPdf.mutateAsync(file);
      onExtracted(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't parse that PDF.");
    }
  }

  function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handlePdfFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handlePdfFile(file);
  }

  async function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!pastedText.trim()) {
      setError("Paste some text first.");
      return;
    }
    try {
      const response = await uploadText.mutateAsync(pastedText.trim());
      onExtracted(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't parse that text.");
    }
  }

  return (
    <div
      className="card p-6"
      style={{ ["--color-accent" as string]: courseColor }}
    >
      <div className="flex items-center gap-4 border-b border-border">
        <TabButton active={tab === "pdf"} onClick={() => setTab("pdf")}>
          Upload PDF
        </TabButton>
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          Paste text
        </TabButton>
      </div>

      {tab === "pdf" ? (
        <div
          className={cn(
            "mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors",
            dragOver
              ? "border-accent bg-bg"
              : "border-border bg-transparent hover:bg-bg",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <UploadIcon />
          <p className="mt-3 text-base font-medium">Drop your syllabus PDF here</p>
          <p className="mt-1 text-sm text-muted">or</p>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy ? "Reading syllabus…" : "Choose a PDF"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleFilePicked}
          />
          <p className="mt-4 max-w-md text-xs text-muted">
            Uploaded syllabi are not stored on our servers but are processed by AI. <br></br><em>Please do not upload documents containing confidential or private information.</em>
          </p>
        </div>
      ) : (
        <form onSubmit={handleTextSubmit} className="mt-6 space-y-3">
          <label className="label" htmlFor="paste-text">
            Paste the syllabus text
          </label>
          <textarea
            id="paste-text"
            className="input min-h-[240px] font-mono text-xs"
            placeholder="Paste the whole syllabus here — course info, grade breakdown, schedule, office hours, everything."
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <p className="hint">
              Use this when the syllabus is not in a format that can be uploaded. Pasted info is not stored on our servers but is processed by AI. <br></br><em>Please do not upload confidential or private information.</em>
            </p>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || !pastedText.trim()}
            >
              {busy ? "Parsing…" : "Parse text"}
            </button>
          </div>
        </form>
      )}

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors",
        active
          ? "border-accent text-fg"
          : "border-transparent text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-accent"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
