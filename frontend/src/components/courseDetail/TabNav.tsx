import { cn } from "@/lib/utils";

export type CourseTabId =
  | "gradebook"
  | "assignments"
  | "instructors"
  | "meetings"
  | "materials"
  | "notes";

interface Tab {
  id: CourseTabId;
  label: string;
}

interface TabNavProps {
  active: CourseTabId;
  onSelect: (id: CourseTabId) => void;
  showNotes: boolean;
}

export function TabNav({ active, onSelect, showNotes }: TabNavProps) {
  const tabs: Tab[] = [
    { id: "gradebook", label: "Gradebook" },
    { id: "assignments", label: "Assignments" },
    { id: "instructors", label: "Instructors" },
    { id: "meetings", label: "Meetings" },
    { id: "materials", label: "Materials" },
  ];
  if (showNotes) tabs.push({ id: "notes", label: "Notes" });

  return (
    <div
      role="tablist"
      aria-label="Course sections"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "relative -mb-px flex-shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
              selected
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
