import type { MediaItem, MediaType } from "@/types/media";

type ProfilePayload = {
  creators: string[];
  keywords: string[];
};

const KEYWORD_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "official",
  "video",
  "music",
  "song",
  "songs",
  "feat",
  "ft",
  "by",
  "new",
  "latest",
  "full",
  "hd",
  "mix",
  "live",
  "lyrics",
  "audio",
]);

const sanitizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const profileKey = (mode: MediaType): string => `adfrio_interest_profile_${mode}`;

const readProfile = (mode: MediaType): ProfilePayload => {
  if (typeof window === "undefined") return { creators: [], keywords: [] };
  try {
    const raw = localStorage.getItem(profileKey(mode));
    if (!raw) return { creators: [], keywords: [] };
    const parsed = JSON.parse(raw) as ProfilePayload;
    return {
      creators: Array.isArray(parsed.creators) ? parsed.creators.slice(0, 40) : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 80) : [],
    };
  } catch {
    return { creators: [], keywords: [] };
  }
};

const writeProfile = (mode: MediaType, payload: ProfilePayload): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(profileKey(mode), JSON.stringify(payload));
};

const toKeywordTokens = (value: string): string[] =>
  sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !KEYWORD_STOPWORDS.has(token));

export const trackRecommendationInterest = (item: MediaItem): void => {
  const mode = item.type;
  const existing = readProfile(mode);
  const creator = sanitizeText(item.creator);
  const titleTokens = toKeywordTokens(item.title).slice(0, 5);

  const nextCreators = [creator, ...existing.creators.filter((entry) => entry !== creator)]
    .filter(Boolean)
    .slice(0, 24);
  const nextKeywords = [...titleTokens, ...existing.keywords.filter((entry) => !titleTokens.includes(entry))]
    .filter(Boolean)
    .slice(0, 48);

  writeProfile(mode, {
    creators: nextCreators,
    keywords: nextKeywords,
  });
};

export const getRecommendationSeeds = (
  mode: MediaType,
  language: string,
  fallbackItems: MediaItem[]
): string[] => {
  const existing = readProfile(mode);
  const fallbackKeywords = fallbackItems
    .flatMap((item) => [item.creator, ...toKeywordTokens(item.title).slice(0, 2)])
    .filter(Boolean)
    .slice(0, 20);

  const merged = [...existing.creators, ...existing.keywords, ...fallbackKeywords]
    .map((entry) => sanitizeText(entry))
    .filter((entry) => entry.length >= 2);

  const unique = Array.from(new Set(merged)).slice(0, 8);
  if (unique.length === 0) {
    return [`${language} ${mode === "music" ? "songs" : "videos"}`];
  }
  return unique;
};
