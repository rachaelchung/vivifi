import { useState } from "react";

import type { CourseNote } from "@/api/types";
import {
  useCreateNote,
  useDeleteNote,
  useNotes,
  useUpdateNote,
} from "@/api/liveViews";

interface NotesTabProps {
  courseSlug: string;
}

/**
 * The Notes tab (course-specific policies).
 *
 * SPEC:
 * - The tab only appears when there's at least one note (that's enforced by
 *   the parent CourseDetailPage, which hides the tab when notes is empty).
 * - Generic university boilerplate is filtered at extraction time — the notes
 *   here are the things the *instructor* is emphasizing.
 */
export function NotesTab({ courseSlug }: NotesTabProps) {
  const q = useNotes(courseSlug);
  const [showAdd, setShowAdd] = useState(false);

  if (q.isLoading) {
    return <p className="text-sm text-muted">Loading notes…</p>;
  }
  if (q.error) {
    return <p className="text-sm text-danger">Couldn't load notes.</p>;
  }

  const notes = q.data ?? [];

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Course notes</h2>
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => setShowAdd(true)}
        >
          + Add note
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted">
          No course-specific notes yet.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteCard key={note.id} courseSlug={courseSlug} note={note} />
          ))}
        </div>
      )}

      {showAdd ? (
        <AddNoteForm courseSlug={courseSlug} onClose={() => setShowAdd(false)} />
      ) : null}
    </section>
  );
}

function NoteCard({
  courseSlug,
  note,
}: {
  courseSlug: string;
  note: CourseNote;
}) {
  const del = useDeleteNote(courseSlug);
  const update = useUpdateNote(courseSlug);
  const [editing, setEditing] = useState(false);
  const [heading, setHeading] = useState(note.heading);
  const [body, setBody] = useState(note.body);

  if (editing) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await update.mutateAsync({
            id: note.id,
            payload: { heading: heading.trim(), body: body.trim() },
          });
          setEditing(false);
        }}
        className="card p-4"
      >
        <input
          className="input mb-2 text-base font-semibold"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          required
        />
        <textarea
          className="input min-h-[100px]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            className="text-sm text-muted hover:underline"
            onClick={() => {
              setHeading(note.heading);
              setBody(note.body);
              setEditing(false);
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={update.isPending}
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className="card group relative p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight">
            {note.heading}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
            {note.body}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
            onClick={() => setEditing(true)}
            aria-label="Edit note"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
            onClick={() => {
              if (window.confirm(`Delete note "${note.heading}"?`)) {
                del.mutate(note.id);
              }
            }}
            aria-label={`Delete note ${note.heading}`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </article>
  );
}

function AddNoteForm({
  courseSlug,
  onClose,
}: {
  courseSlug: string;
  onClose: () => void;
}) {
  const create = useCreateNote(courseSlug);
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!heading.trim() || !body.trim()) return;
    await create.mutateAsync({
      heading: heading.trim(),
      body: body.trim(),
    });
    onClose();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <input
        className="input mb-3"
        placeholder="Heading (e.g. Late-work policy)"
        value={heading}
        onChange={(e) => setHeading(e.target.value)}
        required
        autoFocus
      />
      <textarea
        className="input min-h-[100px]"
        placeholder="Body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <div className="mt-3 flex items-center justify-end gap-3">
        <button
          type="button"
          className="text-sm text-muted hover:underline"
          onClick={onClose}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add note"}
        </button>
      </div>
    </form>
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
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function TrashIcon() {
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
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
