import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Loader2,
  Plus,
  ThumbsUp,
  ChevronDown,
  ChevronUp,
  Captions,
  ExternalLink
} from "lucide-react";
import _ReactPlayer from "react-player";
import { Button } from "@/components/ui/button";
import { mediaApi, playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { formatDuration } from "@/lib/utils";
import { accentColorFromSeed } from "@/lib/accent-color";
import type { MediaItem } from "@/types/media";

const ReactPlayer = _ReactPlayer as any;

const YT_ERROR_LABELS: Record<number, string> = {
  2: "Invalid video ID",
  5: "HTML5 player error",
  100: "Video not found or removed",
  101: "Embedded playback disabled by owner",
  150: "Embedded playback disabled by owner"
};

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
  const [showDescription, setShowDescription] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingToPlaylist, setSavingToPlaylist] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relatedHydrationRef = useRef<Set<string>>(new Set());
  const playerRef = useRef<any | null>(null);

  const shouldOpen = video.active && !!current?.id && current?.type === "video";

  useEffect(() => {
    if (shouldOpen) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsMounted(true);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return;
    }

    if (!isMounted) return;
    setIsVisible(false);
    closeTimerRef.current = setTimeout(() => {
      setIsMounted(false);
      closeTimerRef.current = null;
    }, 300);
  }, [isMounted, shouldOpen]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (current?.id) {
      setVideoError(null);
      setIsBuffering(true);
      setCurrentTime(0);
      setDuration(0);
      setShowDescription(false);
      setSaveMessage(null);
      setCaptionsEnabled(false);
    }
  }, [current?.id]);

  useEffect(() => {
    if (!shouldOpen || !current?.id) return;
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
  }, [current?.id, shouldOpen, updateVideoSession, video.related.length]);

  const addCurrentToFavorites = useCallback(async () => {
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
  }, [current, savingToPlaylist]);

  const playRelated = useCallback(
    async (item: MediaItem) => {
      if (loadingRelatedId) return;
      setRelatedError(null);
      setLoadingRelatedId(item.id);
      setSaveMessage(null);

      try {
        playVideo({ ...item, type: "video" }, [], {
          related: video.related,
          uploader: item.creator,
          uploaderAvatarUrl: item.creatorAvatarUrl ?? null
        });
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
    },
    [loadingRelatedId, playVideo, updateVideoSession, video.related]
  );

  if (!isMounted || !current || current.type !== "video") return null;

  const ytUrl = `https://www.youtube.com/watch?v=${current.id}`;
  const descriptionText = video.description?.trim() || "No description available for this video.";
  const relatedItems = video.related.slice(0, 20);
  const activeDuration = duration > 0 ? duration : Number(current.duration ?? 0);
  const progress = activeDuration > 0 ? Math.min(100, (currentTime / activeDuration) * 100) : 0;
  const channelInitial = (video.uploader || current.creator || "A").charAt(0).toUpperCase();
  const accentSeed = `${current.id}-${current.creator}-${current.title}`;
  const accentStrong = accentColorFromSeed(accentSeed, 78, 57, 1);
  const accentSoft = accentColorFromSeed(accentSeed, 72, 52, 0.32);

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col bg-black/95 transition-transform duration-300 ease-out ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{
        backgroundImage: `linear-gradient(180deg, ${accentSoft} 0%, rgba(0,0,0,0.94) 24%, rgba(0,0,0,0.98) 100%)`
      }}
    >
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

          <div className="relative w-full bg-black lg:ml-4 lg:w-[min(62vw,980px)]" style={{ aspectRatio: "16 / 9" }}>
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
              controls
              width="100%"
              height="100%"
              style={{ position: "absolute", inset: 0 }}
              config={{
                youtube: {
                  playerVars: {
                    autoplay: 1,
                    controls: 1,
                    rel: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    iv_load_policy: 3,
                    fs: 1,
                    disablekb: 0,
                    cc_load_policy: captionsEnabled ? 1 : 0
                  }
                }
              }}
              onReady={() => {
                setIsBuffering(false);
                setVideoError(null);
              }}
              onDuration={(value: number) => {
                const safeDuration = Number.isFinite(value) && value > 0 ? value : 0;
                setDuration(safeDuration);
                setProgress(currentTime, safeDuration);
              }}
              onProgress={(state: { playedSeconds?: number }) => {
                const nextTime = Number(state.playedSeconds);
                const safeTime = Number.isFinite(nextTime) ? nextTime : 0;
                const resolvedDuration =
                  (typeof playerRef.current?.getDuration === "function"
                    ? Number(playerRef.current.getDuration())
                    : 0) || activeDuration;
                setCurrentTime(safeTime);
                setProgress(safeTime, resolvedDuration);
              }}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsBuffering(false);
                setPlaying(true);
              }}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                if (videoAutoplay && relatedItems.length > 0) {
                  void playRelated(relatedItems[0]!);
                  return;
                }
                setPlaying(false);
              }}
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
          </div>

          <div className="space-y-3 px-4 py-4 lg:ml-4 lg:w-[min(62vw,980px)]">
            <h3 className="text-base font-semibold leading-snug md:text-lg">{current.title}</h3>

            <div className="space-y-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${progress}%`, backgroundColor: accentStrong }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-white/55">
                <span>{formatDuration(Math.floor(currentTime))}</span>
                <span>{formatDuration(Math.floor(activeDuration))}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex min-w-0 items-center gap-3">
                {video.uploaderAvatarUrl || current.creatorAvatarUrl ? (
                  <img
                    src={video.uploaderAvatarUrl || current.creatorAvatarUrl || ""}
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

                <button
                  type="button"
                  onClick={() => setCaptionsEnabled((prev) => !prev)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                    captionsEnabled
                      ? "border-white bg-white text-black"
                      : "border-white/20 bg-white/5 text-white/75 hover:bg-white/10"
                  }`}
                >
                  <Captions className="h-3.5 w-3.5" />
                  CC
                </button>

                <button
                  type="button"
                  onClick={() => setVideoAutoplay(!videoAutoplay)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    videoAutoplay
                      ? "border-white bg-white text-black"
                      : "border-white/20 bg-white/5 text-white/75 hover:bg-white/10"
                  }`}
                >
                  Auto {videoAutoplay ? "On" : "Off"}
                </button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void addCurrentToFavorites()}
                  disabled={savingToPlaylist}
                  aria-label="Add video to playlist"
                >
                  {savingToPlaylist ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>

                <a
                  href={ytUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {saveMessage ? <p className="text-xs text-white/70">{saveMessage}</p> : null}

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p
                className={`break-words whitespace-pre-wrap text-sm text-white/80 ${
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
                        <div className="mt-1 flex items-center gap-2">
                          {item.creatorAvatarUrl ? (
                            <img
                              src={item.creatorAvatarUrl}
                              alt={item.creator}
                              className="h-4 w-4 rounded-full object-cover"
                            />
                          ) : (
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold">
                              {(item.creator || "A").charAt(0).toUpperCase()}
                            </span>
                          )}
                          <p className="line-clamp-1 text-xs text-white/60">{item.creator}</p>
                        </div>
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
                  <div className="mt-1 flex items-center gap-2">
                    {item.creatorAvatarUrl ? (
                      <img src={item.creatorAvatarUrl} alt={item.creator} className="h-4 w-4 rounded-full object-cover" />
                    ) : (
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold">
                        {(item.creator || "A").charAt(0).toUpperCase()}
                      </span>
                    )}
                    <p className="line-clamp-1 text-xs text-white/60">{item.creator}</p>
                  </div>
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
