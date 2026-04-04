import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { mediaApi } from "@/services/api";
import type { MediaType } from "@/types/media";

const DISCOVERY_KEYWORDS = [
  "Lo-fi beats", "Chillhop", "Deep House", "Synthwave",
  "Acoustic covers", "Jazz study", "Classical piano", "Epic cinematic",
  "Nature sounds", "Techno 2024", "Reggae vibes", "Pop hits",
  "Rock classics", "Gaming music", "Indie pop", "Soulful R&B"
];

/** Pick a random keyword each session for variety */
const sessionKeyword = DISCOVERY_KEYWORDS[Math.floor(Math.random() * DISCOVERY_KEYWORDS.length)];

export const useMediaSearch = (query: string, type: MediaType) => {
  // Empty query = discovery mode — use a random keyword so results always vary
  const effectiveQuery = query.trim() || sessionKeyword;

  const result = useInfiniteQuery({
    queryKey: ["search", type, effectiveQuery],
    enabled: true,
    staleTime: 3 * 60 * 1000,      // 3 min — avoid re-fetching the same page needlessly
    gcTime: 15 * 60 * 1000,         // 15 min — keep pages in cache across tabs
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      mediaApi.search(effectiveQuery, type, (pageParam as string) || undefined),
    getNextPageParam: (lastPage) => lastPage.nextPageToken ?? undefined,
    // Prefetch next page before user scrolls to the trigger
    placeholderData: (prev) => prev,
  });

  /** Call this to eagerly prefetch the next page while the current page is still loading */
  const prefetchNext = useCallback(() => {
    if (result.hasNextPage && !result.isFetchingNextPage) {
      void result.fetchNextPage();
    }
  }, [result]);

  return { ...result, prefetchNext };
};
