import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Rewind, FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player-store";
import { mediaApi } from "@/services/api";
import type { MediaItem } from "@/types/media";
import { formatDuration } from "@/lib/utils";
import { pickPlayableVideoSources } from "@/lib/playback";
import { buildMediaProxyUrl } from "@/lib/proxy-stream-url";

export const GlobalVideoPlayer = () => {
  const current = usePlayerStore((state) => state.current);
  const video = usePlayerStore((state) => state.video);
  const clearVideo = usePlayerStore((state) => state.clearVideo);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const playVideo = usePlayerStore((state) => state.playVideo);

  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [loadingRelatedId, setLoadingRelatedId] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>("");

  const playerRef = useRef<HTMLVideoElement | null>(null);
  const recoveredIdRef = useRef<string | null>(null);

  const isOpen = video.active && video.sources.length > 0;

  useEffect(() => {
    if (current?.id !== recoveredIdRef.current) {
      recoveredIdRef.current = null;
    }
  }, [current?.id]);

  useEffect(() => {
    if (!video.sources.length) {
      setSelectedQuality("");
      return;
    }

    const firstQuality = video.sources[0]?.quality ?? "";
    setSelectedQuality((prev) => {
      if (!prev) return firstQuality;
      return video.sources.some((entry) => entry.quality === prev) ? prev : firstQuality;
    });
  }, [video.sources]);

  const sourceOptions = useMemo(
    () =>
      pickPlayableVideoSources(
        video.sources.map((entry) => ({
          url: entry.url,
          quality: entry.quality,
          format: entry.format
        }))
      ),
    [video.sources]
  );

  const activeSource = sourceOptions.find((entry) => entry.quality === selectedQuality) ?? sourceOptions[0] ?? null;

  useEffect(() => {
    if (!playerRef.current || !activeSource?.url) return;

    const player = playerRef.current;
    const wasPlaying = !player.paused;
    const previousTime = player.currentTime;

    if (player.src !== activeSource.url) {
      player.src = activeSource.url;
      player.load();
    }

    if (Number.isFinite(previousTime) && previousTime > 0) {
      const seekTo = previousTime;
      const onLoaded = () => {
        try {
          player.currentTime = seekTo;
        } catch {
          // Ignore seek errors.
        }
      };
      player.addEventListener("loadedmetadata", onLoaded, { once: true });
    }

    if (wasPlaying) {
      void player.play().catch(() => undefined);
    }
  }, [activeSource?.url]);

  const recoverCurrentVideo = async () => {
    if (!current?.id) return;
    if (recoveredIdRef.current === current.id) {
      setRelatedError("This video stream expired. Please choose another video.");
      return;
    }

    recoveredIdRef.current = current.id;

    try {
      const stream = await mediaApi.streams(current.id, { forceRefresh: true });
      if (stream.unavailableReason) {
        setRelatedError(stream.unavailableReason);
        return;
      }

      const rawSources = pickPlayableVideoSources(
        stream.video.map((entry) => ({
          url: entry.url,
          quality: entry.quality,
          format: entry.format
        }))
      );

      if (rawSources.length === 0) {
        setRelatedError("Video stream unavailable for this item.");
        return;
      }

      const proxiedSources = rawSources.map((entry) => ({
        url: buildMediaProxyUrl(current.id, "video", entry.quality),
        quality: entry.quality,
        format: entry.format
      }));

      playVideo({ ...current, type: "video" }, proxiedSources, stream.related ?? []);
      setRelatedError(null);
    } catch {
      setRelatedError("Could not recover this video stream. Try another video.");
    }
  };

  const seekBy = (seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const next = Math.max(0, Math.min(player.duration || Number.MAX_SAFE_INTEGER, player.currentTime + seconds));
    player.currentTime = next;
  };

  const playRelated = async (item: MediaItem) => {
    setRelatedError(null);
    setLoadingRelatedId(item.id);

    try {
      const stream = await mediaApi.streams(item.id);
      if (stream.unavailableReason) {
        setRelatedError(stream.unavailableReason);
        return;
      }

      const rawSources = pickPlayableVideoSources(
        stream.video.map((entry) => ({
          url: entry.url,
          quality: entry.quality,
          format: entry.format
        }))
      );

      if (rawSources.length === 0) {
        setRelatedError("No playable video streams available for this related item.");
        return;
      }

      const proxiedSources = rawSources.map((entry) => ({
        url: buildMediaProxyUrl(item.id, "video", entry.quality),
        quality: entry.quality,
        format: entry.format
      }));

      playVideo({ ...item, type: "video" }, proxiedSources, stream.related ?? []);
    } catch {
      setRelatedError("Could not load related video. Please try another.");
    } finally {
      setLoadingRelatedId(null);
    }
  };

  if (!isOpen || !activeSource) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/95">
      <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="truncate text-sm uppercase tracking-[0.16em] text-white/70">Now Playing</h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              clearVideo();
              setPlaying(true);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-black">
          <video
            ref={playerRef}
            controls
            autoPlay
            playsInline
            className="h-auto w-full"
            src={activeSource.url}
            onEnded={() => setPlaying(false)}
            onError={() => {
              void recoverCurrentVideo();
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => seekBy(-10)}>
            <Rewind className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => seekBy(10)}>
            <FastForward className="h-4 w-4" />
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="video-quality" className="text-xs uppercase tracking-[0.12em] text-white/60">
              Quality
            </label>
            <select
              id="video-quality"
              className="rounded-md border border-white/25 bg-black px-2 py-1 text-sm"
              value={activeSource.quality}
              onChange={(event) => setSelectedQuality(event.target.value)}
            >
              {sourceOptions.map((entry) => (
                <option key={entry.quality} value={entry.quality}>
                  {entry.quality}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="text-base font-semibold">{video.title}</h3>
        </div>

        {relatedError ? <p className="mt-3 text-sm text-amber-300">{relatedError}</p> : null}

        <div className="mt-5">
          <h4 className="mb-3 text-sm uppercase tracking-[0.14em] text-white/70">Related Videos</h4>
          {video.related.length === 0 ? <p className="text-sm text-white/60">No related videos available.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {video.related.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void playRelated(item)}
                className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/5 p-2 text-left transition hover:bg-white/10"
                disabled={loadingRelatedId === item.id}
              >
                <img src={item.thumbnail} alt={item.title} className="h-16 w-28 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-white/60">{item.creator}</p>
                  <p className="mt-1 text-xs text-white/50">{formatDuration(item.duration)}</p>
                </div>
                {loadingRelatedId === item.id ? <Loader2 className="h-4 w-4 animate-spin text-white/70" /> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
