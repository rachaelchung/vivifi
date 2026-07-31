export interface User {
  slug: string;
  email: string;
  username: string;
  name: string;
  phone: string | null;
  created_at: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface Semester {
  slug: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SemesterCreatePayload {
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
}

export interface SemesterUpdatePayload {
  name?: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
}

export interface Course {
  slug: string;
  semester_slug: string;
  name: string;
  code: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
  color: string;
  target_grade: string | null;
  timezone: string;
  syllabus_committed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseCreatePayload {
  semester_slug: string;
  name: string;
  code?: string | null;
  instructor_name?: string | null;
  instructor_email?: string | null;
  color?: string;
  target_grade?: string | null;
  timezone?: string;
}

// --- Syllabus ingestion ---

export type AssignmentKind = "assignment" | "exam";
export type HostRole = "Professor" | "TA" | "Learning Assistant";

export interface ExtractedCourseMeta {
  name: string;
  code: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
}

export interface ExtractedGradeCategory {
  name: string;
  weight_pct: number;
  drop_lowest_n: number;
}

export interface ExtractedGradeScaleBand {
  letter: string;
  min_pct: number;
}

export interface ExtractedAssignment {
  name: string;
  kind: AssignmentKind;
  // ISO date (YYYY-MM-DD) or null.
  due_date: string | null;
  category_name: string | null;
  points_possible: number;
}

export interface ExtractedOfficeHourHost {
  name: string;
  role: HostRole;
  email: string | null;
  zoom_link: string | null;
}

export interface ExtractedOfficeHour {
  day_of_week: number;
  // "HH:MM" strings on the wire.
  start_time: string;
  end_time: string;
  location: string | null;
  host_name: string;
}

export interface ExtractedClassMeeting {
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
}

export interface ExtractedNote {
  heading: string;
  body: string;
}

export interface SyllabusExtraction {
  course: ExtractedCourseMeta;
  grade_categories: ExtractedGradeCategory[];
  grading_scale: ExtractedGradeScaleBand[];
  assignments: ExtractedAssignment[];
  office_hour_hosts: ExtractedOfficeHourHost[];
  office_hours: ExtractedOfficeHour[];
  class_meetings: ExtractedClassMeeting[];
  notes: ExtractedNote[];
}

export interface SyllabusExtractResponse {
  extraction: SyllabusExtraction;
  looks_incomplete: boolean;
  has_no_assignments: boolean;
}
