import { useState } from "react";

import type {
  CourseMaterial,
  CourseMaterialCreatePayload,
  MaterialKind,
  MaterialRequirement,
} from "@/api/types";
import {
  useCreateMaterial,
  useDeleteMaterial,
  useMaterials,
  useUpdateMaterial,
} from "@/api/liveViews";

interface MaterialsTabProps {
  courseSlug: string;
}

/**
 * Always-on Materials tab: textbooks, books, and other supplies as
 * scannable cards (not a bibliography wall of text).
 */
export function MaterialsTab({ courseSlug }: MaterialsTabProps) {
  const q = useMaterials(courseSlug);
  const [showAdd, setShowAdd] = useState(false);

  if (q.isLoading) {
    return <p className="text-sm text-muted">Loading materials…</p>;
  }
  if (q.error) {
    return <p className="text-sm text-danger">Couldn't load materials.</p>;
  }

  const materials = q.data ?? [];
  const required = materials.filter((m) => m.requirement === "required");
  const recommended = materials.filter((m) => m.requirement === "recommended");

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Materials</h2>
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => setShowAdd(true)}
        >
          + Add material
        </button>
      </div>

      {materials.length === 0 ? (
        <p className="text-sm text-muted">No materials required.</p>
      ) : (
        <div className="space-y-8">
          {required.length > 0 ? (
            <MaterialGroup
              label="Required"
              items={required}
              courseSlug={courseSlug}
            />
          ) : null}
          {recommended.length > 0 ? (
            <MaterialGroup
              label="Recommended"
              items={recommended}
              courseSlug={courseSlug}
            />
          ) : null}
        </div>
      )}

      {showAdd ? (
        <AddMaterialForm
          courseSlug={courseSlug}
          onClose={() => setShowAdd(false)}
        />
      ) : null}
    </section>
  );
}

function MaterialGroup({
  label,
  items,
  courseSlug,
}: {
  label: string;
  items: CourseMaterial[];
  courseSlug: string;
}) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </h3>
      <div className="space-y-3">
        {items.map((m) => (
          <MaterialCard key={m.id} courseSlug={courseSlug} material={m} />
        ))}
      </div>
    </div>
  );
}

