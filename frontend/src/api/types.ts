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

// --- Milestone 3: live views ---

export interface GradeCategory {
  id: number;
  name: string;
  weight_pct: number;
  drop_lowest_n: number;
}

export interface GradeCategoryCreatePayload {
  name: string;
  weight_pct: number;
  drop_lowest_n?: number;
}

export interface GradeCategoryUpdatePayload {
  name?: string;
  weight_pct?: number;
  drop_lowest_n?: number;
}

export interface GradeScaleBand {
  id: number;
  letter: string;
  min_pct: number;
}

export interface GradeScaleBandInput {
  letter: string;
  min_pct: number;
}

export interface Assignment {
  slug: string;
  name: string;
  kind: AssignmentKind;
  // ISO date (YYYY-MM-DD) or null.
  due_date: string | null;
  source: "syllabus" | "manual" | "sms";
  completed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentCreatePayload {
  name: string;
  kind?: AssignmentKind;
  due_date?: string | null;
  notes?: string | null;
}

export interface AssignmentUpdatePayload {
  name?: string;
  kind?: AssignmentKind;
  due_date?: string | null;
  completed?: boolean;
  notes?: string | null;
}

export interface GradebookEntry {
  slug: string;
  name: string;
  category_id: number | null;
  points_earned: number | null;
  points_possible: number;
  source: "syllabus" | "manual" | "sms";
  source_assignment_id: number | null;
  hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface GradebookEntryCreatePayload {
  name: string;
  category_id?: number | null;
  points_possible: number;
  points_earned?: number | null;
}

export interface GradebookEntryUpdatePayload {
  name?: string;
  category_id?: number | null;
  points_earned?: number | null;
  points_possible?: number;
  hidden?: boolean;
}

export interface OfficeHourHost {
  id: number;
  name: string;
  role: HostRole;
  email: string | null;
  zoom_link: string | null;
  notes: string | null;
}

export interface OfficeHourHostCreatePayload {
  name: string;
  role?: HostRole;
  email?: string | null;
  zoom_link?: string | null;
  notes?: string | null;
}

export interface OfficeHour {
  id: number;
  host_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
}

export interface OfficeHourCreatePayload {
  host_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location?: string | null;
}

export interface CourseNote {
  id: number;
  heading: string;
  body: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface CourseNoteCreatePayload {
  heading: string;
  body: string;
}

export interface CourseNoteUpdatePayload {
  heading?: string;
  body?: string;
}

// Current-grade + prediction

export interface CategoryEarned {
  category_id: number;
  name: string;
  weight_pct: number;
  earned_pct: number | null;
  has_grades: boolean;
}

export interface CurrentGrade {
  percentage: number | null;
  letter: string | null;
  breakdown: CategoryEarned[];
  target: string | null;
  target_pct: number | null;
}

export type PredictKind =
  | "current_grade"
  | "needed_on_category"
  | "needed_on_entry"
  | "scenarios"
  | "reweight"
  | "reweight_scenarios"
  | "unknown";

export type ScenarioLegRole = "anchor" | "solve";

export interface ScenarioLeg {
  entry_name: string;
  role: ScenarioLegRole;
  pct: number;
}

export type ScenarioId = "ace" | "steady" | "recover" | string;

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  anchor_pct: number | null;
  solve_pct: number | null;
  resulting_grade_pct: number;
  resulting_letter: string | null;
  reachable: boolean;
  already_locked_in: boolean;
  legs: ScenarioLeg[];
}

export interface ReweightScaled {
  name: string;
  original_weight_pct: number;
  scaled_weight_pct: number;
}

export interface ReweightApplied {
  new_category_name: string;
  new_weight_pct: number;
  scaled: ReweightScaled[];
}

export interface PredictResponse {
  kind: PredictKind;
  answer: number | null;
  letter: string | null;
  reachable: boolean | null;
  already_locked_in: boolean | null;
  explanation: string;
  target: string | null;
  target_pct: number | null;
  target_category_name: string | null;
  target_entry_name: string | null;
  needed_points: number | null;
  current_pct: number | null;
  current_letter: string | null;
  scenarios: Scenario[] | null;
  reweight_applied: ReweightApplied | null;
}
