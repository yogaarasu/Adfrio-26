import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { playlistApi, mediaApi } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import { usePlayerStore } from "@/store/player-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MediaCard } from "@/components/media/media-card";
import { formatDuration } from "@/lib/utils";
import type { MediaItem } from "@/types/media";

export const LibraryPage = () => {
  const user = useAuthStore((state) => state.user);
  const mode = usePreferencesStore((state) => state.mode);

  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const updateVideoSession = usePlayerStore((state) => state.updateVideoSession);

  const playlistsQuery = useQuery({
    queryKey: ["library-playlists", user?.id],
    enabled: Boolean(user),
    queryFn: playlistApi.list
  });

  const favoriteItems = useMemo(() => {
    const seen = new Set<string>();
    const flattened: MediaItem[] = [];

    for (const playlist of playlistsQuery.data ?? []) {
      for (const item of playlist.items) {
        if (item.mediaType !== mode) continue;
        if (seen.has(item.mediaId)) continue;
        seen.add(item.mediaId);
        flattened.push({
          id: item.mediaId,
          title: item.title,
          creator: item.creator ?? "Unknown creator",
          thumbnail: item.artwork ?? `https://i.ytimg.com/vi/${item.mediaId}/hqdefault.jpg`,
          duration: item.duration ?? null,
          type: item.mediaType
        });
      }
    }

    return flattened;
  }, [mode, playlistsQuery.data]);

  useEffect(() => {
    if (mode !== "music" || favoriteItems.length === 0) return;
    mediaApi.prefetchStreams(favoriteItems.slice(0, 8).map((item) => item.id));
  }, [favoriteItems, mode]);

  const playMedia = useCallback(
    async (item: MediaItem) => {
      setLoadingItemId(item.id);
      setStatusMessage(null);

      try {
        if (item.type === "music") {
          playAudio(
            item,
            { url: `https://www.youtube.com/watch?v=${item.id}`, mimeType: "audio/mpeg" },
            favoriteItems
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
        setStatusMessage("Playback failed. Please try another item.");
      } finally {
        setLoadingItemId(null);
      }
    },
    [favoriteItems, playAudio, playVideo, updateVideoSession]
  );

  if (!user) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Library</h1>
        <Card>
          <p className="text-sm text-white/70">
            Sign in from Profile to save and view your favorites.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Library</h1>
        <p className="text-sm text-white/60">
          Showing favorite {mode === "music" ? "songs" : "videos"} only.
        </p>
      </header>

      {statusMessage ? (
        <p className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/80">
          {statusMessage}
        </p>
      ) : null}

      {playlistsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading favorites...
        </div>
      ) : null}

      {mode === "music" ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[42px_minmax(0,1fr)_90px_90px] gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.12em] text-white/50">
            <span>#</span>
            <span>Song</span>
            <span>Duration</span>
            <span className="text-right">Play</span>
          </div>
          {favoriteItems.map((item, index) => (
            <div
              key={item.id}
              className="grid grid-cols-[42px_minmax(0,1fr)_90px_90px] items-center gap-3 border-b border-white/5 px-4 py-3 text-sm last:border-b-0"
            >
              <span className="text-white/50">{index + 1}</span>
              <div className="flex min-w-0 items-center gap-3">
                <img src={item.thumbnail} alt={item.title} className="h-10 w-10 rounded-md object-cover" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-white/60">{item.creator}</span>
                </span>
              </div>
              <span className="text-white/60">{formatDuration(item.duration)}</span>
              <div className="flex justify-end">
                <Button size="icon" onClick={() => void playMedia(item)} disabled={loadingItemId === item.id}>
                  {loadingItemId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 fill-current" />
                  )}
                </Button>
              </div>
            </div>
          ))}
          {!playlistsQuery.isLoading && favoriteItems.length === 0 ? (
            <p className="px-4 py-5 text-sm text-white/60">
              No favorite songs yet. Add songs from Home or Search.
            </p>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favoriteItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onPlay={(entry) => playMedia(entry)}
              isLoading={loadingItemId === item.id}
            />
          ))}
          {!playlistsQuery.isLoading && favoriteItems.length === 0 ? (
            <Card className="sm:col-span-2 lg:col-span-3">
              <p className="text-sm text-white/60">
                No favorite videos yet. Add videos from Home or Search.
              </p>
            </Card>
          ) : null}
        </div>
      )}
    </section>
  );
};
