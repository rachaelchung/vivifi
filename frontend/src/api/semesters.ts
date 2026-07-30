import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/api/client";
import type { Semester, SemesterCreatePayload, SemesterUpdatePayload } from "@/api/types";

const semestersKey = ["semesters"] as const;

export function useSemesters(enabled = true) {
  return useQuery({
    queryKey: semestersKey,
    queryFn: () => apiRequest<Semester[]>("/semesters"),
    enabled,
  });
}

export function useCreateSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SemesterCreatePayload) =>
      apiRequest<Semester>("/semesters", { method: "POST", body: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: semestersKey }),
  });
}

export function useUpdateSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: SemesterUpdatePayload }) =>
      apiRequest<Semester>(`/semesters/${slug}`, { method: "PATCH", body: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: semestersKey }),
  });
}

export function useDeleteSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => apiRequest<void>(`/semesters/${slug}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: semestersKey });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}
