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
import { filterStrictSongs, dedupeMediaItems } from "@/lib/media-filters";
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
  const seenSongIdsRef = useRef<Set<string>>(new Set());
  const progressClearTimerRef = useRef<number | null>(null);
  const { connectionId, lastMessage } = useRealtimeConnection();

  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const updateVideoSession = usePlayerStore((state) => state.updateVideoSession);
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);

  useEffect(() => {
    setRealtimeProgressText(null);
    if (progressClearTimerRef.current !== null) {
      window.clearTimeout(progressClearTimerRef.current);
      progressClearTimerRef.current = null;
    }
  }, [language, mode, refreshSeed]);

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
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = homeFeed;

  const feedItems = useMemo(() => {
    const merged = dedupeMediaItems((homeFeed.data?.pages ?? []).flatMap((page) => page.items));
    if (mode === "music") {
      const strictSongs = filterStrictSongs(merged);
      const unseenSongs = strictSongs.filter((item) => !seenSongIdsRef.current.has(item.id));
      const songsPool = unseenSongs.length >= 30 ? unseenSongs : strictSongs;
      return songsPool;
    }
    return merged;
  }, [homeFeed.data?.pages, mode]);

  useEffect(() => {
    if (mode !== "music") return;
    try {
      const raw = sessionStorage.getItem("adfrio_seen_song_ids");
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      seenSongIdsRef.current = new Set(parsed.slice(-800));
    } catch {
      seenSongIdsRef.current = new Set();
    }
  }, [mode]);

  useEffect(() => {
    if (homeFeed.isLoading) return;
    if (feedItems.length >= 18) return;
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [feedItems.length, fetchNextPage, hasNextPage, homeFeed.isLoading, isFetchingNextPage]);

  const visibleItems = feedItems;

  useEffect(() => {
    if (mode !== "music" || visibleItems.length === 0) return;
    const next = new Set(seenSongIdsRef.current);
    visibleItems.forEach((item) => next.add(item.id));
    const trimmed = Array.from(next).slice(-800);
    seenSongIdsRef.current = new Set(trimmed);
    sessionStorage.setItem("adfrio_seen_song_ids", JSON.stringify(trimmed));
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

        playVideo(item, [], []);
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
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">
            {mode === "music" ? "Songs Home" : "Videos Home"}
          </h1>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRefreshSeed(Math.floor(Date.now() + Math.random() * 100000))}
            aria-label="Refresh home feed"
          >
            <RefreshCw className={`h-4 w-4 ${homeFeed.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <p className="text-sm text-white/60">
          {mode === "music" ? `Fresh ${language} songs only` : `Fresh ${language} trending videos`}
        </p>
        {realtimeProgressText ? <p className="text-xs text-cyan-200/90">{realtimeProgressText}</p> : null}
      </header>

      {actionMessage ? (
        <p className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/80">
          {actionMessage}
        </p>
      ) : null}

      {homeFeed.isError ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Could not refresh home feed right now.
        </p>
      ) : null}

      <section className="space-y-4">
        {mode === "video" ? (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-white/80">Trending Videos</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-white/85">
                Entertainment
              </span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-white/85">
                Important
              </span>
            </div>
          </div>
        ) : null}
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
          <p className="text-sm text-white/60">No pure songs found right now.</p>
        ) : null}
        <div ref={loaderRef} className="h-3" />
      </section>

      {(homeFeed.isLoading || homeFeed.isFetchingNextPage) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      )}
    </section>
  );
};
