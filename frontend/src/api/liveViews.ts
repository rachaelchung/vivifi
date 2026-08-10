import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/api/client";
import type {
  Assignment,
  AssignmentCreatePayload,
  AssignmentUpdatePayload,
  CourseMaterial,
  CourseMaterialCreatePayload,
  CourseMaterialUpdatePayload,
  CourseNote,
  CourseNoteCreatePayload,
  CourseNoteUpdatePayload,
  CurrentGrade,
  GradeCategory,
  GradeCategoryCreatePayload,
  GradeCategoryUpdatePayload,
  GradeScaleBand,
  GradeScaleBandInput,
  GradebookEntry,
  GradebookEntryCreatePayload,
  GradebookEntryUpdatePayload,
  OfficeHour,
  OfficeHourCreatePayload,
  OfficeHourHost,
  OfficeHourHostCreatePayload,
  OfficeHourHostUpdatePayload,
  OfficeHourUpdatePayload,
  PredictResponse,
} from "@/api/types";

/**
 * TanStack Query hooks for the M3 live-views endpoints.
 *
 * Every mutation invalidates the queries a UI observer would care about,
 * so components can just call `useCreateAssignment` etc. and let React Query
 * do the refetch. The invalidations are broader than strictly necessary in a
 * few spots (e.g. any gradebook mutation invalidates the grade query) but the
 * data is tiny and this is far less error-prone than trying to keep every
 * cache in sync by hand.
 */

// --- query keys ------------------------------------------------------------

const categoriesKey = (slug: string) => ["categories", slug] as const;
const scaleKey = (slug: string) => ["grading-scale", slug] as const;
const assignmentsKey = (slug: string) => ["assignments", slug] as const;
const entriesKey = (slug: string) => ["gradebook-entries", slug] as const;
const hostsKey = (slug: string) => ["office-hour-hosts", slug] as const;
const hoursKey = (slug: string) => ["office-hours", slug] as const;
const notesKey = (slug: string) => ["notes", slug] as const;
const materialsKey = (slug: string) => ["materials", slug] as const;
const gradeKey = (slug: string) => ["grade", slug] as const;

// After any grade-affecting mutation, invalidate the queries that depend
// on the entries + categories + scale.
function invalidateGradeGraph(qc: ReturnType<typeof useQueryClient>, slug: string) {
  qc.invalidateQueries({ queryKey: entriesKey(slug) });
  qc.invalidateQueries({ queryKey: gradeKey(slug) });
}

// --- categories -----------------------------------------------------------

export function useCategories(slug: string | null) {
  return useQuery({
    queryKey: categoriesKey(slug ?? ""),
    queryFn: () => apiRequest<GradeCategory[]>(`/courses/${slug}/categories`),
    enabled: !!slug,
  });
}

export function useCreateCategory(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GradeCategoryCreatePayload) =>
      apiRequest<GradeCategory>(`/courses/${slug}/categories`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey(slug) });
      qc.invalidateQueries({ queryKey: gradeKey(slug) });
    },
  });
}

export function useUpdateCategory(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: GradeCategoryUpdatePayload;
    }) =>
      apiRequest<GradeCategory>(`/courses/${slug}/categories/${id}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey(slug) });
      qc.invalidateQueries({ queryKey: gradeKey(slug) });
    },
  });
}

export function useDeleteCategory(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/courses/${slug}/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey(slug) });
      invalidateGradeGraph(qc, slug);
    },
  });
}

// --- grading scale --------------------------------------------------------

export function useGradingScale(slug: string | null) {
  return useQuery({
    queryKey: scaleKey(slug ?? ""),
    queryFn: () => apiRequest<GradeScaleBand[]>(`/courses/${slug}/grading-scale`),
    enabled: !!slug,
  });
}

export function useReplaceGradingScale(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bands: GradeScaleBandInput[]) =>
      apiRequest<GradeScaleBand[]>(`/courses/${slug}/grading-scale`, {
        method: "PUT",
        body: { bands },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scaleKey(slug) });
      qc.invalidateQueries({ queryKey: gradeKey(slug) });
    },
  });
}

// --- assignments ----------------------------------------------------------

export function useAssignments(slug: string | null) {
  return useQuery({
    queryKey: assignmentsKey(slug ?? ""),
    queryFn: () => apiRequest<Assignment[]>(`/courses/${slug}/assignments`),
    enabled: !!slug,
  });
}

export function useCreateAssignment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignmentCreatePayload) =>
      apiRequest<Assignment>(`/courses/${slug}/assignments`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: assignmentsKey(slug) }),
  });
}

export function useUpdateAssignment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignmentSlug,
      payload,
    }: {
      assignmentSlug: string;
      payload: AssignmentUpdatePayload;
    }) =>
      apiRequest<Assignment>(`/courses/${slug}/assignments/${assignmentSlug}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: assignmentsKey(slug) }),
  });
}

export function useDeleteAssignment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignmentSlug,
      cascadeGradebook,
    }: {
      assignmentSlug: string;
      cascadeGradebook: boolean;
    }) => {
      const query = cascadeGradebook ? "?cascade_gradebook=true" : "";
      return apiRequest<void>(
        `/courses/${slug}/assignments/${assignmentSlug}${query}`,
        { method: "DELETE" },
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: assignmentsKey(slug) });
      if (vars.cascadeGradebook) invalidateGradeGraph(qc, slug);
    },
  });
}

