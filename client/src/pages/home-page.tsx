import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { mediaApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { MediaCard } from "@/components/media/media-card";
import { AddToPlaylistSheet } from "@/components/playlist/add-to-playlist-sheet";
import { Button } from "@/components/ui/button";
import { useInfiniteTrigger } from "@/hooks/use-infinite-trigger";
import { useRealtimeConnection } from "@/hooks/use-realtime-connection";
import { createDiscoveryMatcher, getDiscoveryFilters } from "@/lib/discovery-filters";
import { filterSafeVideos, filterStrictSongs, dedupeMediaItems } from "@/lib/media-filters";
import { getRecommendationSeeds, trackRecommendationInterest } from "@/lib/recommendation-profile";
import type { MediaItem } from "@/types/media";

type SearchResponse = {
  items: MediaItem[];
  nextPageToken: string | null;
};

const readCachedFeed = (cacheKey: string): MediaItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: MediaItem[] };
    if (!Array.isArray(parsed?.items)) return [];
    return dedupeMediaItems(parsed.items);
  } catch {
    return [];
  }
};

export const HomePage = () => {
  const mode = usePreferencesStore((state) => state.mode);
  const language = usePreferencesStore((state) => state.language);
  const cacheKey = `adfrio_home_cache_${mode}_${language}`;
  const filters = useMemo(() => getDiscoveryFilters(mode), [mode]);
  const filterStorageKey = `adfrio_home_filter_${mode}`;
  const readStoredFilter = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    const stored = sessionStorage.getItem(filterStorageKey);
    if (!stored || stored === "all") return null;
    return filters.some((entry) => entry.id === stored) ? stored : null;
  }, [filterStorageKey, filters]);

  const [refreshSeed, setRefreshSeed] = useState(0);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [realtimeProgressText, setRealtimeProgressText] = useState<string | null>(null);
  const [cachedFeedItems, setCachedFeedItems] = useState<MediaItem[]>(() => readCachedFeed(cacheKey));
  const [refreshExcludeIds, setRefreshExcludeIds] = useState<string[]>([]);
  const [playlistSheetOpen, setPlaylistSheetOpen] = useState(false);
  const [playlistTargetItem, setPlaylistTargetItem] = useState<MediaItem | null>(null);
  const [selectedFilterId, setSelectedFilterId] = useState<string | null>(() => readStoredFilter());
  const activeFilterId = useMemo(
    () => (selectedFilterId && selectedFilterId !== "all" ? selectedFilterId : null),
    [selectedFilterId]
  );
  const initialFeedData = useMemo(
    () =>
      cachedFeedItems.length > 0
        ? {
            pages: [{ items: cachedFeedItems, nextPageToken: "1" }],
            pageParams: [""],
          }
        : undefined,
    [cachedFeedItems]
  );
  const historicalSeenSongIdsRef = useRef<Set<string>>(
    new Set(
      (() => {
        if (typeof window === "undefined") return [];
        try {
          const raw = sessionStorage.getItem("adfrio_seen_song_ids");
          if (!raw) return [];
          const parsed = JSON.parse(raw) as string[];
          return parsed.slice(-1200);
        } catch {
          return [];
        }
      })()
    )
  );
  const historicalSeenVideoIdsRef = useRef<Set<string>>(
    new Set(
      (() => {
        if (typeof window === "undefined") return [];
        try {
          const raw = sessionStorage.getItem("adfrio_seen_video_ids");
          if (!raw) return [];
          const parsed = JSON.parse(raw) as string[];
          return parsed.slice(-1200);
        } catch {
          return [];
        }
      })()
    )
  );
  const excludedSongIdsRef = useRef<Set<string>>(new Set(historicalSeenSongIdsRef.current));
  const excludedVideoIdsRef = useRef<Set<string>>(new Set(historicalSeenVideoIdsRef.current));
  const progressClearTimerRef = useRef<number | null>(null);
  const { connectionId, lastMessage } = useRealtimeConnection();

  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const updateVideoSession = usePlayerStore((state) => state.updateVideoSession);
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);

  useEffect(() => {
    setCachedFeedItems(readCachedFeed(cacheKey));
  }, [cacheKey]);

  useEffect(() => {
    setRealtimeProgressText(null);
    if (progressClearTimerRef.current !== null) {
      window.clearTimeout(progressClearTimerRef.current);
      progressClearTimerRef.current = null;
    }
    if (mode === "music") {
      excludedSongIdsRef.current = new Set([
        ...historicalSeenSongIdsRef.current,
        ...refreshExcludeIds,
      ]);
      excludedVideoIdsRef.current = new Set();
      return;
    }

    excludedVideoIdsRef.current = new Set([
      ...historicalSeenVideoIdsRef.current,
      ...refreshExcludeIds,
    ]);
    excludedSongIdsRef.current = new Set();
  }, [language, mode, refreshExcludeIds, refreshSeed]);

  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "home-feed:progress") return;
    if (lastMessage.mode !== mode) return;
    const percent = typeof lastMessage.percent === "number" ? lastMessage.percent : null;
    const text =
      typeof lastMessage.message === "string" ? lastMessage.message : "Updating home feed...";
    setRealtimeProgressText(percent !== null ? `${Math.round(percent)}% - ${text}` : text);
    if (percent !== null && percent >= 100) {
      if (progressClearTimerRef.current !== null) {
        window.clearTimeout(progressClearTimerRef.current);
      }
      progressClearTimerRef.current = window.setTimeout(() => {
        setRealtimeProgressText(null);
        progressClearTimerRef.current = null;
      }, 1200);
    }
  }, [lastMessage, mode]);

  useEffect(
    () => () => {
      if (progressClearTimerRef.current !== null) {
        window.clearTimeout(progressClearTimerRef.current);
      }
    },
    []
  );

  const homeFeed = useInfiniteQuery({
    queryKey: ["home-feed", mode, language, refreshSeed],
    enabled: true,
    initialData: refreshSeed === 0 ? initialFeedData : undefined,
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      mediaApi.homeFeed({
        mode,
        language,
        pageToken: (pageParam as string) || undefined,
        sessionSeed: refreshSeed > 0 ? refreshSeed : undefined,
        realtimeId: connectionId ?? undefined,
        interestSeeds: getRecommendationSeeds(mode, language, cachedFeedItems),
      }),
    getNextPageParam: (lastPage: SearchResponse) => lastPage.nextPageToken ?? undefined,
    placeholderData: (previous) => previous,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = homeFeed;

  useEffect(() => {
    setSelectedFilterId(readStoredFilter());
  }, [readStoredFilter]);

  const feedItems = useMemo(() => {
    const merged = dedupeMediaItems((homeFeed.data?.pages ?? []).flatMap((page) => page.items));
    if (mode === "music") {
      const strictSongs = filterStrictSongs(merged);
      const unseen = strictSongs.filter((item) => !excludedSongIdsRef.current.has(item.id));
      if (unseen.length >= 10) return unseen;
      const seenFallback = strictSongs.filter((item) => excludedSongIdsRef.current.has(item.id));
      return dedupeMediaItems([...unseen, ...seenFallback]);
    }

    const safeVideos = filterSafeVideos(merged);
    const unseenVideos = safeVideos.filter((item) => !excludedVideoIdsRef.current.has(item.id));
    if (unseenVideos.length >= 10) return unseenVideos;
    const seenVideoFallback = safeVideos.filter((item) => excludedVideoIdsRef.current.has(item.id));
    return dedupeMediaItems([...unseenVideos, ...seenVideoFallback]);
  }, [homeFeed.data?.pages, mode, refreshSeed]);

  useEffect(() => {
    if (homeFeed.isLoading) return;
    if (feedItems.length >= 36) return;
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [feedItems.length, fetchNextPage, hasNextPage, homeFeed.isLoading, isFetchingNextPage]);

  useEffect(() => {
    if (feedItems.length === 0 || typeof window === "undefined") return;
    const compact = dedupeMediaItems(feedItems).slice(0, 36);
    sessionStorage.setItem(cacheKey, JSON.stringify({ items: compact }));
    setCachedFeedItems(compact);
  }, [cacheKey, feedItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeFilterId) {
      sessionStorage.removeItem(filterStorageKey);
      return;
    }
    sessionStorage.setItem(filterStorageKey, activeFilterId);
  }, [activeFilterId, filterStorageKey]);

  const filterMatcher = useMemo(
    () => createDiscoveryMatcher(mode, activeFilterId),
    [activeFilterId, mode]
  );

  const sourceItems = useMemo(
    () => (feedItems.length > 0 ? feedItems : cachedFeedItems),
    [cachedFeedItems, feedItems]
  );

  const visibleItems = useMemo(
    () => sourceItems.filter((item) => filterMatcher(`${item.title} ${item.creator}`)),
    [filterMatcher, sourceItems]
  );

  useEffect(() => {
    if (!activeFilterId) return;
    if (visibleItems.length >= 18) return;
    if (!hasNextPage || isFetchingNextPage || homeFeed.isLoading) return;
    void fetchNextPage();
  }, [
    activeFilterId,
    fetchNextPage,
    hasNextPage,
    homeFeed.isLoading,
    isFetchingNextPage,
    visibleItems.length,
  ]);

  const onRefreshHome = useCallback(() => {
    const currentIds = visibleItems.map((item) => item.id);
    setRefreshExcludeIds(currentIds);
    setCachedFeedItems([]);
    setRefreshSeed(Math.floor(Date.now() + Math.random() * 100000));
  }, [visibleItems]);

  useEffect(() => {
    if (visibleItems.length === 0) return;

    if (mode === "music") {
      const next = new Set(historicalSeenSongIdsRef.current);
      let changed = false;
      visibleItems.forEach((item) => {
        if (next.has(item.id)) return;
        next.add(item.id);
        changed = true;
      });
      if (!changed) return;
      const trimmed = Array.from(next).slice(-1200);
      historicalSeenSongIdsRef.current = new Set(trimmed);
      sessionStorage.setItem("adfrio_seen_song_ids", JSON.stringify(trimmed));
      return;
    }

    const next = new Set(historicalSeenVideoIdsRef.current);
    let changed = false;
    visibleItems.forEach((item) => {
      if (next.has(item.id)) return;
      next.add(item.id);
      changed = true;
    });
    if (!changed) return;
    const trimmed = Array.from(next).slice(-1200);
    historicalSeenVideoIdsRef.current = new Set(trimmed);
    sessionStorage.setItem("adfrio_seen_video_ids", JSON.stringify(trimmed));
  }, [mode, visibleItems]);

  useEffect(() => {
    if (mode !== "music" || visibleItems.length === 0) return;
    mediaApi.prefetchStreams(visibleItems.slice(0, 8).map((item) => item.id));
  }, [mode, visibleItems]);

  const triggerLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  const loaderRef = useInfiniteTrigger(triggerLoadMore);

  useEffect(() => {
    const maybeLoadMore = () => {
      if (!hasNextPage || isFetchingNextPage || homeFeed.isLoading) return;
      const viewportBottom = window.scrollY + window.innerHeight;
      const pageBottom = document.documentElement.scrollHeight;
      if (pageBottom - viewportBottom <= 1400) {
        void fetchNextPage();
      }
    };

    maybeLoadMore();
    window.addEventListener("scroll", maybeLoadMore, { passive: true });
    window.addEventListener("resize", maybeLoadMore);
    return () => {
      window.removeEventListener("scroll", maybeLoadMore);
      window.removeEventListener("resize", maybeLoadMore);
    };
  }, [fetchNextPage, hasNextPage, homeFeed.isLoading, isFetchingNextPage, visibleItems.length]);

  const openPlaylistSheet = useCallback((item: MediaItem) => {
    setPlaylistTargetItem(item);
    setPlaylistSheetOpen(true);
  }, []);

  const playMedia = useCallback(
    async (item: MediaItem, queue: MediaItem[]) => {
      setLoadingItemId(item.id);

      try {
        trackRecommendationInterest(item);
        if (item.type === "music") {
          playAudio(
            item,
            { url: `https://www.youtube.com/watch?v=${item.id}`, mimeType: "audio/mpeg" },
            queue
          );
          return;
        }

        const started = playVideo(item, [], []);
        if (!started) return;
        mediaApi
          .streams(item.id)
          .then((stream) => {
            updateVideoSession(item.id, {
              related: stream.related ?? [],
              description: stream.description,
              uploader: stream.uploader,
              uploaderAvatarUrl: stream.uploaderAvatarUrl ?? null,
              likes: stream.likes ?? null,
            });
          })
          .catch(() => undefined);
      } catch {
        toast.error("Playback failed. Please try another item.");
      } finally {
        setLoadingItemId(null);
      }
    },
    [playAudio, playVideo, updateVideoSession]
  );

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-wide">
              {mode === "music" ? "Top Songs" : "Top Videos"}
            </h1>
            <p className="text-xs text-muted-foreground">Fresh picks for you</p>
          </div>
          <Button variant="outline" size="icon" onClick={onRefreshHome} aria-label="Refresh home feed">
            <RefreshCw className={`h-4 w-4 ${homeFeed.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="relative -mx-4 px-4 sm:-mx-6 sm:px-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background/65 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background/65 to-transparent" />
          <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
            {filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setSelectedFilterId(filter.id === "all" ? null : filter.id)}
                className={`shrink-0 rounded-[8px] border px-3 py-1.5 text-xs font-medium ${
                  (activeFilterId ?? "all") === filter.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card/85 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        {realtimeProgressText ? (
          <p className="text-xs text-cyan-700 dark:text-cyan-200/90">{realtimeProgressText}</p>
        ) : null}
      </header>

      {homeFeed.isError ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          Could not refresh home feed right now.
        </p>
      ) : null}

      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onPlay={(entry) => playMedia(entry, visibleItems)}
              onAdd={openPlaylistSheet}
              isLoading={loadingItemId === item.id}
              isCurrentTrack={current?.id === item.id}
              isCurrentPlaying={current?.id === item.id && playing}
            />
          ))}
        </div>
        {mode === "music" && visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pure songs found right now.</p>
        ) : null}
        <div ref={loaderRef} className="h-12" />
      </section>

      {(homeFeed.isLoading || homeFeed.isFetchingNextPage) && visibleItems.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      )}

      <AddToPlaylistSheet
        open={playlistSheetOpen}
        item={playlistTargetItem}
        constrainToPage={false}
        onClose={() => setPlaylistSheetOpen(false)}
      />
    </section>
  );
};
