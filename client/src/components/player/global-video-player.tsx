import { useEffect, useRef, useState } from "react";
import { X, Loader2, Rewind, FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player-store";
import { mediaApi } from "@/services/api";
import type { MediaItem } from "@/types/media";
import { formatDuration } from "@/lib/utils";
import ReactPlayer from "react-player";

export const GlobalVideoPlayer = () => {
  const current = usePlayerStore((state) => state.current);
  const video = usePlayerStore((state) => state.video);
  const clearVideo = usePlayerStore((state) => state.clearVideo);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const playing = usePlayerStore((state) => state.playing);
  const playVideo = usePlayerStore((state) => state.playVideo);

  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [loadingRelatedId, setLoadingRelatedId] = useState<string | null>(null);

  const playerRef = useRef<any | null>(null);

  const isOpen = video.active && !!current?.id;

  const seekBy = (seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    if (!duration) return;
    const next = Math.max(0, Math.min(duration, currentTime + seconds));
    player.seekTo(next, "seconds");
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
      playVideo({ ...item, type: "video" }, [], stream.related ?? []);
    } catch {
      setRelatedError("Could not load related video. Please try another.");
    } finally {
      setLoadingRelatedId(null);
    }
  };

  if (!isOpen) return null;

  const Player = ReactPlayer as any;

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

        <div className="overflow-hidden rounded-2xl border border-white/20 bg-black aspect-video relative">
          <Player
            ref={playerRef}
            url={`https://www.youtube.com/watch?v=${current.id}`}
            playing={playing}
            controls
            width="100%"
            height="100%"
            onEnded={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={(e: any) => {
              console.error("[GlobalVideoPlayer] ReactPlayer Error:", e);
              setRelatedError("Video failed to play. It may be restricted by YouTube.");
            }}
            config={
              {
                youtube: {
                  playerVars: { autoplay: 1, rel: 0 }
                }
              } as any
            }
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => seekBy(-10)}>
            <Rewind className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => seekBy(10)}>
            <FastForward className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4">
          <h3 className="text-base font-semibold">{current.title}</h3>
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
