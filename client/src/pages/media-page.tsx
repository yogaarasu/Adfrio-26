import { useEffect, useMemo, useRef, useState } from "react";
import type { AxiosError } from "axios";
import { mediaApi, playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import type { MediaItem, MediaType } from "@/types/media";
import { pickBestAudioSource, pickPlayableVideoSources } from "@/lib/playback";
import { SearchBox } from "@/components/media/search-box";
import { MediaCard } from "@/components/media/media-card";
import { useMediaSearch } from "@/hooks/use-media-search";
import { useInfiniteTrigger } from "@/hooks/use-infinite-trigger";

const defaultQueries: Record<MediaType, string> = {
  music: "top songs",
  video: "trending videos"
};

type Props = {
  type: MediaType;
};

type ApiErrorResponse = {
  message?: string;
};

const toApiMessage = (error: unknown, fallback: string): string => {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError?.response?.data?.message ?? fallback;
};

export const MediaPage = ({ type }: Props) => {
  const [query, setQuery] = useState(defaultQueries[type]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const requestTokenRef = useRef(0);
  const playRequestControllerRef = useRef<AbortController | null>(null);

  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  const search = useMediaSearch(query, type);

  const items = useMemo(
    () => search.data?.pages.flatMap((page) => page.items) ?? [],
    [search.data?.pages]
  );

  useEffect(
    () => () => {
      playRequestControllerRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    const topIds = items.slice(0, 4).map((item) => item.id);
    mediaApi.prefetchStreams(topIds);
  }, [items]);

  const loaderRef = useInfiniteTrigger(() => {
    if (search.hasNextPage && !search.isFetchingNextPage) {
      void search.fetchNextPage();
    }
  });

  const onPlay = async (item: MediaItem) => {
    if (loadingItemId === item.id) return;

    setActionMessage(null);
    setLoadingItemId(item.id);

    playRequestControllerRef.current?.abort();
    const requestController = new AbortController();
    playRequestControllerRef.current = requestController;

    const requestToken = requestTokenRef.current + 1;
    requestTokenRef.current = requestToken;

    try {
      let stream = await mediaApi.streams(item.id, { signal: requestController.signal });

      const hasMusicSource = Boolean(pickBestAudioSource(stream)?.url);
      const hasVideoSource = pickPlayableVideoSources(
        stream.video.map((entry) => ({
          url: entry.url,
          quality: entry.quality,
          format: entry.format
        }))
      ).length > 0;

      const shouldRefresh =
        Boolean(stream.unavailableReason) ||
        (item.type === "music" && !hasMusicSource) ||
        (item.type === "video" && !hasVideoSource);

      if (shouldRefresh && !requestController.signal.aborted) {
        stream = await mediaApi.streams(item.id, { forceRefresh: true, signal: requestController.signal });
      }

      if (requestToken !== requestTokenRef.current || requestController.signal.aborted) return;

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

        playAudio(item, { url: bestAudio.url, mimeType: bestAudio.mimeType }, items);
        return;
      }

      setPlaying(false);
      const sources = pickPlayableVideoSources(
        stream.video.map((entry) => ({
          url: entry.url,
          quality: entry.quality,
          format: entry.format
        }))
      );

      if (sources.length === 0) {
        setActionMessage("Video stream unavailable for this item.");
        return;
      }

      playVideo(item, sources, stream.related ?? []);
    } catch (error) {
      if (requestToken !== requestTokenRef.current) return;
      if (mediaApi.isCanceledError(error)) return;
      setActionMessage(toApiMessage(error, "Playback failed. Please try another media item."));
    } finally {
      if (requestToken === requestTokenRef.current) {
        setLoadingItemId(null);
      }
    }
  };

  const onAdd = async (item: MediaItem) => {
    setActionMessage(null);

    try {
      const playlists = await playlistApi.list();
      const target = playlists[0];
      if (!target) {
        await playlistApi.create("Favorites", "Auto-generated favorites playlist");
      }

      const latestPlaylists = await playlistApi.list();
      if (!latestPlaylists[0]) return;

      await playlistApi.addItem(latestPlaylists[0]._id, {
        mediaId: item.id,
        mediaType: item.type,
        title: item.title,
        creator: item.creator,
        artwork: item.thumbnail,
        duration: item.duration
      });

      setActionMessage("Added to playlist.");
    } catch (error) {
      setActionMessage(toApiMessage(error, "Could not add this item to playlist."));
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-[0.18em]">{type === "music" ? "Music Hub" : "Video Hub"}</h1>
          <p className="text-sm text-white/70">Ad-free streaming powered by Piped.</p>
        </div>
      </div>

      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder={type === "music" ? "Search songs, artists, albums" : "Search videos and channels"}
      />

      {search.isLoading ? <p className="text-sm text-white/60">Loading...</p> : null}
      {search.isError ? <p className="text-sm text-red-300">Failed to fetch media. Try another query.</p> : null}
      {actionMessage ? <p className="text-sm text-amber-300">{actionMessage}</p> : null}

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

      <div ref={loaderRef} className="h-10" />
      {search.isFetchingNextPage ? <p className="text-center text-sm text-white/60">Loading more...</p> : null}
    </section>
  );
};
