import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/api/client";
import type { Course, CourseCreatePayload, CourseUpdatePayload } from "@/api/types";

const coursesKey = (semesterSlug: string | null) => ["courses", semesterSlug] as const;
const courseKey = (slug: string | null) => ["course", slug] as const;

export function useCoursesForSemester(semesterSlug: string | null) {
  return useQuery({
    queryKey: coursesKey(semesterSlug),
    queryFn: () =>
      apiRequest<Course[]>(
        semesterSlug ? `/courses?semester_slug=${encodeURIComponent(semesterSlug)}` : "/courses",
      ),
    enabled: semesterSlug !== null,
  });
}

export function useCourse(slug: string | null) {
  return useQuery({
    queryKey: courseKey(slug),
    queryFn: () => apiRequest<Course>(`/courses/${slug}`),
    enabled: !!slug,
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CourseCreatePayload) =>
      apiRequest<Course>("/courses", { method: "POST", body: payload }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: coursesKey(created.semester_slug) });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: CourseUpdatePayload }) =>
      apiRequest<Course>(`/courses/${slug}`, { method: "PATCH", body: payload }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: courseKey(updated.slug) });
      qc.invalidateQueries({ queryKey: coursesKey(updated.semester_slug) });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => apiRequest<void>(`/courses/${slug}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}
