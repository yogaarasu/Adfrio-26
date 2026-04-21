import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const updateVideoSession = usePlayerStore((state) => state.updateVideoSession);

  const search = useMediaSearch(query, type);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const all: MediaItem[] = [];
    for (const page of search.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        all.push(item);
      }
    }
    return all;
  }, [search.data?.pages]);

  useEffect(() => {
    if (type !== "music" || items.length === 0) return;
    mediaApi.prefetchStreams(items.slice(0, 8).map((item) => item.id));
  }, [items, type]);

  const triggerNextPage = useCallback(() => {
    if (search.hasNextPage && !search.isFetchingNextPage) {
      void search.fetchNextPage();
    }
  }, [search]);
  const loaderRef = useInfiniteTrigger(triggerNextPage);

  const onPlay = async (item: MediaItem) => {
    setLoadingItemId(item.id);

    try {
      if (item.type === "music") {
        playAudio(item, { url: `https://www.youtube.com/watch?v=${item.id}`, mimeType: "audio/mpeg" }, items);
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
            likes: stream.likes ?? null
          });
        })
        .catch(() => undefined);
    } catch {
      toast.error("Playback failed. Please try another item.");
    } finally {
      setLoadingItemId(null);
    }
  };

  const onAdd = async (item: MediaItem) => {
    const targetName = item.type === "music" ? "Favorites" : "Video Favorites";
    try {
      const playlists = await playlistApi.list();
      const existing = playlists.find(
        (entry) =>
          entry.name.toLowerCase() === targetName.toLowerCase() &&
          entry.playlistType === item.type
      );
      if (!existing) {
        await playlistApi.create(targetName, `Auto-generated ${item.type} playlist`, item.type);
      }
      const latest = await playlistApi.list();
      const target = latest.find(
        (entry) =>
          entry.name.toLowerCase() === targetName.toLowerCase() &&
          entry.playlistType === item.type
      );
      if (!target) return;
      await playlistApi.addItem(target._id, {
        mediaId: item.id,
        mediaType: item.type,
        title: item.title,
        creator: item.creator,
        artwork: item.thumbnail,
        duration: item.duration
      });
      toast.success(`Added to ${targetName}.`);
    } catch {
      toast.error("Could not add this item to playlist.");
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-[0.18em]">
          {type === "music" ? "Music Hub" : "Video Hub"}
        </h1>
        <p className="text-sm text-muted-foreground">Ad-free streaming · Infinite discovery</p>
      </div>

      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder={
          type === "music"
            ? "Search songs, artists, albums..."
            : "Search videos and channels..."
        }
      />

      {search.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : null}

      {search.isError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Failed to load media. Check your connection or try another search.
        </p>
      ) : null}

      {!search.isLoading ? (
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
      ) : null}

      <div ref={loaderRef} className="h-10" />
      {search.isFetchingNextPage ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : null}
    </section>
  );
};