// --- gradebook entries ----------------------------------------------------

export function useGradebookEntries(slug: string | null) {
  return useQuery({
    queryKey: entriesKey(slug ?? ""),
    queryFn: () =>
      apiRequest<GradebookEntry[]>(`/courses/${slug}/gradebook-entries`),
    enabled: !!slug,
  });
}

export function useCreateGradebookEntry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GradebookEntryCreatePayload) =>
      apiRequest<GradebookEntry>(`/courses/${slug}/gradebook-entries`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => invalidateGradeGraph(qc, slug),
  });
}

export function useUpdateGradebookEntry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entrySlug,
      payload,
    }: {
      entrySlug: string;
      payload: GradebookEntryUpdatePayload;
    }) =>
      apiRequest<GradebookEntry>(
        `/courses/${slug}/gradebook-entries/${entrySlug}`,
        { method: "PATCH", body: payload },
      ),
    onSuccess: () => invalidateGradeGraph(qc, slug),
  });
}

export function useDeleteGradebookEntry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entrySlug: string) =>
      apiRequest<void>(`/courses/${slug}/gradebook-entries/${entrySlug}`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateGradeGraph(qc, slug),
  });
}

// --- office-hour hosts ----------------------------------------------------

export function useOfficeHourHosts(slug: string | null) {
  return useQuery({
    queryKey: hostsKey(slug ?? ""),
    queryFn: () =>
      apiRequest<OfficeHourHost[]>(`/courses/${slug}/office-hour-hosts`),
    enabled: !!slug,
  });
}

export function useCreateOfficeHourHost(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OfficeHourHostCreatePayload) =>
      apiRequest<OfficeHourHost>(`/courses/${slug}/office-hour-hosts`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hostsKey(slug) });
      qc.invalidateQueries({ queryKey: hoursKey(slug) });
    },
  });
}

export function useUpdateOfficeHourHost(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: OfficeHourHostUpdatePayload;
    }) =>
      apiRequest<OfficeHourHost>(`/courses/${slug}/office-hour-hosts/${id}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hostsKey(slug) });
      qc.invalidateQueries({ queryKey: hoursKey(slug) });
    },
  });
}

export function useDeleteOfficeHourHost(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/courses/${slug}/office-hour-hosts/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hostsKey(slug) });
      qc.invalidateQueries({ queryKey: hoursKey(slug) });
    },
  });
}

// --- office hours ---------------------------------------------------------

export function useOfficeHours(slug: string | null) {
  return useQuery({
    queryKey: hoursKey(slug ?? ""),
    queryFn: () => apiRequest<OfficeHour[]>(`/courses/${slug}/office-hours`),
    enabled: !!slug,
  });
}

export function useCreateOfficeHour(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OfficeHourCreatePayload) =>
      apiRequest<OfficeHour>(`/courses/${slug}/office-hours`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hoursKey(slug) }),
  });
}

export function useUpdateOfficeHour(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: OfficeHourUpdatePayload;
    }) =>
      apiRequest<OfficeHour>(`/courses/${slug}/office-hours/${id}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hoursKey(slug) }),
  });
}

export function useDeleteOfficeHour(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/courses/${slug}/office-hours/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hoursKey(slug) }),
  });
}

// --- notes ----------------------------------------------------------------

export function useNotes(slug: string | null) {
  return useQuery({
    queryKey: notesKey(slug ?? ""),
    queryFn: () => apiRequest<CourseNote[]>(`/courses/${slug}/notes`),
    enabled: !!slug,
  });
}

export function useCreateNote(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CourseNoteCreatePayload) =>
      apiRequest<CourseNote>(`/courses/${slug}/notes`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(slug) }),
  });
}

export function useUpdateNote(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CourseNoteUpdatePayload }) =>
      apiRequest<CourseNote>(`/courses/${slug}/notes/${id}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(slug) }),
  });
}

export function useDeleteNote(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/courses/${slug}/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(slug) }),
  });
}

// --- materials ------------------------------------------------------------

export function useMaterials(slug: string | null) {
  return useQuery({
    queryKey: materialsKey(slug ?? ""),
    queryFn: () => apiRequest<CourseMaterial[]>(`/courses/${slug}/materials`),
    enabled: !!slug,
  });
}

export function useCreateMaterial(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CourseMaterialCreatePayload) =>
      apiRequest<CourseMaterial>(`/courses/${slug}/materials`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialsKey(slug) }),
  });
}

export function useUpdateMaterial(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: CourseMaterialUpdatePayload;
    }) =>
      apiRequest<CourseMaterial>(`/courses/${slug}/materials/${id}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialsKey(slug) }),
  });
}

export function useDeleteMaterial(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/courses/${slug}/materials/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialsKey(slug) }),
  });
}

// --- grade + prediction ---------------------------------------------------

export function useCurrentGrade(slug: string | null) {
  return useQuery({
    queryKey: gradeKey(slug ?? ""),
    queryFn: () => apiRequest<CurrentGrade>(`/courses/${slug}/grade`),
    enabled: !!slug,
  });
}

export function usePredict(slug: string) {
  return useMutation({
    mutationFn: (query: string) =>
      apiRequest<PredictResponse>(`/courses/${slug}/predict`, {
        method: "POST",
        body: { query },
      }),
  });
}