function MaterialCard({
  courseSlug,
  material,
}: {
  courseSlug: string;
  material: CourseMaterial;
}) {
  const del = useDeleteMaterial(courseSlug);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditMaterialForm
        courseSlug={courseSlug}
        material={material}
        onClose={() => setEditing(false)}
      />
    );
  }

  const metaBits: string[] = [];
  if (material.kind === "textbook") {
    if (material.edition) metaBits.push(material.edition);
    if (material.publisher) metaBits.push(material.publisher);
    if (material.year) metaBits.push(String(material.year));
  }

  return (
    <article className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={material.kind} />
            <RequirementBadge requirement={material.requirement} />
          </div>
          <h3 className="mt-2 text-base font-semibold tracking-tight">
            {material.title}
          </h3>
          {material.authors ? (
            <p className="mt-1 text-sm text-muted">{material.authors}</p>
          ) : null}
          {metaBits.length > 0 ? (
            <p className="mt-1 font-num text-xs text-muted">
              {metaBits.join(" · ")}
            </p>
          ) : null}
          {material.isbn ? (
            <p className="mt-1 font-num text-xs text-muted">
              ISBN {material.isbn}
            </p>
          ) : null}
          {material.url ? (
            <a
              href={material.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-accent hover:underline"
            >
              Open link
            </a>
          ) : null}
          {material.notes ? (
            <p className="mt-2 text-sm text-muted">{material.notes}</p>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 gap-1">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn-ghost text-xs text-danger"
            onClick={() => {
              if (window.confirm(`Remove “${material.title}”?`)) {
                del.mutate(material.id);
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function KindBadge({ kind }: { kind: MaterialKind }) {
  const label =
    kind === "textbook" ? "Textbook" : kind === "book" ? "Book" : "Other";
  return (
    <span className="inline-flex items-center rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
      {label}
    </span>
  );
}

function RequirementBadge({
  requirement,
}: {
  requirement: MaterialRequirement;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
        (requirement === "required"
          ? "bg-accent/15 text-accent"
          : "bg-bg text-muted")
      }
    >
      {requirement}
    </span>
  );
}

function AddMaterialForm({
  courseSlug,
  onClose,
}: {
  courseSlug: string;
  onClose: () => void;
}) {
  const create = useCreateMaterial(courseSlug);
  const [draft, setDraft] = useState<CourseMaterialCreatePayload>({
    kind: "textbook",
    title: "",
    authors: null,
    edition: null,
    isbn: null,
    publisher: null,
    year: null,
    url: null,
    requirement: "required",
    notes: null,
  });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({
        ...draft,
        title: draft.title.trim(),
      });
      onClose();
    } catch {
      setError("Couldn't save that material.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-6 space-y-3 p-5">
      <p className="text-sm font-medium">New material</p>
      <MaterialFields draft={draft} onChange={setDraft} />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary text-sm" disabled={create.isPending}>
          Save
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditMaterialForm({
  courseSlug,
  material,
  onClose,
}: {
  courseSlug: string;
  material: CourseMaterial;
  onClose: () => void;
}) {
  const update = useUpdateMaterial(courseSlug);
  const [draft, setDraft] = useState<CourseMaterialCreatePayload>({
    kind: material.kind,
    title: material.title,
    authors: material.authors,
    edition: material.edition,
    isbn: material.isbn,
    publisher: material.publisher,
    year: material.year,
    url: material.url,
    requirement: material.requirement,
    notes: material.notes,
  });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title?.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({
        id: material.id,
        payload: { ...draft, title: draft.title.trim() },
      });
      onClose();
    } catch {
      setError("Couldn't update that material.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-5">
      <MaterialFields draft={draft} onChange={setDraft} />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary text-sm" disabled={update.isPending}>
          Save
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function MaterialFields({
  draft,
  onChange,
}: {
  draft: CourseMaterialCreatePayload;
  onChange: (next: CourseMaterialCreatePayload) => void;
}) {
  const kind = draft.kind ?? "textbook";

  function patch(p: Partial<CourseMaterialCreatePayload>) {
    onChange({ ...draft, ...p });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="hint">Kind</label>
          <select
            className="input"
            value={kind}
            onChange={(e) => patch({ kind: e.target.value as MaterialKind })}
          >
            <option value="textbook">Textbook</option>
            <option value="book">Book</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="hint">Requirement</label>
          <select
            className="input"
            value={draft.requirement ?? "required"}
            onChange={(e) =>
              patch({ requirement: e.target.value as MaterialRequirement })
            }
          >
            <option value="required">Required</option>
            <option value="recommended">Recommended</option>
          </select>
        </div>
        <div>
          <label className="hint">{kind === "other" ? "Name" : "Title"}</label>
          <input
            className="input"
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </div>
      </div>

      {kind !== "other" ? (
        <div>
          <label className="hint">Author(s)</label>
          <input
            className="input"
            value={draft.authors ?? ""}
            onChange={(e) =>
              patch({ authors: e.target.value.trim() || null })
            }
          />
        </div>
      ) : null}

      {kind === "textbook" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="hint">Edition</label>
            <input
              className="input"
              value={draft.edition ?? ""}
              onChange={(e) =>
                patch({ edition: e.target.value.trim() || null })
              }
            />
          </div>
          <div>
            <label className="hint">ISBN</label>
            <input
              className="input font-num"
              value={draft.isbn ?? ""}
              onChange={(e) => patch({ isbn: e.target.value.trim() || null })}
            />
          </div>
          <div>
            <label className="hint">Publisher</label>
            <input
              className="input"
              value={draft.publisher ?? ""}
              onChange={(e) =>
                patch({ publisher: e.target.value.trim() || null })
              }
            />
          </div>
          <div>
            <label className="hint">Year</label>
            <input
              className="input font-num"
              type="number"
              min={1000}
              max={2100}
              value={draft.year ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                patch({ year: raw === "" ? null : Number(raw) || null });
              }}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="hint">URL</label>
            <input
              className="input"
              value={draft.url ?? ""}
              onChange={(e) => patch({ url: e.target.value.trim() || null })}
            />
          </div>
        </div>
      ) : null}

      {kind === "book" ? (
        <div>
          <label className="hint">URL (optional)</label>
          <input
            className="input"
            value={draft.url ?? ""}
            onChange={(e) => patch({ url: e.target.value.trim() || null })}
          />
        </div>
      ) : null}

      <div>
        <label className="hint">Notes</label>
        <textarea
          className="input min-h-[60px]"
          value={draft.notes ?? ""}
          onChange={(e) => patch({ notes: e.target.value.trim() || null })}
        />
      </div>
    </div>
  );
}
