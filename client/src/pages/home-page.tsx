import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { mediaApi, playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { MediaCard } from "@/components/media/media-card";
import { useScrollThreshold } from "@/hooks/use-scroll-threshold";
import { filterStrictSongs, dedupeMediaItems } from "@/lib/media-filters";
import { buildLanguageQuery } from "@/lib/media-query";
import type { MediaItem } from "@/types/media";

type SearchResponse = {
  items: MediaItem[];
  nextPageToken: string | null;
};

const MUSIC_DISCOVERY_SEEDS = [
  "trending hit songs",
  "all time favorite songs",
  "top chart songs",
  "latest songs mix",
  "popular songs tamil",
  "viral songs music"
];

const VIDEO_DISCOVERY_SEEDS = [
  "viral now",
  "trending now",
  "must watch",
  "popular clips",
  "latest uploads",
  "top videos"
];

export const HomePage = () => {
  const mode = usePreferencesStore((state) => state.mode);
  const language = usePreferencesStore((state) => state.language);

  const [refreshSeed] = useState(() => Math.floor(Date.now() + Math.random() * 100000));
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const seenSongIdsRef = useRef<Set<string>>(new Set());

  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const updateVideoSession = usePlayerStore((state) => state.updateVideoSession);

  const discoverySeed = useMemo(() => {
    const list = mode === "music" ? MUSIC_DISCOVERY_SEEDS : VIDEO_DISCOVERY_SEEDS;
    return list[refreshSeed % list.length];
  }, [mode, refreshSeed]);

  const homeFeed = useInfiniteQuery({
    queryKey: ["home-feed", mode, language, refreshSeed, discoverySeed],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      mediaApi.search(
        buildLanguageQuery(discoverySeed, language, mode),
        mode,
        (pageParam as string) || undefined
      ),
    getNextPageParam: (lastPage: SearchResponse) => lastPage.nextPageToken ?? undefined
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = homeFeed;

  const feedItems = useMemo(() => {
    const merged = dedupeMediaItems((homeFeed.data?.pages ?? []).flatMap((page) => page.items));
    if (mode === "music") {
      const strictSongs = filterStrictSongs(merged);
      const unseenSongs = strictSongs.filter((item) => !seenSongIdsRef.current.has(item.id));
      const songsPool = unseenSongs.length >= 30 ? unseenSongs : strictSongs;
      return songsPool.slice(0, 160);
    }
    return merged.slice(0, 160);
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
    setVisibleCount(20);
  }, [mode, language, refreshSeed, discoverySeed]);

  useEffect(() => {
    if (visibleCount <= feedItems.length) return;
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, feedItems.length, hasNextPage, isFetchingNextPage, visibleCount]);

  useEffect(() => {
    if (homeFeed.isLoading) return;
    if (feedItems.length >= 20) return;
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [feedItems.length, fetchNextPage, hasNextPage, homeFeed.isLoading, isFetchingNextPage]);

  const visibleItems = useMemo(() => feedItems.slice(0, visibleCount), [feedItems, visibleCount]);

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
    setVisibleCount((prev) => prev + 20);
  }, []);

  useScrollThreshold(triggerLoadMore, 0.8);

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
          duration: item.duration
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
              likes: stream.likes ?? null
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
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">
          {mode === "music" ? "Songs Home" : "Videos Home"}
        </h1>
        <p className="text-sm text-white/60">
          {mode === "music"
            ? `Fresh ${language} songs only`
            : `Fresh ${language} trending videos`}
        </p>
      </header>

      {actionMessage ? (
        <p className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/80">
          {actionMessage}
        </p>
      ) : null}

      <section className="space-y-4">
        {mode === "video" ? (
          <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-white/80">Trending Videos</h2>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onPlay={(entry) => playMedia(entry, visibleItems)}
              onAdd={addToFavorites}
              isLoading={loadingItemId === item.id}
            />
          ))}
        </div>
        {mode === "music" && visibleItems.length === 0 ? (
          <p className="text-sm text-white/60">No pure songs found right now.</p>
        ) : null}
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
