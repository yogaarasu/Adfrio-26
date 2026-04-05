import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Loader2,
  Rewind,
  FastForward,
  Play,
  Pause,
  Maximize2,
  Settings,
  Check,
  Plus,
  ThumbsUp,
  ChevronDown,
  ChevronUp,
  Captions
} from "lucide-react";
import _ReactPlayer from "react-player";
import { Button } from "@/components/ui/button";
import { mediaApi, playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import { usePreferencesStore } from "@/store/preferences-store";
import type { MediaItem } from "@/types/media";
import { formatDuration } from "@/lib/utils";

const ReactPlayer = _ReactPlayer as any;

const YT_ERROR_LABELS: Record<number, string> = {
  2: "Invalid video ID",
  5: "HTML5 player error",
  100: "Video not found or removed",
  101: "Embedded playback disabled by owner",
  150: "Embedded playback disabled by owner"
};

const QUALITY_OPTIONS = [
  { label: "Auto", value: "default" },
  { label: "144p", value: "tiny" },
  { label: "240p", value: "small" },
  { label: "360p", value: "medium" },
  { label: "480p", value: "large" },
  { label: "720p HD", value: "hd720" },
  { label: "1080p Full HD", value: "hd1080" }
];

const formatLikes = (likes: number | null): string => {
  if (!likes || Number.isNaN(likes)) return "N/A";
  if (likes >= 1_000_000) return `${(likes / 1_000_000).toFixed(1)}M`;
  if (likes >= 1_000) return `${(likes / 1_000).toFixed(1)}K`;
  return String(likes);
};

export const GlobalVideoPlayer = () => {
  const current = usePlayerStore((state) => state.current);
  const video = usePlayerStore((state) => state.video);
  const clearVideo = usePlayerStore((state) => state.clearVideo);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const playing = usePlayerStore((state) => state.playing);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const updateVideoSession = usePlayerStore((state) => state.updateVideoSession);
  const videoAutoplay = usePreferencesStore((state) => state.videoAutoplay);
  const setVideoAutoplay = usePreferencesStore((state) => state.setVideoAutoplay);

  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [loadingRelatedId, setLoadingRelatedId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState("default");
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showDescription, setShowDescription] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingToPlaylist, setSavingToPlaylist] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relatedHydrationRef = useRef<Set<string>>(new Set());
  const seekLockUntilRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const seekRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerRef = useRef<any | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isOpen = video.active && !!current?.id;

  useEffect(() => {
    if (current?.id) {
      setVideoError(null);
      setIsBuffering(true);
      setCurrentTime(0);
      setDuration(0);
      setShowQualityMenu(false);
      setShowDescription(false);
      setSaveMessage(null);
      setCaptionsEnabled(false);
    }
  }, [current?.id]);

  useEffect(() => {
    if (!isOpen || !current?.id) return;
    if (video.related.length >= 20) return;
    if (relatedHydrationRef.current.has(current.id)) return;
    relatedHydrationRef.current.add(current.id);

    mediaApi
      .streams(current.id)
      .then((stream) => {
        updateVideoSession(current.id, {
          related: stream.related ?? [],
          description: stream.description,
          uploader: stream.uploader,
          uploaderAvatarUrl: stream.uploaderAvatarUrl ?? null,
          likes: stream.likes ?? null
        });
      })
      .catch(() => undefined);
  }, [current?.id, isOpen, updateVideoSession, video.related.length]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (seekRetryTimeoutRef.current) clearTimeout(seekRetryTimeoutRef.current);
    };
  }, []);

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

  const applySeek = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    if (typeof player.fastSeek === "function") {
      player.fastSeek(seconds);
      return;
    }
    if ("currentTime" in player) {
      player.currentTime = seconds;
      return;
    }
    if (typeof player.seekTo === "function") {
      player.seekTo(seconds, "seconds");
    }
  }, []);

  const seekToSeconds = useCallback((seconds: number) => {
    const dur = readDuration();
    const next = Math.max(0, Math.min(dur || Number.MAX_SAFE_INTEGER, seconds));
    pendingSeekRef.current = next;
    seekLockUntilRef.current = Date.now() + 1500;
    if (playing) setIsBuffering(true);
    setCurrentTime(next);
    setProgress(next, dur || duration);

    applySeek(next);

    if (seekRetryTimeoutRef.current) {
      clearTimeout(seekRetryTimeoutRef.current);
    }
    seekRetryTimeoutRef.current = setTimeout(() => {
      const target = pendingSeekRef.current;
      if (target === null) return;
      const now = readCurrentTime();
      if (now + 1 < target) {
        applySeek(target);
        seekLockUntilRef.current = Date.now() + 1200;
      }
    }, 450);
  }, [applySeek, duration, playing, readCurrentTime, readDuration, setProgress]);

  const seekBy = useCallback((seconds: number) => {
    const curr = readCurrentTime();
    seekToSeconds(curr + seconds);
  }, [readCurrentTime, seekToSeconds]);

  const seekTo = useCallback((ratio: number) => {
    const dur = duration || readDuration();
    if (!dur) return;
    seekToSeconds(ratio * dur);
  }, [duration, readDuration, seekToSeconds]);

  const syncCaptions = useCallback((enabled: boolean) => {
    const player = playerRef.current as {
      textTracks?: TextTrackList;
    } | null;
    const tracks = player?.textTracks ? Array.from(player.textTracks) : [];
    if (!tracks.length) return;

    tracks.forEach((track, index) => {
      track.mode = enabled && index === 0 ? "showing" : "disabled";
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const t1 = setTimeout(() => syncCaptions(captionsEnabled), 250);
    const t2 = setTimeout(() => syncCaptions(captionsEnabled), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [captionsEnabled, isOpen, syncCaptions, current?.id]);

  const handlePlaybackTick = useCallback((nextTime: number, nextDuration: number) => {
    const safeTime = Number.isFinite(nextTime) ? nextTime : readCurrentTime();
    const safeDuration = Number.isFinite(nextDuration) && nextDuration > 0
      ? nextDuration
      : readDuration() || duration;

    const pendingTarget = pendingSeekRef.current;
    if (pendingTarget !== null) {
      if (safeTime >= Math.max(0, pendingTarget - 1)) {
        pendingSeekRef.current = null;
        if (seekRetryTimeoutRef.current) {
          clearTimeout(seekRetryTimeoutRef.current);
          seekRetryTimeoutRef.current = null;
        }
        setIsBuffering(false);
      } else if (Date.now() >= seekLockUntilRef.current) {
        applySeek(pendingTarget);
        seekLockUntilRef.current = Date.now() + 1000;
        return;
      } else {
        return;
      }
    }

    setCurrentTime(safeTime);
    setProgress(safeTime, safeDuration);
  }, [applySeek, duration, readCurrentTime, readDuration, setProgress]);

  const addCurrentToFavorites = async () => {
    if (!current || savingToPlaylist) return;
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
        mediaType: "video",
        title: current.title,
        creator: current.creator,
        artwork: current.thumbnail,
        duration: current.duration
      });
      setSaveMessage("Saved to Favorites");
    } catch {
      setSaveMessage("Sign in to save videos");
    } finally {
      setSavingToPlaylist(false);
    }
  };

  const playRelated = useCallback(async (item: MediaItem) => {
    if (loadingRelatedId) return;
    setRelatedError(null);
    setLoadingRelatedId(item.id);
    setSaveMessage(null);

    try {
      playVideo({ ...item, type: "video" }, [], { related: video.related, uploader: item.creator });
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
      setRelatedError("Could not load related video. Please try another.");
    } finally {
      setLoadingRelatedId(null);
    }
  }, [loadingRelatedId, playVideo, updateVideoSession, video.related]);

  if (!isOpen) return null;

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const ytUrl = `https://www.youtube.com/watch?v=${current.id}`;
  const descriptionText = video.description?.trim() || "No description available for this video.";
  const channelInitial = (video.uploader || current.creator || "A").charAt(0).toUpperCase();
  const relatedItems = video.related.slice(0, 20);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3">
        <h2 className="max-w-xs truncate text-sm uppercase tracking-[0.16em] text-white/70">{current.title}</h2>
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

      <div className="flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 overflow-y-auto lg:overflow-hidden">
          {videoError ? (
            <div className="mx-3 mb-2 rounded-xl border border-red-500/30 bg-red-900/80 px-4 py-3 text-sm text-red-200">
              {videoError}
            </div>
          ) : null}

          <div
            ref={containerRef}
            className="relative w-full bg-black lg:ml-4 lg:w-[min(62vw,980px)]"
            style={{ aspectRatio: "16 / 9" }}
            onMouseMove={resetControlsTimer}
            onTouchStart={resetControlsTimer}
            onClick={() => {
              resetControlsTimer();
              setPlaying(!playing);
            }}
          >
            {isBuffering && !videoError ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-white/70" />
              </div>
            ) : null}

            <ReactPlayer
              key={`video-${current.id}`}
              ref={playerRef}
              src={ytUrl}
              playing={playing}
              controls={false}
              width="100%"
              height="100%"
              style={{ position: "absolute", inset: 0 }}
              config={{
                youtube: {
                  playerVars: {
                    autoplay: 1,
                    rel: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    iv_load_policy: 3,
                    cc_load_policy: captionsEnabled ? 1 : 0,
                    vq: selectedQuality
                  }
                }
              }}
              onReady={() => {
                setIsBuffering(false);
                setVideoError(null);
                syncCaptions(captionsEnabled);
                resetControlsTimer();
              }}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsBuffering(false);
                seekLockUntilRef.current = 0;
              }}
              onDurationChange={(e: any) => {
                const safeDuration = Number(e?.currentTarget?.duration) || readDuration();
                setDuration(safeDuration);
                setProgress(readCurrentTime() || currentTime, safeDuration);
              }}
              onTimeUpdate={(e: any) => {
                const nextTime = Number(e?.currentTarget?.currentTime);
                const nextDuration = Number(e?.currentTarget?.duration);
                handlePlaybackTick(nextTime, nextDuration);
              }}
              onProgress={(state: { playedSeconds?: number }) => {
                const nextTime = Number(state.playedSeconds);
                const nextDuration = readDuration() || duration;
                handlePlaybackTick(nextTime, nextDuration);
              }}
              onEnded={() => {
                if (videoAutoplay && relatedItems.length > 0) {
                  void playRelated(relatedItems[0]!);
                  return;
                }
                setPlaying(false);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={(e: any, data?: any) => {
                const code = typeof e === "number" ? e : data?.code;
                const fallbackMessage =
                  typeof data?.message === "string"
                    ? data.message
                    : typeof e?.message === "string"
                    ? e.message
                    : "Unknown player error";
                const label =
                  (typeof code === "number" ? YT_ERROR_LABELS[code] : null) ??
                  (e instanceof Error ? e.message : fallbackMessage);
                setVideoError(
                  label.includes("embedded")
                    ? "This video cannot be embedded (owner disabled it)."
                    : `Video failed to play: ${label}`
                );
                setIsBuffering(false);
                setPlaying(false);
              }}
            />

            <div
              className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${showControls || !playing ? "opacity-100" : "opacity-0"}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="group mx-4 mb-2 h-1.5 cursor-pointer rounded-full bg-white/25 hover:h-2.5 transition-all"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  seekTo((e.clientX - rect.left) / rect.width);
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  seekTo((e.clientX - rect.left) / rect.width);
                }}
              >
                <div
                  className="relative h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-2 rounded-full bg-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100" />
                </div>
              </div>

              <div className="flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-6">
                <button
                  onClick={() => setPlaying(!playing)}
                  className="text-white transition-colors hover:text-white/80"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
                </button>

                <button onClick={() => seekBy(-10)} className="text-white transition-colors hover:text-white/80" aria-label="Rewind 10s">
                  <Rewind className="h-5 w-5" />
                </button>
                <button onClick={() => seekBy(10)} className="text-white transition-colors hover:text-white/80" aria-label="Skip 10s">
                  <FastForward className="h-5 w-5" />
                </button>

                <span className="ml-1 text-xs tabular-nums text-white/80">
                  {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration))}
                </span>

                <div className="flex-1" />

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCaptionsEnabled((prev) => {
                      const next = !prev;
                      syncCaptions(next);
                      return next;
                    });
                  }}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                    captionsEnabled ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                  aria-label="Toggle captions"
                >
                  <Captions className="h-3.5 w-3.5" />
                  <span>CC</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setVideoAutoplay(!videoAutoplay);
                  }}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    videoAutoplay ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                  aria-label="Toggle autoplay"
                >
                  AUTO {videoAutoplay ? "ON" : "OFF"}
                </button>

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQualityMenu((v) => !v);
                    }}
                    className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20"
                    aria-label="Video quality"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>{QUALITY_OPTIONS.find((q) => q.value === selectedQuality)?.label ?? "Auto"}</span>
                  </button>

                  {showQualityMenu ? (
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
                          {selectedQuality === opt.value ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                          <span className={selectedQuality === opt.value ? "ml-0" : "ml-5"}>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={() => {
                    const el = containerRef.current;
                    if (!el) return;
                    if (document.fullscreenElement) {
                      void document.exitFullscreen();
                    } else {
                      void el.requestFullscreen();
                    }
                  }}
                  className="text-white transition-colors hover:text-white/80"
                  aria-label="Fullscreen"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3 px-4 py-4 lg:ml-4 lg:w-[min(62vw,980px)]">
            <h3 className="text-base font-semibold leading-snug md:text-lg">{current.title}</h3>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex min-w-0 items-center gap-3">
                {video.uploaderAvatarUrl ? (
                  <img
                    src={video.uploaderAvatarUrl}
                    alt={video.uploader || current.creator}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
                    {channelInitial}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{video.uploader || current.creator}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs text-white/80">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  <span>{formatLikes(video.likes ?? null)}</span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void addCurrentToFavorites()}
                  disabled={savingToPlaylist}
                  aria-label="Add video to playlist"
                >
                  {savingToPlaylist ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {saveMessage ? <p className="text-xs text-white/70">{saveMessage}</p> : null}

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p
                className={`text-sm text-white/80 whitespace-pre-wrap break-words ${
                  showDescription ? "max-h-56 overflow-y-auto pr-1" : "line-clamp-3"
                }`}
              >
                {descriptionText}
              </p>
              <button
                type="button"
                onClick={() => setShowDescription((prev) => !prev)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/70 hover:text-white"
              >
                {showDescription ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Show More
                  </>
                )}
              </button>
            </div>

            <div className="space-y-2 lg:hidden">
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">More Videos</h4>
              {relatedError ? <p className="text-sm text-amber-300">{relatedError}</p> : null}
              <div className="max-h-[48vh] overflow-y-auto pr-1">
                <div className="space-y-2">
                  {relatedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void playRelated(item)}
                      className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-2 text-left transition hover:border-white/20 hover:bg-white/10"
                      disabled={loadingRelatedId === item.id}
                    >
                      <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg">
                        <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                        {loadingRelatedId === item.id ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          </div>
                        ) : null}
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
          </div>
        </div>

        <aside className="hidden min-h-0 border-l border-white/10 lg:flex lg:flex-col">
          <div className="border-b border-white/10 px-4 py-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">More Videos</h4>
            {relatedError ? <p className="mt-2 text-sm text-amber-300">{relatedError}</p> : null}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            {relatedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void playRelated(item)}
                className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-2 text-left transition hover:border-white/20 hover:bg-white/10"
                disabled={loadingRelatedId === item.id}
              >
                <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg">
                  <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                  {loadingRelatedId === item.id ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-white/60">{item.creator}</p>
                  <p className="mt-1 text-xs text-white/40">{formatDuration(item.duration)}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
