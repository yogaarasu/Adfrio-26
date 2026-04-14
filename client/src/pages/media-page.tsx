import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mediaApi, playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import type { MediaItem, MediaType } from "@/types/media";
import { SearchBox } from "@/components/media/search-box";
import { MediaCard } from "@/components/media/media-card";
import { useMediaSearch } from "@/hooks/use-media-search";
import { useInfiniteTrigger } from "@/hooks/use-infinite-trigger";

type Props = { type: MediaType };

export const MediaPage = ({ type }: Props) => {
  const [query, setQuery] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const updateVideoSession = usePlayerStore((state) => state.updateVideoSession);

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

  useEffect(() => {
    if (type !== "music" || items.length === 0) return;
    mediaApi.prefetchStreams(items.slice(0, 8).map((item) => item.id));
  }, [items, type]);

  // Stable infinite scroll trigger
  const triggerNextPage = useCallback(() => {
    if (search.hasNextPage && !search.isFetchingNextPage) {
      void search.fetchNextPage();
    }
  }, [search]);

  const loaderRef = useInfiniteTrigger(triggerNextPage);

  // ------------------------------------------------------------------
  // Play handler — simplified: for music, play immediately via YouTube
  // IFrame (ReactPlayer). For video, fetch stream info for related videos
  // but still use YouTube URL for the actual player.
  // ------------------------------------------------------------------
  const onPlay = async (item: MediaItem) => {
    setActionMessage(null);
    setLoadingItemId(item.id);

    try {
      if (item.type === "music") {
        playAudio(
          item,
          { url: `https://www.youtube.com/watch?v=${item.id}`, mimeType: "audio/mpeg" },
          items
        );
      } else {
        const started = playVideo(item, [], []);
        if (!started) return;
        mediaApi.streams(item.id).then((stream) => {
          updateVideoSession(item.id, {
            related: stream.related ?? [],
            description: stream.description,
            uploader: stream.uploader,
            uploaderAvatarUrl: stream.uploaderAvatarUrl ?? null,
            likes: stream.likes ?? null
          });
        }).catch(() => {
          // Related fetch failed — video still plays, just no related list
        });
      }
    } catch {
      setActionMessage("Playback failed. Please try another item.");
    } finally {
      setLoadingItemId(null);
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
      setActionMessage("Added to Favorites ✓");
    } catch {
      setActionMessage("Could not add this item to playlist.");
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
