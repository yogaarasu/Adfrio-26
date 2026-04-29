import type { MediaType } from "@/types/media";

export type DiscoveryFilterOption = {
  id: string;
  label: string;
  keywords: string[];
  query?: string;
};

export const SONG_DISCOVERY_FILTERS: DiscoveryFilterOption[] = [
  { id: "all", label: "All", keywords: [] },
  {
    id: "trending",
    label: "Trending",
    keywords: ["trending", "top", "viral", "hits"],
    query: "trending top hit songs",
  },
  {
    id: "vijay-hits",
    label: "Vijay Hits",
    keywords: ["vijay", "thalapathy"],
    query: "vijay hit songs",
  },
  {
    id: "romance",
    label: "Romance",
    keywords: ["romance", "romantic", "love", "melody"],
    query: "romantic love songs",
  },
  {
    id: "happy-vibes",
    label: "Happy Vibes",
    keywords: ["happy", "feel good", "celebration", "dance"],
    query: "happy feel good songs",
  },
  {
    id: "anirudh-hits",
    label: "Anirudh Hits",
    keywords: ["anirudh", "anirudh ravichander"],
    query: "anirudh hit songs",
  },
  {
    id: "ar-rahman",
    label: "AR Rahman",
    keywords: ["a r rahman", "ar rahman", "arr", "rahman"],
    query: "ar rahman hit songs",
  },
  {
    id: "yuvan-hits",
    label: "Yuvan Hits",
    keywords: ["yuvan", "yuvan shankar raja"],
    query: "yuvan hit songs",
  },
];

export const VIDEO_DISCOVERY_FILTERS: DiscoveryFilterOption[] = [
  { id: "all", label: "All", keywords: [] },
  {
    id: "movies",
    label: "Movies",
    keywords: ["movie", "movies", "movie scene", "film", "film scene", "cinema"],
    query: "movies film scenes",
  },
  {
    id: "entertainment",
    label: "Entertainment",
    keywords: ["entertainment", "show", "interview", "reality"],
    query: "entertainment shows",
  },
  {
    id: "news",
    label: "News",
    keywords: ["news", "breaking", "headline", "update"],
    query: "latest breaking news",
  },
  {
    id: "music",
    label: "Music",
    keywords: ["music", "song", "audio", "lyrical"],
    query: "music videos songs",
  },
  {
    id: "live",
    label: "Live",
    keywords: ["live", "stream", "livestream", "concert"],
    query: "live stream videos",
  },
  {
    id: "comedy",
    label: "Comedy",
    keywords: ["comedy", "funny", "jokes", "standup"],
    query: "funny comedy videos",
  },
];

export const getDiscoveryFilters = (mode: MediaType): DiscoveryFilterOption[] =>
  mode === "music" ? SONG_DISCOVERY_FILTERS : VIDEO_DISCOVERY_FILTERS;

export const resolveFilterQuery = (mode: MediaType, filterId: string | null): string => {
  if (!filterId || filterId === "all") return "";
  const source = getDiscoveryFilters(mode);
  const selected = source.find((entry) => entry.id === filterId);
  if (!selected) return "";
  if (selected.query) return selected.query;
  return `${selected.label} ${selected.keywords.slice(0, 2).join(" ")}`.trim();
};

const normalizeFilterText = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();

const tokenize = (value: string): Set<string> =>
  new Set(normalizeFilterText(value).split(" ").filter(Boolean));

const compileLookupKeywords = (selected: DiscoveryFilterOption): string[] =>
  [selected.label, ...selected.keywords]
    .map(normalizeFilterText)
    .filter(Boolean);

export const createDiscoveryMatcher = (
  mode: MediaType,
  filterId: string | null
): ((text: string) => boolean) => {
  if (!filterId || filterId === "all") {
    return () => true;
  }

  const source = getDiscoveryFilters(mode);
  const selected = source.find((entry) => entry.id === filterId);
  if (!selected) {
    return () => true;
  }

  const lookup = compileLookupKeywords(selected);

  return (text: string) => {
    const normalized = normalizeFilterText(text);
    const tokens = tokenize(text);

    if (mode === "video" && filterId === "movies") {
      const hasMovieIntent =
        tokens.has("movie") ||
        tokens.has("movies") ||
        tokens.has("film") ||
        tokens.has("cinema");
      const hasSceneIntent =
        tokens.has("scene") ||
        tokens.has("scenes") ||
        tokens.has("clip") ||
        tokens.has("clips") ||
        tokens.has("moment");
      return hasMovieIntent || (hasSceneIntent && (tokens.has("movie") || tokens.has("film")));
    }

    return lookup.some((keyword) =>
      keyword.includes(" ") ? normalized.includes(keyword) : tokens.has(keyword)
    );
  };
};

export const matchesDiscoveryFilter = (
  text: string,
  mode: MediaType,
  filterId: string | null
): boolean => {
  return createDiscoveryMatcher(mode, filterId)(text);
};
