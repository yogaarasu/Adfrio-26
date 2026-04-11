import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  Moon,
  Plus,
  Check,
  ExternalLink,
} from "lucide-react";
import _ReactPlayer from "react-player";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player-store";
import { useMediaSession } from "@/hooks/use-media-session";
import { SleepTimer } from "@/components/player/sleep-timer";
import { playlistApi } from "@/services/api";
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
  const recoveredIdRef = useRef<string | null>(null);
  const playerRef = useRef<any | null>(null);
  const seekLockUntilRef = useRef(0);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeSheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = usePlayerStore((s) => s.current);
  const audio = usePlayerStore((s) => s.audio);
  const video = usePlayerStore((s) => s.video);
  const playing = usePlayerStore((s) => s.playing);
  const volume = usePlayerStore((s) => s.volume);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const queue = usePlayerStore((s) => s.queue);
  const audioError = usePlayerStore((s) => s.audioError);
  const sleepUntil = usePlayerStore((s) => s.sleepUntil);

  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const playAudio = usePlayerStore((s) => s.playAudio);
  const setAudioError = usePlayerStore((s) => s.setAudioError);
  const openVideoOverlay = usePlayerStore((s) => s.openVideoOverlay);

  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSheetMounted, setIsSheetMounted] = useState(false);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [savingToPlaylist, setSavingToPlaylist] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
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
      if (closeSheetTimerRef.current) {
        clearTimeout(closeSheetTimerRef.current);
      }
    },
    [clearLoadingTimeout]
  );

  useEffect(() => {
    if (!isSheetMounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSheetMounted]);

  useEffect(() => {
    if (!current || current.type !== "music") {
      setIsSheetVisible(false);
      setIsSheetMounted(false);
      setShowSleepMenu(false);
      setSaveMessage(null);
      return;
    }
    setSaveMessage(null);
  }, [current]);

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
    if (closeSheetTimerRef.current) {
      clearTimeout(closeSheetTimerRef.current);
      closeSheetTimerRef.current = null;
    }
    setIsSheetMounted(true);
    requestAnimationFrame(() => {
      setIsSheetVisible(true);
    });
  }, [current?.type]);

  const closeSongSheet = useCallback(() => {
    setIsSheetVisible(false);
    setShowSleepMenu(false);
    if (closeSheetTimerRef.current) {
      clearTimeout(closeSheetTimerRef.current);
    }
    closeSheetTimerRef.current = setTimeout(() => {
      setIsSheetMounted(false);
    }, 480);
  }, []);

  const addCurrentToFavorites = useCallback(async () => {
    if (!current || current.type !== "music" || savingToPlaylist) return;
    setSavingToPlaylist(true);
    setSaveMessage(null);
    try {
      const playlists = await playlistApi.list();
      let favorites = playlists.find((entry) => entry.name.toLowerCase() === "favorites");
      if (!favorites) {
        await playlistApi.create("Favorites", "Auto-generated favorites playlist");
        const refreshed = await playlistApi.list();
        favorites = refreshed.find((entry) => entry.name.toLowerCase() === "favorites");
      }
      if (!favorites) return;

      await playlistApi.addItem(favorites._id, {
        mediaId: current.id,
        mediaType: "music",
        title: current.title,
        creator: current.creator,
        artwork: current.thumbnail,
        duration: current.duration,
      });
      setSaveMessage("Song added to Favorites");
    } catch {
      setSaveMessage("Sign in to save songs");
    } finally {
      setSavingToPlaylist(false);
    }
  }, [current, savingToPlaylist]);

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

  useMediaSession({
    onSeekBy,
    onNext: () => void jump(1),
    onPrev: () => void jump(-1),
    onTogglePlay,
    onSeekTo,
  });

  if (!current || !audio) return null;

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const sourceUrl = audio.url;
  const isYouTubeSource = /(?:youtube\.com|youtu\.be)/i.test(sourceUrl);
  const fallbackYoutubeUrl = `https://www.youtube.com/watch?v=${current.id}`;
  const canReopenVideo = current.type === "video" && !video.active;
  const activeDuration = duration > 0 ? duration : Number(current.duration ?? 0);
  const sleepMinutesLeft = sleepUntil ? Math.max(0, Math.round((sleepUntil - Date.now()) / 60000)) : null;
  const accentSeed = `${current.id}-${current.creator}-${current.title}`;
  const accentStrong = useMemo(() => accentColorFromSeed(accentSeed, 78, 57, 1), [accentSeed]);
  const accentSoft = useMemo(() => accentColorFromSeed(accentSeed, 72, 52, 0.35), [accentSeed]);
  const accentGlow = useMemo(() => accentColorFromSeed(accentSeed, 86, 62, 0.28), [accentSeed]);
  const youtubeTrackUrl = `https://www.youtube.com/watch?v=${current.id}`;

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
          progressInterval={500}
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

      {!video.active ? (
        <div
          className="fixed bottom-16 left-0 right-0 z-50 border-t border-white/20 px-4 py-3 backdrop-blur-md md:bottom-0"
          style={{
            backgroundImage: `linear-gradient(180deg, ${accentSoft} 0%, rgba(0,0,0,0.9) 42%, rgba(0,0,0,0.96) 100%)`,
            boxShadow: `0 -12px 34px ${accentGlow}`
          }}
          role="region"
          aria-label="Audio player"
        >
          <div
            className="group mb-3 h-1.5 w-full cursor-pointer rounded-full bg-white/15"
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
              className="relative h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%`, backgroundColor: accentStrong }}
            >
              <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1.5 rounded-full bg-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100" />
            </div>
          </div>

          {audioError ? (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300">
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
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition hover:bg-white/5"
              aria-label="Open now playing details"
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg shadow-lg">
                {current.thumbnail ? (
                  <img src={current.thumbnail} alt={current.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/10">
                    <Music className="h-5 w-5 text-white/50" />
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
                <p className="truncate text-xs text-white/60">{current.creator}</p>
                <p className="text-xs text-white/40">
                  {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(activeDuration))}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
            </div>

            <div className="hidden items-center gap-2 md:flex" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={onToggleMute}
                aria-label={isMuted ? "Unmute" : "Mute"}
                className="text-white/60 transition-colors hover:text-white"
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
                className="w-24"
                style={{ accentColor: accentStrong }}
                aria-label="Volume"
              />
            </div>

            <div className="hidden md:block" onClick={(e) => e.stopPropagation()}>
              <SleepTimer />
            </div>
          </div>
        </div>
      ) : null}

      {isSheetMounted && current.type === "music" ? (
        <div className="fixed inset-0 z-[55] md:hidden" role="dialog" aria-modal="true" aria-label="Now playing">
          <button
            type="button"
            className={`absolute inset-0 bg-black/80 transition-opacity duration-500 ${
              isSheetVisible ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeSongSheet}
            aria-label="Close player"
          />

          <div
            className={`absolute inset-0 flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isSheetVisible ? "translate-y-0" : "translate-y-full"
            }`}
            style={{
              backgroundImage: `linear-gradient(180deg, ${accentSoft} 0%, rgba(8,8,8,0.96) 36%, rgba(4,4,4,1) 100%)`,
              boxShadow: `0 -24px 44px ${accentGlow}`
            }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />
            <div className="flex items-center justify-start px-3 pt-4">
              <Button variant="ghost" size="icon" onClick={closeSongSheet} aria-label="Close expanded player">
                <ChevronDown className="h-6 w-6" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-36 pt-2">
              <div className="mx-auto max-w-xl">
                <div className="mx-auto aspect-square w-full overflow-hidden rounded-2xl border border-white/15 shadow-2xl shadow-black/50">
                  <img src={current.thumbnail} alt={current.title} className="h-full w-full object-cover" />
                </div>

                <div className="mt-6 text-center">
                  <h3 className="line-clamp-2 text-xl font-semibold">{current.title}</h3>
                  <p className="mt-1 text-sm text-white/65">{current.creator}</p>
                </div>

                <div className="mt-5 space-y-2">
                  <div
                    className="group h-1.5 w-full cursor-pointer rounded-full bg-white/20"
                    onClick={(e) => {
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
                  >
                    <div
                      className="relative h-full rounded-full transition-all duration-200"
                      style={{ width: `${progress}%`, backgroundColor: accentStrong }}
                    >
                      <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1.5 rounded-full bg-white opacity-0 transition-opacity group-active:opacity-100" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>{formatDuration(Math.floor(currentTime))}</span>
                    <span>{formatDuration(Math.floor(activeDuration))}</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                    <p className="text-white/55">Queue</p>
                    <p className="mt-1 font-semibold text-white">{Math.max(queue.length, 1)} tracks</p>
                  </div>
                  <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                    <p className="text-white/55">Sleep Timer</p>
                    <p className="mt-1 font-semibold text-white">
                      {sleepMinutesLeft !== null && sleepMinutesLeft > 0 ? `${sleepMinutesLeft} min left` : "Off"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <a
                    href={youtubeTrackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/85 transition hover:bg-white/10"
                  >
                    Open On YouTube
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                {saveMessage ? <p className="mt-3 text-center text-xs text-white/70">{saveMessage}</p> : null}
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/80 px-4 pb-5 pt-4 backdrop-blur-md">
              <div className="relative flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void addCurrentToFavorites()}
                  disabled={savingToPlaylist}
                  aria-label="Add song to favorites"
                >
                  {savingToPlaylist ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
                </Button>

                <div className="flex items-center justify-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => jump(-1)} aria-label="Previous track">
                    <SkipBack className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onSeekBy(-10)} aria-label="Rewind 10 seconds">
                    <Rewind className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="default"
                    size="icon"
                    onClick={onTogglePlay}
                    disabled={isLoading && playing}
                    className="h-12 w-12 rounded-full hover:brightness-110"
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
                  <Button variant="ghost" size="icon" onClick={() => onSeekBy(10)} aria-label="Skip 10 seconds">
                    <FastForward className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => jump(1)} aria-label="Next track">
                    <SkipForward className="h-5 w-5" />
                  </Button>
                </div>

                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSleepMenu((value) => !value)}
                    aria-label="Sleep timer"
                  >
                    <Moon className={`h-5 w-5 ${sleepUntil ? "text-indigo-300" : ""}`} />
                  </Button>

                  {showSleepMenu ? (
                    <div className="absolute bottom-12 right-0 w-36 rounded-xl border border-white/15 bg-black/95 p-2 shadow-xl">
                      {[15, 30, 60].map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() => {
                            setSleepTimer(minutes);
                            setShowSleepMenu(false);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm text-white/85 transition hover:bg-white/10"
                        >
                          <span>{minutes} min</span>
                          {sleepMinutesLeft !== null && Math.abs(sleepMinutesLeft - minutes) <= 1 ? (
                            <Check className="h-3.5 w-3.5 text-indigo-300" />
                          ) : null}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setSleepTimer(null);
                          setShowSleepMenu(false);
                        }}
                        className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm text-white/70 transition hover:bg-white/10"
                      >
                        Off
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
