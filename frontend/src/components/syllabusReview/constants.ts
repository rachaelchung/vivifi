import type {
  ExtractedAssignment,
  ExtractedClassMeeting,
  ExtractedGradeCategory,
  ExtractedGradeScaleBand,
  ExtractedNote,
  ExtractedOfficeHour,
  ExtractedOfficeHourHost,
  SyllabusExtraction,
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

/** Blank review payload for courses set up without a syllabus upload. */
export function emptyManualExtraction(course: {
  name: string;
  code: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
}): SyllabusExtraction {
  return {
    course: {
      name: course.name,
      code: course.code,
      instructor_name: course.instructor_name,
      instructor_email: course.instructor_email,
    },
    // SPEC default when no weights are known — user can restructure before commit.
    grade_categories: [{ name: "Overall", weight_pct: 100, drop_lowest_n: 0 }],
    grading_scale: DEFAULT_SCALE.map((b) => ({ ...b })),
    assignments: [],
    office_hour_hosts: [],
    office_hours: [],
    class_meetings: [],
    notes: [],
  };
}
