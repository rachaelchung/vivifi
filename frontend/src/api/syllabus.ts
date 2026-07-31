import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest, apiUpload } from "@/api/client";
import type { SyllabusExtractResponse, SyllabusExtraction } from "@/api/types";

export function useUploadSyllabusPdf(courseSlug: string) {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<SyllabusExtractResponse>(
        `/courses/${courseSlug}/syllabus`,
        form,
      );
    },
  });
}

export function useUploadSyllabusText(courseSlug: string) {
  return useMutation({
    mutationFn: async (text: string) =>
      apiRequest<SyllabusExtractResponse>(`/courses/${courseSlug}/syllabus/text`, {
        method: "POST",
        body: { text },
      }),
  });
}

export function useCommitSyllabus(courseSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (extraction: SyllabusExtraction) =>
      apiRequest<{ slug: string; status: string }>(
        `/courses/${courseSlug}/syllabus/commit`,
        { method: "POST", body: extraction },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["course", courseSlug] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}
