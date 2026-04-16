import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus, ThumbsUp, X } from "lucide-react";
import _ReactPlayer from "react-player";
import { Button } from "@/components/ui/button";
import { mediaApi, playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";
import { accentColorFromSeed } from "@/lib/accent-color";
import { formatDuration } from "@/lib/utils";
import type { MediaItem } from "@/types/media";

const ReactPlayer = _ReactPlayer as any;

const YT_ERROR_LABELS: Record<number, string> = {
  2: "Invalid video ID",
  5: "HTML5 player error",
  100: "Video not found or removed",
  101: "Embedded playback disabled by owner",
  150: "Embedded playback disabled by owner",
};

const formatLikes = (likes: number | null): string => {
  if (!likes || Number.isNaN(likes)) return "N/A";
  if (likes >= 1_000_000) return `${(likes / 1_000_000).toFixed(1)}M`;
  if (likes >= 1_000) return `${(likes / 1_000).toFixed(1)}K`;
  return String(likes);
};

const UNKNOWN_VALUE_PATTERN = /^(unknown(\s+(creator|video|title|channel))?|n\/a|none)$/i;

const hasMeaningfulText = (value: string | null | undefined): boolean => {
  const text = (value ?? "").trim();
  return text.length > 0 && !UNKNOWN_VALUE_PATTERN.test(text);
};

const isValidRelatedVideo = (item: MediaItem, currentId: string): boolean => {
  if (!item?.id || item.id === currentId) return false;
  if (item.type !== "video") return false;
  return hasMeaningfulText(item.title) && hasMeaningfulText(item.creator);
};

const sanitizeRelatedItems = (items: MediaItem[], currentId: string): MediaItem[] => {
  const byId = new Map<string, MediaItem>();
  for (const item of items) {
    if (!isValidRelatedVideo(item, currentId) || byId.has(item.id)) continue;
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
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

  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [loadingRelatedId, setLoadingRelatedId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingToPlaylist, setSavingToPlaylist] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [descriptionTop, setDescriptionTop] = useState<number | null>(null);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relatedHydrationAttemptsRef = useRef<Map<string, number>>(new Map());
  const playerRef = useRef<any | null>(null);
  const titleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const videoFrameRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const shouldOpen = video.active && !!current?.id && current?.type === "video";

  useEffect(() => {
    if (shouldOpen) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsMounted(true);
      requestAnimationFrame(() => setIsVisible(true));
      return;
    }

    if (!isMounted) return;
    setIsVisible(false);
    closeTimerRef.current = setTimeout(() => {
      setIsMounted(false);
      closeTimerRef.current = null;
      setDescriptionOpen(false);
    }, 300);
  }, [isMounted, shouldOpen]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!current?.id) return;
    setVideoError(null);
    setIsBuffering(true);
    setCurrentTime(0);
    setDuration(0);
    setSaveMessage(null);
    setDescriptionOpen(false);
    setDescriptionTop(null);
    relatedHydrationAttemptsRef.current.set(current.id, 0);
  }, [current?.id]);

  const syncDescriptionTop = useCallback(() => {
    const trigger = titleTriggerRef.current;
    const frame = videoFrameRef.current;
    let nextTop = 120;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

    if (isDesktop && frame) {
      const frameRect = frame.getBoundingClientRect();
      nextTop = Math.round(frameRect.top + frameRect.height * 0.5);
    } else {
      const frameBottom = frame ? Math.round(frame.getBoundingClientRect().bottom + 8) : null;
      const titleTop = trigger ? Math.round(trigger.getBoundingClientRect().top) : null;
      if (frameBottom !== null && titleTop !== null) {
        nextTop = Math.max(frameBottom, titleTop);
      } else if (titleTop !== null) {
        nextTop = titleTop;
      } else if (frameBottom !== null) {
        nextTop = frameBottom;
      }
    }

    const minTop = 64;
    const maxTop = Math.max(0, window.innerHeight - 140);
    setDescriptionTop(Math.max(minTop, Math.min(nextTop, maxTop)));
  }, []);

  const toggleDescription = useCallback(() => {
    if (descriptionOpen) {
      setDescriptionOpen(false);
      return;
    }
    syncDescriptionTop();
    setDescriptionOpen(true);
  }, [descriptionOpen, syncDescriptionTop]);

  useEffect(() => {
    if (!descriptionOpen) return;
    syncDescriptionTop();
    const onResize = () => syncDescriptionTop();
    const onScroll = () => syncDescriptionTop();
    const scrollHost = scrollContainerRef.current;
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    scrollHost?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      scrollHost?.removeEventListener("scroll", onScroll);
    };
  }, [descriptionOpen, syncDescriptionTop]);

  const hydrateVideoSession = useCallback(
    async (item: MediaItem) => {
      const stream = await mediaApi.streams(item.id);
      let related = sanitizeRelatedItems(stream.related ?? [], item.id);

      if (related.length < 8) {
        try {
          const fallbackQuery = hasMeaningfulText(item.creator) ? `${item.title} ${item.creator}` : item.title;
          const searchFallback = await mediaApi.search(fallbackQuery, "video");
          const merged = [...related, ...(searchFallback.items ?? [])];
          related = sanitizeRelatedItems(merged, item.id).slice(0, 24);
        } catch {
          // ignore fallback search failure
        }
      }

      updateVideoSession(item.id, {
        related,
        description: stream.description,
        uploader: stream.uploader,
        uploaderAvatarUrl: stream.uploaderAvatarUrl ?? null,
        likes: stream.likes ?? null,
      });
    },
    [updateVideoSession]
  );

  useEffect(() => {
    if (!shouldOpen || !current?.id) return;
    const attempts = relatedHydrationAttemptsRef.current.get(current.id) ?? 0;
    if (attempts > 0 && video.related.length >= 12) return;
    if (attempts >= 3) return;
    relatedHydrationAttemptsRef.current.set(current.id, attempts + 1);

    let cancelled = false;
    void hydrateVideoSession(current).catch(() => {
      if (cancelled) return;
      if (attempts >= 2 && video.related.length === 0) {
        setRelatedError("More videos are loading slowly. Please try again.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [current, hydrateVideoSession, shouldOpen, video.related.length]);

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
        duration: current.duration,
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
        const started = playVideo({ ...item, type: "video" }, [], {
          related: video.related,
          uploader: item.creator,
          uploaderAvatarUrl: item.creatorAvatarUrl ?? null,
        });
        if (!started) return;
        relatedHydrationAttemptsRef.current.set(item.id, 0);
        await hydrateVideoSession({ ...item, type: "video" });
      } catch {
        setRelatedError("Could not load related video. Please try another.");
      } finally {
        setLoadingRelatedId(null);
      }
    },
    [hydrateVideoSession, loadingRelatedId, playVideo, video.related]
  );

  const onVideoEnded = useCallback(() => {
    if (loadingRelatedId) {
      setPlaying(false);
      return;
    }
    const next = video.related.find((item) => !!current?.id && isValidRelatedVideo(item, current.id));
    if (!next) {
      setPlaying(false);
      return;
    }
    void playRelated(next);
  }, [current?.id, loadingRelatedId, playRelated, setPlaying, video.related]);

  if (!isMounted || !current || current.type !== "video") return null;

  const ytUrl = `https://www.youtube.com/watch?v=${current.id}`;
  const relatedItems = sanitizeRelatedItems(video.related, current.id).slice(0, 18);
  const activeDuration = duration > 0 ? duration : Number(current.duration ?? 0);
  const channelName =
    [video.uploader, current.creator, relatedItems[0]?.creator]
      .map((entry) => (entry ?? "").trim())
      .find((entry) => hasMeaningfulText(entry)) ?? "YouTube";
  const channelAvatar =
    video.uploaderAvatarUrl ||
    current.creatorAvatarUrl ||
    relatedItems.find((entry) => entry.creator === channelName)?.creatorAvatarUrl ||
    null;
  const channelInitial = channelName.charAt(0).toUpperCase();
  const accentSeed = `${current.id}-${current.creator}-${current.title}`;
  const accentSoft = accentColorFromSeed(accentSeed, 72, 52, 0.32);
  const descriptionText = video.description?.trim() || "No description available for this video.";

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col bg-background/95 transition-transform duration-300 ease-out ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{
        backgroundImage: `linear-gradient(180deg, ${accentSoft} 0%, hsl(var(--background) / 0.95) 24%, hsl(var(--background)) 100%)`,
      }}
    >
      <header className="z-30 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-[1400px] items-center justify-start px-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={clearVideo}
            className="bg-muted/70 hover:bg-muted"
            aria-label="Close video player"
          >
            <ChevronDown className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {videoError ? (
          <div className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-[1400px] rounded-xl border border-red-500/30 bg-red-900/80 px-4 py-3 text-sm text-red-200">
            {videoError}
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-[1400px] px-4 py-4 pb-24">
          <div className="lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)] lg:gap-6">
            <div
              ref={videoFrameRef}
              className="sticky top-0 z-20 w-full overflow-hidden rounded-xl border border-border bg-card lg:relative lg:top-auto lg:col-start-1 lg:row-start-1"
              style={{ aspectRatio: "16 / 9" }}
            >
              {isBuffering && !videoError ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <Loader2 className="h-12 w-12 animate-spin text-foreground/70" />
                </div>
              ) : null}
              <div className="pointer-events-none absolute right-2 top-2 z-20 h-8 w-20 rounded-md bg-black/92" aria-hidden="true" />

              <ReactPlayer
                key={`video-${current.id}`}
                ref={playerRef}
                src={ytUrl}
                playing={playing}
                controls
                progressInterval={200}
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
                      showinfo: 0,
                      fs: 1,
                      disablekb: 0,
                      cc_load_policy: 1,
                    },
                  },
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
                onEnded={onVideoEnded}
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

            <section className="mt-4 space-y-4 lg:mt-0 lg:col-start-1 lg:row-start-2">

              <button
                ref={titleTriggerRef}
                type="button"
                className="w-full rounded-lg text-left"
                onClick={toggleDescription}
                aria-label={descriptionOpen ? "Close description" : "Open description"}
              >
                <span className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold leading-snug md:text-lg">{current.title}</h3>
                  <ChevronDown
                    className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      descriptionOpen ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-4 py-2 text-sm font-medium text-foreground"
                  aria-label="Like video"
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span>{formatLikes(video.likes ?? null)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void addCurrentToFavorites()}
                  disabled={savingToPlaylist}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-70"
                  aria-label="Add video to playlist"
                >
                  {savingToPlaylist ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span>Add Playlist</span>
                </button>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3">
                {channelAvatar ? (
                  <img
                    src={channelAvatar}
                    alt={channelName}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {channelInitial}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{channelName}</p>
                </div>
              </div>

              {saveMessage ? <p className="text-xs text-muted-foreground">{saveMessage}</p> : null}
            </section>

            <aside className="mt-5 space-y-2 lg:col-start-2 lg:row-span-2 lg:mt-0 lg:max-h-[calc(100vh-8.5rem)] lg:overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {relatedError ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">{relatedError}</p>
              ) : null}
              <div className="space-y-2">
                {relatedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void playRelated(item)}
                    className="flex w-full items-start gap-3 rounded-xl border border-border bg-muted/50 p-2 text-left transition hover:bg-muted"
                    disabled={loadingRelatedId === item.id}
                  >
                    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg md:h-16 md:w-28">
                      <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                      {loadingRelatedId === item.id ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.creator}</p>
                      <p className="mt-1 text-xs text-muted-foreground/90">{formatDuration(item.duration)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 z-[70] transition-opacity duration-300 ${
          descriptionOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ top: `${descriptionTop ?? 120}px` }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/70"
          onClick={() => setDescriptionOpen(false)}
          aria-label="Close description"
        />
        <div
          className={`pointer-events-auto absolute inset-0 overflow-hidden rounded-t-2xl border-t border-border bg-card transition-transform duration-300 ${
            descriptionOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Description</h4>
            <Button variant="ghost" size="icon" onClick={() => setDescriptionOpen(false)} aria-label="Close description panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-[calc(100%-54px)] overflow-y-auto overflow-x-hidden px-4 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <p className="whitespace-pre-wrap break-words text-sm text-foreground [overflow-wrap:anywhere]">
              {descriptionText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
