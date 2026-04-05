import type { AppLanguage } from "@/store/preferences-store";
import type { MediaType } from "@/types/media";

export const buildLanguageQuery = (
  query: string,
  language: AppLanguage,
  type: MediaType
): string => {
  const cleaned = query.trim();
  const suffix = type === "music" ? "songs music official" : "videos";
  return cleaned.length > 0 ? `${cleaned} ${language}` : `${language} trending ${suffix}`;
};
