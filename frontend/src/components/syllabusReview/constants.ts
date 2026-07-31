import type {
  ExtractedAssignment,
  ExtractedClassMeeting,
  ExtractedGradeCategory,
  ExtractedGradeScaleBand,
  ExtractedNote,
  ExtractedOfficeHour,
  ExtractedOfficeHourHost,
} from "@/api/types";

// SPEC uses Monday = 0, Sunday = 6.
export const WEEKDAYS: readonly string[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// SPEC: default 10-point scale, applied when the extraction returned none.
export const DEFAULT_SCALE: ExtractedGradeScaleBand[] = [
  { letter: "A", min_pct: 90 },
  { letter: "B", min_pct: 80 },
  { letter: "C", min_pct: 70 },
  { letter: "D", min_pct: 60 },
  { letter: "F", min_pct: 0 },
];

// Empty-row factories keep "Add a row" clicks trivial across sections.
export function emptyCategory(): ExtractedGradeCategory {
  return { name: "", weight_pct: 0, drop_lowest_n: 0 };
}

export function emptyScaleBand(): ExtractedGradeScaleBand {
  return { letter: "", min_pct: 0 };
}

export function emptyAssignment(): ExtractedAssignment {
  return {
    name: "",
    kind: "assignment",
    due_date: null,
    category_name: null,
    points_possible: 100,
  };
}

export function emptyHost(): ExtractedOfficeHourHost {
  return { name: "", role: "TA", email: null, zoom_link: null };
}

export function emptyOfficeHour(hostName: string = ""): ExtractedOfficeHour {
  return {
    day_of_week: 0,
    start_time: "09:00",
    end_time: "10:00",
    location: null,
    host_name: hostName,
  };
}

export function emptyClassMeeting(): ExtractedClassMeeting {
  return {
    day_of_week: 0,
    start_time: "10:00",
    end_time: "11:20",
    location: null,
  };
}

export function emptyNote(): ExtractedNote {
  return { heading: "", body: "" };
}
