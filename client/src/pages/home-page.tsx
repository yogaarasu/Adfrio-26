import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { mediaApi, playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { MediaCard } from "@/components/media/media-card";
import { Button } from "@/components/ui/button";
import { useInfiniteTrigger } from "@/hooks/use-infinite-trigger";
import { useRealtimeConnection } from "@/hooks/use-realtime-connection";
import { filterSafeVideos, filterStrictSongs, dedupeMediaItems } from "@/lib/media-filters";
import type { MediaItem } from "@/types/media";

type SearchResponse = {
  items: MediaItem[];
  nextPageToken: string | null;
};

export const HomePage = () => {
  const mode = usePreferencesStore((state) => state.mode);
  const language = usePreferencesStore((state) => state.language);

  const [refreshSeed, setRefreshSeed] = useState(() => Math.floor(Date.now() + Math.random() * 100000));
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [realtimeProgressText, setRealtimeProgressText] = useState<string | null>(null);
  const [cachedFeedItems, setCachedFeedItems] = useState<MediaItem[]>([]);
  const [refreshExcludeIds, setRefreshExcludeIds] = useState<string[]>([]);
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
  const cacheKey = `adfrio_home_cache_${mode}_${language}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) {
        setCachedFeedItems([]);
        return;
      }
      const parsed = JSON.parse(raw) as { ts: number; items: MediaItem[] };
      const age = Date.now() - Number(parsed?.ts ?? 0);
      if (!Array.isArray(parsed?.items) || age > 8 * 60 * 1000) {
        setCachedFeedItems([]);
        return;
      }
      setCachedFeedItems(dedupeMediaItems(parsed.items));
    } catch {
      setCachedFeedItems([]);
    }
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
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      mediaApi.homeFeed({
        mode,
        language,
        pageToken: (pageParam as string) || undefined,
        sessionSeed: refreshSeed,
        realtimeId: connectionId ?? undefined,
      }),
    getNextPageParam: (lastPage: SearchResponse) => lastPage.nextPageToken ?? undefined,
    staleTime: 45_000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = homeFeed;

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
    if (feedItems.length >= 18) return;
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [feedItems.length, fetchNextPage, hasNextPage, homeFeed.isLoading, isFetchingNextPage]);

  useEffect(() => {
    if (feedItems.length === 0 || typeof window === "undefined") return;
    const compact = dedupeMediaItems(feedItems).slice(0, 36);
    sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items: compact }));
    setCachedFeedItems(compact);
  }, [cacheKey, feedItems]);

  const visibleItems = feedItems.length > 0 ? feedItems : cachedFeedItems;

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
      if (pageBottom - viewportBottom <= 900) {
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

  const ensureFavoritesPlaylist = useCallback(async () => {
    const playlists = await playlistApi.list();
    let playlist = playlists.find((entry) => entry.name.toLowerCase() === "favorites");
    if (!playlist) {
      await playlistApi.create("Favorites", "Auto-generated favorites playlist");
      const refreshed = await playlistApi.list();
      playlist = refreshed.find((entry) => entry.name.toLowerCase() === "favorites");
    }
    return playlist ?? null;
  }, []);

  const addToFavorites = useCallback(
    async (item: MediaItem) => {
      setActionMessage(null);
      try {
        const favorites = await ensureFavoritesPlaylist();
        if (!favorites) return;
        await playlistApi.addItem(favorites._id, {
          mediaId: item.id,
          mediaType: item.type,
          title: item.title,
          creator: item.creator,
          artwork: item.thumbnail,
          duration: item.duration,
        });
        setActionMessage(`${item.type === "music" ? "Song" : "Video"} added to Favorites`);
      } catch {
        setActionMessage("Sign in to save favorites");
      }
    },
    [ensureFavoritesPlaylist]
  );

  const playMedia = useCallback(
    async (item: MediaItem, queue: MediaItem[]) => {
      setActionMessage(null);
      setLoadingItemId(item.id);

      try {
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
        setActionMessage("Playback failed. Please try another item.");
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
        {realtimeProgressText ? (
          <p className="text-xs text-cyan-700 dark:text-cyan-200/90">{realtimeProgressText}</p>
        ) : null}
      </header>

      {actionMessage ? (
        <p className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
          {actionMessage}
        </p>
      ) : null}

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
              onAdd={addToFavorites}
              isLoading={loadingItemId === item.id}
              isCurrentTrack={current?.id === item.id}
              isCurrentPlaying={current?.id === item.id && playing}
            />
          ))}
        </div>
        {mode === "music" && visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pure songs found right now.</p>
        ) : null}
        <div ref={loaderRef} className="h-3" />
      </section>

      {(homeFeed.isLoading || homeFeed.isFetchingNextPage) && visibleItems.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      )}
    </section>
  );
};
