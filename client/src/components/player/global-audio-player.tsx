/**
 * global-audio-player.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistent music player bar rendered at the bottom of every page.
 *
 * KEY FIX: YouTube IFrame API refuses to stream audio when the player element
 * is inside a `display:none` container. We now render ReactPlayer as a 1×1px
 * element fixed off-screen (still "visible" to the browser) so audio flows.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  Rewind,
  FastForward,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  AlertCircle,
  Loader2,
  Music,
} from "lucide-react";
import _ReactPlayer from "react-player";
const ReactPlayer = _ReactPlayer as any;
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player-store";
import { useMediaSession } from "@/hooks/use-media-session";
import { SleepTimer } from "@/components/player/sleep-timer";
import { formatDuration } from "@/lib/utils";

// ─── Error code → human-readable label ──────────────────────────────
const YT_ERROR_LABELS: Record<number, string> = {
  2: "Invalid video ID provided",
  5: "HTML5 player error",
  100: "Video not found or was removed",
  101: "Owner disabled embedded playback",
  150: "Owner disabled embedded playback",
};

export const GlobalAudioPlayer = () => {
  const recoveredIdRef = useRef<string | null>(null);
  const playerRef = useRef<any | null>(null);

  const current = usePlayerStore((s) => s.current);
  const video = usePlayerStore((s) => s.video);
  const playing = usePlayerStore((s) => s.playing);
  const volume = usePlayerStore((s) => s.volume);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const queue = usePlayerStore((s) => s.queue);
  const audioError = usePlayerStore((s) => s.audioError);

  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const playAudio = usePlayerStore((s) => s.playAudio);
  const setAudioError = usePlayerStore((s) => s.setAudioError);

  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Sync internal state when track changes
  useEffect(() => {
    if (current?.id) {
      setIsReady(false);
      setIsLoading(true);
      setAudioError(null);
      recoveredIdRef.current = null;
    }
  }, [current?.id, setAudioError]);

  // ── Recovery mechanism for blocked tracks ───────────────────────────────────
  const recoverCurrentTrack = useCallback(async () => {
    if (!current) return;
    if (recoveredIdRef.current === current.id) {
      console.warn("[audio] Recovery already attempted for", current.id, "— giving up");
      setPlaying(false);
      setAudioError("This track cannot be played. It may be region-restricted or embedding disabled.");
      return;
    }

    recoveredIdRef.current = current.id;
    console.warn("[audio] → Attempting stream recovery/re-mount for", current.id);

    setIsReady(false);
    setIsLoading(true);
    setAudioError(null);

    setTimeout(() => {
      setPlaying(true);
    }, 600);
  }, [current, setPlaying, setAudioError]);

  // ── Queue navigation ────────────────────────────────────────────────────────
  const jump = useCallback(
    (dir: -1 | 1) => {
      if (!current || queue.length < 2) return;
      const idx = queue.findIndex((e) => e.id === current.id);
      if (idx === -1) return;
      const next = queue[(idx + dir + queue.length) % queue.length];
      if (!next) return;
      // Build the YouTube URL for the next track the same way media-page does
      playAudio(
        next,
        { url: `https://www.youtube.com/watch?v=${next.id}`, mimeType: "audio/mpeg" },
        queue
      );
    },
    [current, playAudio, queue]
  );

  // ── Seek callbacks ──────────────────────────────────────────────────────────
  const onSeekBy = useCallback((seconds: number) => {
    if (!playerRef.current) return;
    const pos = playerRef.current.currentTime || 0;
    const dur = playerRef.current.duration || 0;
    const next = Math.max(0, Math.min(dur, pos + seconds));
    playerRef.current.currentTime = next;
  }, []);

  const onSeekTo = useCallback((time: number) => {
    if (!playerRef.current) return;
    playerRef.current.currentTime = time;
  }, []);

  const onTogglePlay = useCallback(
    () => setPlaying(!playing),
    [playing, setPlaying]
  );

  const onToggleMute = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

  useMediaSession({
    onSeekBy,
    onNext: () => void jump(1),
    onPrev: () => void jump(-1),
    onTogglePlay,
    onSeekTo,
  });

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  if (!current) return null;

  const showUI = current && !video.active;
  const ytUrl = `https://www.youtube.com/watch?v=${current.id}`;

  return (
    <>
      {/*
        ── KEY FIX ────────────────────────────────────────────────────────────
        ReactPlayer/YouTube IFrame MUST be "visible" to the browser (not inside
        display:none) to produce audio. We position it 1×1px fixed off-screen.
        The browser still considers it a live document element → audio streams.
      */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-2px",
          top: "-2px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        {current && (
          <ReactPlayer
            ref={playerRef}
            src={ytUrl}
            playing={playing && !video.active}
            volume={isMuted ? 0 : volume}
            muted={isMuted}
            width="1px"
            height="1px"
            config={{
              youtube: {
                autoplay: 1,
                playsinline: 1,
                modestbranding: 1,
                rel: 0,
                iv_load_policy: 3,
                vq: "hd1080",
              },
            }}
            onReady={() => {
              setIsReady(true);
              setIsLoading(false);
              setAudioError(null);
            }}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
            onDurationChange={(e: any) => setProgress(currentTime, e.currentTarget.duration)}
            onTimeUpdate={(e: any) => setProgress(e.currentTarget.currentTime, duration)}
            onEnded={() => {
              jump(1);
            }}
            onError={(e: any, data?: any) => {
              const code = typeof e === "number" ? e : data?.code;
              const label =
                (typeof code === "number" ? YT_ERROR_LABELS[code] : null) ??
                (e instanceof Error ? e.message : String(e ?? "Unknown player error"));
              console.error(`[audio] ❌ ReactPlayer Error — ${label}`, { e, data });
              setAudioError(
                label.includes("embedded")
                  ? "This song cannot be embedded (owner restricted)."
                  : `Playback failed: ${label}`
              );
              setIsLoading(false);
              setPlaying(false);
              void recoverCurrentTrack();
            }}
          />
        )}
      </div>

      {showUI && (
        <div
          className="fixed bottom-16 left-0 right-0 z-50 border-t border-white/20 bg-black/95 px-4 py-3 backdrop-blur-md md:bottom-0"
          role="region"
          aria-label="Audio player"
        >
          {/* ── Seek progress bar ──────────────────────────────────────────────── */}
          <div
            className="group mb-3 h-1.5 w-full cursor-pointer rounded-full bg-white/15"
            onClick={(e) => {
              if (!duration) return;
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              onSeekTo(ratio * duration);
            }}
            role="slider"
            aria-label="Seek"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") onSeekBy(10);
              if (e.key === "ArrowLeft") onSeekBy(-10);
            }}
          >
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-150"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1.5 rounded-full bg-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100" />
            </div>
          </div>

          {/* ── Error banner ────────────────────────────────────────────────────── */}
          {audioError && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{audioError}</span>
            </div>
          )}

          {/* ── Controls row ────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            {/* Thumbnail + track info */}
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg shadow-lg">
              {current.thumbnail ? (
                <img
                  src={current.thumbnail}
                  alt={current.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/10">
                  <Music className="h-5 w-5 text-white/50" />
                </div>
              )}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{current.title}</p>
              <p className="truncate text-xs text-white/60">{current.creator}</p>
              <p className="text-xs text-white/40">
                {formatDuration(Math.floor(currentTime))} /{" "}
                {formatDuration(Math.floor(duration))}
              </p>
            </div>

            {/* Playback buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => jump(-1)}
                aria-label="Previous track"
                className="hidden sm:flex"
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSeekBy(-10)}
                aria-label="Rewind 10 seconds"
              >
                <Rewind className="h-4 w-4" />
              </Button>

              <Button
                variant="default"
                size="icon"
                onClick={onTogglePlay}
                disabled={isLoading}
                className="h-10 w-10 rounded-full bg-indigo-600 hover:bg-indigo-500"
                aria-label={playing ? "Pause" : "Play"}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : playing ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 fill-current" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSeekBy(10)}
                aria-label="Skip 10 seconds"
              >
                <FastForward className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => jump(1)}
                aria-label="Next track"
                className="hidden sm:flex"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            {/* Volume control */}
            <div className="hidden items-center gap-2 md:flex">
              <button
                onClick={onToggleMute}
                aria-label={isMuted ? "Unmute" : "Mute"}
                className="text-white/60 hover:text-white transition-colors"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                id="global-volume-slider"
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVolume(val);
                  if (val > 0 && isMuted) setIsMuted(false);
                }}
                className="w-24 accent-indigo-400"
                aria-label="Volume"
              />
            </div>

            {/* Sleep timer */}
            <div className="hidden md:block">
              <SleepTimer />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
