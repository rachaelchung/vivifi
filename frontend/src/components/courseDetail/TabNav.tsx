import { cn } from "@/lib/utils";

export type CourseTabId = "gradebook" | "assignments" | "instructors" | "notes";

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
  ];
  if (showNotes) tabs.push({ id: "notes", label: "Notes" });

  return (
    <div
      role="tablist"
      aria-label="Course sections"
      className="flex gap-1 border-b border-border"
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
              "relative -mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors",
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
