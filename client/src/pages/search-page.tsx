import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { mediaApi, playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { SearchBox } from "@/components/media/search-box";
import { MediaCard } from "@/components/media/media-card";
import { Card } from "@/components/ui/card";
import { useInfiniteTrigger } from "@/hooks/use-infinite-trigger";
import { useRealtimeConnection } from "@/hooks/use-realtime-connection";
import { buildLanguageQuery } from "@/lib/media-query";
import { dedupeMediaItems, filterStrictSongs } from "@/lib/media-filters";
import type { MediaItem } from "@/types/media";

type SearchResponse = {
  items: MediaItem[];
  nextPageToken: string | null;
  correctedQuery?: string | null;
  appliedQuery?: string | null;
};

export const SearchPage = () => {
  const mode = usePreferencesStore((state) => state.mode);
  const language = usePreferencesStore((state) => state.language);

  const [query, setQuery] = useState("");
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [realtimeProgressText, setRealtimeProgressText] = useState<string | null>(null);
  const progressClearTimerRef = useRef<number | null>(null);

  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const updateVideoSession = usePlayerStore((state) => state.updateVideoSession);
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);
  const { connectionId, lastMessage } = useRealtimeConnection();

  const search = useInfiniteQuery({
    queryKey: ["search-mode", mode, language, query],
    enabled: query.trim().length > 0,
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      mediaApi.search(
        buildLanguageQuery(query, language, mode),
        mode,
        (pageParam as string) || undefined,
        connectionId ?? undefined
      ),
    getNextPageParam: (lastPage: SearchResponse) => lastPage.nextPageToken ?? undefined,
  });

  const items = useMemo(() => {
    const merged = dedupeMediaItems((search.data?.pages ?? []).flatMap((page) => page.items));
    return mode === "music" ? filterStrictSongs(merged) : merged;
  }, [mode, search.data?.pages]);

  const correctedQuery = useMemo(
    () => search.data?.pages?.[0]?.correctedQuery ?? null,
    [search.data?.pages]
  );

  const appliedQuery = useMemo(
    () => search.data?.pages?.[0]?.appliedQuery ?? null,
    [search.data?.pages]
  );

  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "search:progress") return;
    if (lastMessage.mode !== mode) return;
    const percent = typeof lastMessage.percent === "number" ? lastMessage.percent : null;
    const text = typeof lastMessage.message === "string" ? lastMessage.message : "Searching...";
    setRealtimeProgressText(percent !== null ? `${Math.round(percent)}% - ${text}` : text);
    if (percent !== null && percent >= 100) {
      if (progressClearTimerRef.current !== null) {
        window.clearTimeout(progressClearTimerRef.current);
      }
      progressClearTimerRef.current = window.setTimeout(() => {
        setRealtimeProgressText(null);
        progressClearTimerRef.current = null;
      }, 1000);
    }
  }, [lastMessage, mode]);

  useEffect(() => {
    setRealtimeProgressText(null);
    if (progressClearTimerRef.current !== null) {
      window.clearTimeout(progressClearTimerRef.current);
      progressClearTimerRef.current = null;
    }
  }, [mode, language, query]);

  useEffect(
    () => () => {
      if (progressClearTimerRef.current !== null) {
        window.clearTimeout(progressClearTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (mode !== "music" || items.length === 0) return;
    mediaApi.prefetchStreams(items.slice(0, 8).map((item) => item.id));
  }, [items, mode]);

  const loadMore = useCallback(() => {
    if (search.hasNextPage && !search.isFetchingNextPage) {
      void search.fetchNextPage();
    }
  }, [search]);
  const loaderRef = useInfiniteTrigger(loadMore);

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
      setStatusMessage(null);
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
        setStatusMessage(`${item.type === "music" ? "Song" : "Video"} added to Favorites`);
      } catch {
        setStatusMessage("Sign in to save favorites");
      }
    },
    [ensureFavoritesPlaylist]
  );

  const playMedia = useCallback(
    async (item: MediaItem, queue: MediaItem[]) => {
      setLoadingItemId(item.id);
      setStatusMessage(null);

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
        setStatusMessage("Playback failed. Please try another item.");
      } finally {
        setLoadingItemId(null);
      }
    },
    [playAudio, playVideo, updateVideoSession]
  );

  const showEmptyState = query.trim().length === 0;

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">
          {mode === "music" ? "Songs Search" : "Videos Search"}
        </h1>
        <p className="text-sm text-white/60">Type what you want and we will find the best match.</p>
      </header>

      <SearchBox value={query} onChange={setQuery} placeholder={mode === "music" ? "Search songs..." : "Search videos..."} />

      {realtimeProgressText && query.trim().length > 0 ? (
        <p className="text-xs text-cyan-200/90">{realtimeProgressText}</p>
      ) : null}

      {correctedQuery ? (
        <p className="text-xs text-white/60">
          Showing improved results for <span className="font-semibold text-white">{correctedQuery}</span>
        </p>
      ) : null}

      {appliedQuery ? (
        <p className="text-xs text-white/55">
          Interpreted as <span className="font-semibold text-white">{appliedQuery}</span>
        </p>
      ) : null}

      {statusMessage ? (
        <p className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/80">
          {statusMessage}
        </p>
      ) : null}

      {showEmptyState ? (
        <Card>
          <p className="text-sm text-white/70">Start typing to search {mode === "music" ? "songs" : "videos"}.</p>
        </Card>
      ) : null}

      {!showEmptyState ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onPlay={(entry) => playMedia(entry, items)}
                onAdd={addToFavorites}
                isLoading={loadingItemId === item.id}
                isCurrentTrack={current?.id === item.id}
                isCurrentPlaying={current?.id === item.id && playing}
              />
            ))}
          </div>
          <div ref={loaderRef} className="h-3" />
        </>
      ) : null}

      {(search.isLoading || search.isFetchingNextPage) && !showEmptyState ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : null}
    </section>
  );
};
