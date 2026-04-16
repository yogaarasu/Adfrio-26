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
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player-store";
import { useMediaSession } from "@/hooks/use-media-session";
import { SleepTimer } from "@/components/player/sleep-timer";
import { formatDuration } from "@/lib/utils";
import { accentColorFromSeed } from "@/lib/accent-color";

const ReactPlayer = _ReactPlayer as any;

const YT_ERROR_LABELS: Record<number, string> = {
  2: "Invalid video ID provided",
  5: "HTML5 player error",
  100: "Video not found or removed",
  101: "Owner disabled embedded playback",
  150: "Owner disabled embedded playback",
};

type ProgressState = {
  playedSeconds?: number;
};

export const GlobalAudioPlayer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const recoveredIdRef = useRef<string | null>(null);
  const playerRef = useRef<any | null>(null);
  const seekLockUntilRef = useRef(0);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSyncTimeRef = useRef(0);
  const lastSyncAtRef = useRef(0);
  const autoAdvanceKeyRef = useRef<string>("");

  const current = usePlayerStore((s) => s.current);
  const audio = usePlayerStore((s) => s.audio);
  const video = usePlayerStore((s) => s.video);
  const playing = usePlayerStore((s) => s.playing);
  const volume = usePlayerStore((s) => s.volume);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const queue = usePlayerStore((s) => s.queue);
  const audioError = usePlayerStore((s) => s.audioError);
  const seekRequestTime = usePlayerStore((s) => s.seekRequestTime);

  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const playAudio = usePlayerStore((s) => s.playAudio);
  const setAudioError = usePlayerStore((s) => s.setAudioError);
  const openVideoOverlay = usePlayerStore((s) => s.openVideoOverlay);
  const clearSeekRequest = usePlayerStore((s) => s.clearSeekRequest);

  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  const clearBackgroundAdvanceTimeout = useCallback(() => {
    if (backgroundAdvanceTimeoutRef.current) {
      clearTimeout(backgroundAdvanceTimeoutRef.current);
      backgroundAdvanceTimeoutRef.current = null;
    }
  }, []);

  const setLoadingWithGuard = useCallback(
    (next: boolean) => {
      if (!next) {
        clearLoadingTimeout();
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      clearLoadingTimeout();
      loadingTimeoutRef.current = setTimeout(() => {
        setIsLoading(false);
      }, 3000);
    },
    [clearLoadingTimeout]
  );

  useEffect(() => {
    if (!current?.id) return;
    setLoadingWithGuard(true);
    setAudioError(null);
    recoveredIdRef.current = null;
  }, [current?.id, setAudioError, setLoadingWithGuard]);

  useEffect(
    () => () => {
      clearLoadingTimeout();
      clearBackgroundAdvanceTimeout();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    },
    [clearBackgroundAdvanceTimeout, clearLoadingTimeout]
  );

  useEffect(() => {
    const now = performance.now();
    lastSyncTimeRef.current = currentTime;
    lastSyncAtRef.current = now;
    setDisplayTime((prev) => {
      if (!playing) return currentTime;
      return Math.abs(prev - currentTime) > 0.35 ? currentTime : prev;
    });
  }, [current?.id, currentTime, playing]);

  const interpolatedDuration = duration > 0 ? duration : Number(current?.duration ?? 0);

  useEffect(() => {
    if (!playing || !current || !audio) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setDisplayTime(currentTime);
      lastSyncTimeRef.current = currentTime;
      lastSyncAtRef.current = performance.now();
      return;
    }

    const tick = (now: number) => {
      const elapsed = Math.max(0, (now - lastSyncAtRef.current) / 1000);
      const maxTime = interpolatedDuration > 0 ? interpolatedDuration : Number.MAX_SAFE_INTEGER;
      const nextTime = Math.min(maxTime, lastSyncTimeRef.current + elapsed);
      setDisplayTime(nextTime);
      rafRef.current = requestAnimationFrame(tick);
    };

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [audio, current?.id, currentTime, interpolatedDuration, playing]);

  const recoverCurrentTrack = useCallback(async () => {
    if (!current) return;
    if (recoveredIdRef.current === current.id) {
      setPlaying(false);
      setAudioError("This track cannot be played. It may be region-restricted or embedding disabled.");
      return;
    }

    recoveredIdRef.current = current.id;
    setLoadingWithGuard(true);
    setAudioError(null);

    setTimeout(() => {
      setPlaying(true);
    }, 600);
  }, [current, setAudioError, setLoadingWithGuard, setPlaying]);

  const jump = useCallback(
    (dir: -1 | 1) => {
      if (!current || queue.length < 2) return;
      const idx = queue.findIndex((entry) => entry.id === current.id);
      if (idx === -1) return;
      const next = queue[(idx + dir + queue.length) % queue.length];
      if (!next) return;
      playAudio(next, { url: `https://www.youtube.com/watch?v=${next.id}`, mimeType: "audio/mpeg" }, queue);
    },
    [current, playAudio, queue]
  );

  const openSongSheet = useCallback(() => {
    if (current?.type !== "music") return;
    navigate("/now-playing");
  }, [current?.type, navigate]);

  const readCurrentTime = useCallback((): number => {
    const player = playerRef.current;
    if (!player) return 0;
    const viaApi = typeof player.getCurrentTime === "function" ? Number(player.getCurrentTime()) : NaN;
    if (Number.isFinite(viaApi)) return viaApi;
    const viaProp = Number(player.currentTime);
    return Number.isFinite(viaProp) ? viaProp : 0;
  }, []);

  const readDuration = useCallback((): number => {
    const player = playerRef.current;
    if (!player) return 0;
    const viaApi = typeof player.getDuration === "function" ? Number(player.getDuration()) : NaN;
    if (Number.isFinite(viaApi)) return viaApi;
    const viaProp = Number(player.duration);
    return Number.isFinite(viaProp) ? viaProp : 0;
  }, []);

  const seekToSeconds = useCallback(
    (seconds: number, showLoading = true) => {
      const player = playerRef.current;
      if (!player) return;

      const maxDuration = readDuration() || duration || Number.MAX_SAFE_INTEGER;
      const bounded = Math.max(0, Math.min(maxDuration, seconds));

      seekLockUntilRef.current = Date.now() + 700;
      if (showLoading && playing) setLoadingWithGuard(true);
      setProgress(bounded, readDuration() || duration || 0);
      setDisplayTime(bounded);
      lastSyncTimeRef.current = bounded;
      lastSyncAtRef.current = performance.now();

      if (typeof player.seekTo === "function") {
        player.seekTo(bounded, "seconds");
        return;
      }

      player.currentTime = bounded;
    },
    [duration, playing, readDuration, setLoadingWithGuard, setProgress]
  );

  const onSeekBy = useCallback(
    (seconds: number) => {
      const position = readCurrentTime();
      seekToSeconds(position + seconds);
    },
    [readCurrentTime, seekToSeconds]
  );

  const onSeekTo = useCallback(
    (time: number) => {
      seekToSeconds(time);
    },
    [seekToSeconds]
  );

  const onTogglePlay = useCallback(() => {
    setPlaying(!playing);
  }, [playing, setPlaying]);

  const onToggleMute = useCallback(() => {
    setIsMuted((value) => !value);
  }, []);

  useEffect(() => {
    if (seekRequestTime === null || !current || !audio) return;
    setDisplayTime(seekRequestTime);
    lastSyncTimeRef.current = seekRequestTime;
    lastSyncAtRef.current = performance.now();
    seekToSeconds(seekRequestTime, false);
    clearSeekRequest();
  }, [audio, clearSeekRequest, current, seekRequestTime, seekToSeconds]);

  useMediaSession({
    onSeekBy,
    onNext: () => void jump(1),
    onPrev: () => void jump(-1),
    onTogglePlay,
    onSeekTo,
  });

  const autoAdvanceDuration = duration > 0 ? duration : Number(current?.duration ?? 0);

  useEffect(() => {
    autoAdvanceKeyRef.current = "";
  }, [current?.id]);

  useEffect(() => {
    if (!current || !audio) return;
    if (!playing || queue.length < 2 || autoAdvanceDuration <= 0) return;
    const remaining = autoAdvanceDuration - currentTime;
    if (remaining > 0.35) {
      autoAdvanceKeyRef.current = "";
      return;
    }

    const key = `${current.id}-${Math.round(autoAdvanceDuration)}`;
    if (autoAdvanceKeyRef.current === key) return;
    autoAdvanceKeyRef.current = key;
    setProgress(autoAdvanceDuration, autoAdvanceDuration);
    jump(1);
  }, [audio, autoAdvanceDuration, current, currentTime, jump, playing, queue.length, setProgress]);

  useEffect(() => {
    clearBackgroundAdvanceTimeout();
    if (!current || !audio) return;
    if (!playing || queue.length < 2 || autoAdvanceDuration <= 0) return;

    const remainingMs = Math.max(0, (autoAdvanceDuration - currentTime) * 1000);
    if (remainingMs <= 0) return;

    backgroundAdvanceTimeoutRef.current = setTimeout(() => {
      if (autoAdvanceKeyRef.current.startsWith(`${current.id}-`)) return;
      const state = usePlayerStore.getState();
      if (!state.playing) return;
      if (!state.current || state.current.id !== current.id) return;
      if (state.queue.length < 2) return;

      const finalDuration = Number(state.duration || current.duration || 0);
      autoAdvanceKeyRef.current = `${current.id}-${Math.round(finalDuration)}`;
      setProgress(finalDuration, finalDuration);
      jump(1);
    }, Math.min(remainingMs + 700, 10 * 60 * 1000));

    return clearBackgroundAdvanceTimeout;
  }, [
    audio,
    autoAdvanceDuration,
    clearBackgroundAdvanceTimeout,
    current,
    currentTime,
    jump,
    playing,
    queue.length,
    setProgress,
  ]);

  if (!current || !audio) return null;

  const activeDuration = duration > 0 ? duration : Number(current.duration ?? 0);
  const progress = activeDuration > 0 ? Math.min(100, (displayTime / activeDuration) * 100) : 0;
  const sourceUrl = audio.url;
  const isYouTubeSource = /(?:youtube\.com|youtu\.be)/i.test(sourceUrl);
  const fallbackYoutubeUrl = `https://www.youtube.com/watch?v=${current.id}`;
  const canReopenVideo = current.type === "video" && !video.active;
  const accentSeed = `${current.id}-${current.creator}-${current.title}`;
  const accentStrong = accentColorFromSeed(accentSeed, 78, 57, 1);
  const hideMiniBar = location.pathname === "/now-playing";
  const volumeFill = Math.round((isMuted ? 0 : volume) * 100);

  return (
    <>
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
        <ReactPlayer
          key={`audio-${current.id}`}
          ref={playerRef}
          src={sourceUrl}
          playing={playing && !video.active}
          volume={isMuted ? 0 : volume}
          muted={isMuted}
          width="1px"
          height="1px"
          progressInterval={100}
          config={
            isYouTubeSource
              ? {
                  youtube: {
                    playerVars: {
                      autoplay: 1,
                      playsinline: 1,
                      modestbranding: 1,
                      rel: 0,
                      iv_load_policy: 3,
                      vq: "small",
                    },
                  },
                }
              : {
                  file: {
                    attributes: {
                      preload: "auto",
                    },
                  },
                }
          }
          onReady={() => {
            setAudioError(null);
            setLoadingWithGuard(false);
          }}
          onDuration={(nextDuration: number) => {
            const safeDuration =
              Number(nextDuration) || readDuration() || Number(current.duration) || duration;
            const safeTime = readCurrentTime() || currentTime;
            setProgress(safeTime, safeDuration);
          }}
          onProgress={(state: ProgressState) => {
            if (Date.now() < seekLockUntilRef.current) return;
            const safeTime = Number(state.playedSeconds) || readCurrentTime();
            const safeDuration = readDuration() || Number(current.duration) || duration;
            setProgress(safeTime, safeDuration);
            if (playing && safeTime > 0.2) {
              setLoadingWithGuard(false);
            }
          }}
          onWaiting={() => {
            if (playing) setLoadingWithGuard(true);
          }}
          onPlaying={() => {
            setLoadingWithGuard(false);
            seekLockUntilRef.current = 0;
          }}
          onPause={() => {
            setLoadingWithGuard(false);
          }}
          onEnded={() => {
            const endAt = readCurrentTime();
            const finalDuration = endAt > 0 ? endAt : readDuration() || Number(current.duration) || duration;
            autoAdvanceKeyRef.current = `${current.id}-${Math.round(finalDuration)}`;
            setProgress(finalDuration, finalDuration);
            jump(1);
          }}
          onError={(e: any, data?: any) => {
            const code = typeof e === "number" ? e : data?.code;
            const fallbackMessage =
              typeof data?.message === "string"
                ? data.message
                : typeof e?.message === "string"
                ? e.message
                : "Playback source error";

            const label =
              (typeof code === "number" ? YT_ERROR_LABELS[code] : null) ??
              (e instanceof Error ? e.message : fallbackMessage);

            console.error(`[audio] ReactPlayer error: ${label}`, { e, data });
            setAudioError(
              label.includes("embedded")
                ? "This song cannot be embedded (owner restricted)."
                : `Playback failed: ${label}`
            );
            setLoadingWithGuard(false);
            setPlaying(false);

            if (!isYouTubeSource) {
              playAudio(current, { url: fallbackYoutubeUrl, mimeType: "audio/mpeg" }, queue);
              return;
            }

            void recoverCurrentTrack();
          }}
        />
      </div>

      {!video.active && !hideMiniBar ? (
        <div
          className="fixed bottom-16 left-0 right-0 z-50 border-t border-border/80 bg-background/95 px-4 py-3 backdrop-blur md:bottom-0"
          role="region"
          aria-label="Audio player"
        >
          <div
            className="group mb-3 h-1 w-full cursor-pointer rounded-full bg-border/90"
            onClick={(e) => {
              e.stopPropagation();
              if (!activeDuration) return;
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              onSeekTo(ratio * activeDuration);
            }}
            role="slider"
            aria-label="Seek"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                onSeekBy(10);
              }
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                onSeekBy(-10);
              }
            }}
          >
            <div
              className="relative h-full rounded-full"
              style={{ width: `${progress}%`, backgroundColor: accentStrong }}
            >
              <div className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 translate-x-1 rounded-full bg-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </div>

          {audioError ? (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{audioError}</span>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (canReopenVideo) {
                  openVideoOverlay();
                  return;
                }
                if (current.type === "music") {
                  openSongSheet();
                }
              }}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition hover:bg-muted/60"
              aria-label="Open now playing details"
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                {current.thumbnail ? (
                  <img src={current.thumbnail} alt={current.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <Music className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                {isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{current.title}</p>
                <p className="truncate text-xs text-muted-foreground">{current.creator}</p>
                <p className="text-xs text-muted-foreground/90">
                  {formatDuration(Math.floor(displayTime))} / {formatDuration(Math.floor(activeDuration))}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSeekBy(-30)}
                aria-label="Rewind 30 seconds"
                className="hidden lg:inline-flex"
              >
                -30s
              </Button>

              <Button variant="ghost" size="icon" onClick={() => jump(-1)} aria-label="Previous track">
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSeekBy(-10)}
                aria-label="Rewind 10 seconds"
                className="hidden md:inline-flex"
              >
                <Rewind className="h-4 w-4" />
              </Button>

              <Button
                variant="default"
                size="icon"
                onClick={onTogglePlay}
                disabled={isLoading && playing}
                className="h-10 w-10 rounded-full hover:brightness-110"
                style={{ backgroundColor: accentStrong }}
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
                className="hidden md:inline-flex"
              >
                <FastForward className="h-4 w-4" />
              </Button>

              <Button variant="ghost" size="icon" onClick={() => jump(1)} aria-label="Next track">
                <SkipForward className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSeekBy(30)}
                aria-label="Skip 30 seconds"
                className="hidden lg:inline-flex"
              >
                +30s
              </Button>
            </div>

            <div className="hidden items-center gap-2 md:flex" onClick={(e) => e.stopPropagation()}>
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {formatDuration(Math.floor(displayTime))} / {formatDuration(Math.floor(activeDuration))}
              </span>
              <button
                onClick={onToggleMute}
                aria-label={isMuted ? "Unmute" : "Mute"}
                className="text-muted-foreground transition-colors hover:text-foreground"
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
                className="h-1 w-24 appearance-none rounded-full bg-border md:w-28 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:border-0 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:border-0"
                style={{
                  accentColor: accentStrong,
                  background: `linear-gradient(to right, ${accentStrong} 0%, ${accentStrong} ${volumeFill}%, hsl(var(--border)) ${volumeFill}%, hsl(var(--border)) 100%)`,
                }}
                aria-label="Volume"
              />
            </div>

            <div className="hidden md:block" onClick={(e) => e.stopPropagation()}>
              <SleepTimer />
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
};
