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
