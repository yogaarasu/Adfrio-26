import { useEffect, useRef, useState, useCallback } from "react";
import { X, Loader2, Rewind, FastForward, Play, Pause, Maximize2, Settings, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player-store";
import { mediaApi } from "@/services/api";
import type { MediaItem } from "@/types/media";
import { formatDuration } from "@/lib/utils";
import _ReactPlayer from "react-player";
const ReactPlayer = _ReactPlayer as any;

// YouTube IFrame Player Error Codes
const YT_ERROR_LABELS: Record<number, string> = {
  2: "Invalid video ID",
  5: "HTML5 player error",
  100: "Video not found or removed",
  101: "Embedded playback disabled by owner",
  150: "Embedded playback disabled by owner",
};

// Quality options that map to YouTube's vq parameter
const QUALITY_OPTIONS = [
  { label: "Auto", value: "default" },
  { label: "144p", value: "tiny" },
  { label: "240p", value: "small" },
  { label: "360p", value: "medium" },
  { label: "480p", value: "large" },
  { label: "720p HD", value: "hd720" },
  { label: "1080p Full HD", value: "hd1080" },
];

export const GlobalVideoPlayer = () => {
  const current = usePlayerStore((state) => state.current);
  const video = usePlayerStore((state) => state.video);
  const clearVideo = usePlayerStore((state) => state.clearVideo);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const playing = usePlayerStore((state) => state.playing);
  const playVideo = usePlayerStore((state) => state.playVideo);

  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [loadingRelatedId, setLoadingRelatedId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState("default");
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerRef = useRef<any | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isOpen = video.active && !!current?.id;

  // Reset error state when video changes
  useEffect(() => {
    if (current?.id) {
      setVideoError(null);
      setIsBuffering(true);
      setCurrentTime(0);
      setDuration(0);
      setShowQualityMenu(false);
    }
  }, [current?.id]);

  // Auto-hide controls after 3 seconds
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  const seekBy = (seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const curr = player.currentTime || 0;
    const dur = player.duration || 0;
    if (!dur) return;
    const next = Math.max(0, Math.min(dur, curr + seconds));
    player.currentTime = next;
  };

  const seekTo = (ratio: number) => {
    const player = playerRef.current;
    if (!player || !duration) return;
    player.currentTime = ratio * duration;
  };

  const playRelated = async (item: MediaItem) => {
    setRelatedError(null);
    setLoadingRelatedId(item.id);

    try {
      // Play immediately with YouTube URL
      playVideo({ ...item, type: "video" }, [], video.related);

      // Fetch related in background
      mediaApi.streams(item.id).then((stream) => {
        playVideo({ ...item, type: "video" }, [], stream.related ?? []);
      }).catch(() => {});
    } catch {
      setRelatedError("Could not load related video. Please try another.");
    } finally {
      setLoadingRelatedId(null);
    }
  };

  if (!isOpen) return null;

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const ytUrl = `https://www.youtube.com/watch?v=${current.id}`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="truncate text-sm uppercase tracking-[0.16em] text-white/70 max-w-xs">
          {current.title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={clearVideo}
          className="shrink-0 text-white hover:bg-white/10"
          aria-label="Close video player"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Video area ── */}
        <div className="relative flex flex-1 flex-col">
          {/* Video error banner */}
          {videoError && (
            <div className="absolute inset-x-0 top-0 z-20 m-3 rounded-xl border border-red-500/30 bg-red-900/80 px-4 py-3 text-sm text-red-200">
              ⚠ {videoError}
            </div>
          )}

          {/* Player container */}
          <div
            ref={containerRef}
            className="relative flex-1 overflow-hidden bg-black"
            onMouseMove={resetControlsTimer}
            onTouchStart={resetControlsTimer}
            onClick={() => {
              resetControlsTimer();
              setPlaying(!playing);
            }}
          >
            {/* Buffering indicator */}
            {isBuffering && !videoError && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-white/70" />
              </div>
            )}

            <ReactPlayer
              ref={playerRef}
              src={ytUrl}
              playing={playing}
              controls={false}
              width="100%"
              height="100%"
              style={{ aspectRatio: "16/9", maxHeight: "calc(100vh - 200px)" }}
              config={{
                youtube: {
                  autoplay: 1,
                  rel: 0,
                  modestbranding: 1,
                  playsinline: 1,
                  iv_load_policy: 3,
                  vq: selectedQuality,
                },
              }}
              onReady={() => {
                console.log("[video] Ready:", current.id);
                setIsBuffering(false);
                setVideoError(null);
                resetControlsTimer();
              }}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => setIsBuffering(false)}
              onDurationChange={(e: any) => setDuration(e.currentTarget.duration)}
              onTimeUpdate={(e: any) => setCurrentTime(e.currentTarget.currentTime)}
              onEnded={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={(e: any, data?: any) => {
                const code = typeof e === "number" ? e : data?.code;
                const label =
                  (typeof code === "number" ? YT_ERROR_LABELS[code] : null) ??
                  (e instanceof Error ? e.message : String(e ?? "Unknown player error"));
                console.error(`[video] ❌ Error — ${label}`, { e, data });
                setVideoError(
                  label.includes("embedded")
                    ? "This video cannot be embedded (owner disabled it)."
                    : `Video failed to play: ${label}`
                );
                setIsBuffering(false);
                setPlaying(false);
              }}
            />

            {/* ── Custom controls overlay ── */}
            <div
              className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${showControls || !playing ? "opacity-100" : "opacity-0"}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Progress bar */}
              <div
                className="group mx-4 mb-2 h-1.5 cursor-pointer rounded-full bg-white/25 hover:h-2.5 transition-all"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  seekTo((e.clientX - rect.left) / rect.width);
                }}
              >
                <div
                  className="relative h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-2 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-6">
                {/* Play/Pause */}
                <button
                  onClick={() => setPlaying(!playing)}
                  className="text-white hover:text-white/80 transition-colors"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
                </button>

                {/* Rewind / Forward */}
                <button onClick={() => seekBy(-10)} className="text-white hover:text-white/80 transition-colors" aria-label="Rewind 10s">
                  <Rewind className="h-5 w-5" />
                </button>
                <button onClick={() => seekBy(10)} className="text-white hover:text-white/80 transition-colors" aria-label="Skip 10s">
                  <FastForward className="h-5 w-5" />
                </button>

                {/* Time */}
                <span className="ml-1 text-xs text-white/80 tabular-nums">
                  {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration))}
                </span>

                <div className="flex-1" />

                {/* Quality selector */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQualityMenu((v) => !v);
                    }}
                    className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20 transition-colors"
                    aria-label="Video quality"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>{QUALITY_OPTIONS.find((q) => q.value === selectedQuality)?.label ?? "Auto"}</span>
                  </button>

                  {showQualityMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-40 overflow-hidden rounded-xl border border-white/20 bg-black/95 shadow-2xl backdrop-blur-md">
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/50">Quality</p>
                      {QUALITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedQuality(opt.value);
                            setShowQualityMenu(false);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-white/10 ${selectedQuality === opt.value ? "text-yellow-400" : "text-white"}`}
                        >
                          {selectedQuality === opt.value && <Check className="h-3.5 w-3.5 shrink-0" />}
                          <span className={selectedQuality === opt.value ? "ml-0" : "ml-5"}>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fullscreen */}
                <button
                  onClick={() => {
                    const el = containerRef.current;
                    if (!el) return;
                    if (document.fullscreenElement) {
                      document.exitFullscreen();
                    } else {
                      el.requestFullscreen();
                    }
                  }}
                  className="text-white hover:text-white/80 transition-colors"
                  aria-label="Fullscreen"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Video title below player */}
          <div className="px-4 py-3">
            <h3 className="text-base font-semibold line-clamp-2">{current.title}</h3>
            <p className="mt-0.5 text-sm text-white/60">{current.creator}</p>
          </div>
        </div>

        {/* ── Related videos sidebar (desktop) ── */}
        {video.related.length > 0 && (
          <div className="hidden w-80 shrink-0 overflow-y-auto border-l border-white/10 lg:block">
            <div className="p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
                Up Next
              </h4>
              {relatedError && (
                <p className="mb-3 text-sm text-amber-300">{relatedError}</p>
              )}
              <div className="space-y-2">
                {video.related.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void playRelated(item)}
                    className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-2 text-left transition hover:bg-white/10 hover:border-white/20"
                    disabled={loadingRelatedId === item.id}
                  >
                    <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg">
                      <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                      {loadingRelatedId === item.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-white/60">{item.creator}</p>
                      <p className="mt-1 text-xs text-white/40">{formatDuration(item.duration)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Related videos (mobile — below player) ── */}
      {video.related.length > 0 && (
        <div className="border-t border-white/10 px-4 py-3 lg:hidden">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
            Related
          </h4>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {video.related.slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void playRelated(item)}
                disabled={loadingRelatedId === item.id}
                className="shrink-0 w-36 rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 transition text-left"
              >
                <div className="relative">
                  <img src={item.thumbnail} alt={item.title} className="w-full h-20 object-cover" />
                  {loadingRelatedId === item.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="line-clamp-2 text-xs font-medium">{item.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
