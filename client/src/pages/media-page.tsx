import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AxiosError } from "axios";
import { mediaApi, playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import type { MediaItem, MediaType } from "@/types/media";
import { pickBestAudioSource, pickPlayableVideoSources } from "@/lib/playback";
import { buildMediaProxyUrl } from "@/lib/proxy-stream-url";
import { SearchBox } from "@/components/media/search-box";
import { MediaCard } from "@/components/media/media-card";
import { useMediaSearch } from "@/hooks/use-media-search";
import { useInfiniteTrigger } from "@/hooks/use-infinite-trigger";

type Props = { type: MediaType };
type ApiErrorResponse = { message?: string };

const toApiMessage = (error: unknown, fallback: string): string => {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError?.response?.data?.message ?? fallback;
};

export const MediaPage = ({ type }: Props) => {
  const [query, setQuery] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const requestTokenRef = useRef(0);
  const playRequestControllerRef = useRef<AbortController | null>(null);

  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  const search = useMediaSearch(query, type);

  // Deduplicate across all pages (pages can return overlapping items from shuffle)
  const items = useMemo(() => {
    const seen = new Set<string>();
    const all: MediaItem[] = [];
    for (const page of search.data?.pages ?? []) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          all.push(item);
        }
      }
    }
    return all;
  }, [search.data?.pages]);

  // Cleanup in-flight request on unmount
  useEffect(
    () => () => { playRequestControllerRef.current?.abort(); },
    []
  );

  // Prefetch stream info for the first visible items
  useEffect(() => {
    const topIds = items.slice(0, 6).map((item) => item.id);
    mediaApi.prefetchStreams(topIds);
  }, [items]);

  // Stable infinite scroll trigger
  const triggerNextPage = useCallback(() => {
    if (search.hasNextPage && !search.isFetchingNextPage) {
      void search.fetchNextPage();
    }
  }, [search]);

  const loaderRef = useInfiniteTrigger(triggerNextPage);

  // ------------------------------------------------------------------
  // Play handler
  // ------------------------------------------------------------------
  const onPlay = async (item: MediaItem) => {
    if (loadingItemId === item.id) return;

    setActionMessage(null);
    setLoadingItemId(item.id);

    playRequestControllerRef.current?.abort();
    const controller = new AbortController();
    playRequestControllerRef.current = controller;

    const token = ++requestTokenRef.current;

    try {
      let stream = await mediaApi.streams(item.id, { signal: controller.signal });

      const hasMusicSource = Boolean(pickBestAudioSource(stream)?.url);
      const hasVideoSource =
        pickPlayableVideoSources(
          stream.video.map((e) => ({ url: e.url, quality: e.quality, format: e.format }))
        ).length > 0;

      const shouldRefresh =
        Boolean(stream.unavailableReason) ||
        (item.type === "music" && !hasMusicSource) ||
        (item.type === "video" && !hasVideoSource);

      if (shouldRefresh && !controller.signal.aborted) {
        stream = await mediaApi.streams(item.id, { forceRefresh: true, signal: controller.signal });
      }

      if (token !== requestTokenRef.current || controller.signal.aborted) return;

      if (stream.unavailableReason) {
        setActionMessage(stream.unavailableReason);
        return;
      }

      if (item.type === "music") {
        const bestAudio = pickBestAudioSource(stream);
        if (!bestAudio?.url) {
          setActionMessage("Audio stream unavailable for this item.");
          return;
        }
        playAudio(
          item,
          { url: buildMediaProxyUrl(item.id, "audio"), mimeType: bestAudio.mimeType },
          items
        );
        return;
      }

      // Video
      setPlaying(false);
      const rawSources = pickPlayableVideoSources(
        stream.video.map((e) => ({ url: e.url, quality: e.quality, format: e.format }))
      );

      if (rawSources.length === 0) {
        setActionMessage("Video stream unavailable for this item.");
        return;
      }

      const proxiedSources = rawSources.map((e) => ({
        url: buildMediaProxyUrl(item.id, "video", e.quality),
        quality: e.quality,
        format: e.format
      }));

      playVideo(item, proxiedSources, stream.related ?? []);
    } catch (error) {
      if (token !== requestTokenRef.current) return;
      if (mediaApi.isCanceledError(error)) return;
      setActionMessage(toApiMessage(error, "Playback failed. Please try another item."));
    } finally {
      if (token === requestTokenRef.current) setLoadingItemId(null);
    }
  };

  // ------------------------------------------------------------------
  // Add to playlist handler
  // ------------------------------------------------------------------
  const onAdd = async (item: MediaItem) => {
    setActionMessage(null);
    try {
      const playlists = await playlistApi.list();
      if (!playlists[0]) {
        await playlistApi.create("Favorites", "Auto-generated favorites playlist");
      }
      const latest = await playlistApi.list();
      if (!latest[0]) return;
      await playlistApi.addItem(latest[0]._id, {
        mediaId: item.id,
        mediaType: item.type,
        title: item.title,
        creator: item.creator,
        artwork: item.thumbnail,
        duration: item.duration
      });
      setActionMessage("Added to Favorites.");
    } catch (error) {
      setActionMessage(toApiMessage(error, "Could not add this item to playlist."));
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <section className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-[0.18em]">
          {type === "music" ? "Music Hub" : "Video Hub"}
        </h1>
        <p className="text-sm text-white/60">Ad-free streaming · Infinite discovery</p>
      </div>

      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder={
          type === "music"
            ? "Search songs, artists, albums…"
            : "Search videos and channels…"
        }
      />

      {/* Status messages */}
      {search.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-white/5"
            />
          ))}
        </div>
      )}
      {search.isError && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Failed to load media — check your connection or try another search.
        </p>
      )}
      {actionMessage && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {actionMessage}
        </p>
      )}

      {/* Grid */}
      {!search.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <MediaCard
              key={`${item.type}-${item.id}`}
              item={item}
              onPlay={onPlay}
              onAdd={onAdd}
              isLoading={loadingItemId === item.id}
            />
          ))}
        </div>
      )}

      {/* Infinite scroll trigger */}
      <div ref={loaderRef} className="h-10" />
      {search.isFetchingNextPage && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      )}
    </section>
  );
};
