import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Clock3, Loader2, Pause, Play, Plus, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { accentColorFromSeed } from "@/lib/accent-color";
import { formatDuration } from "@/lib/utils";
import { playlistApi } from "@/services/api";
import { usePlayerStore } from "@/store/player-store";

export const NowPlayingPage = () => {
  const navigate = useNavigate();
  const current = usePlayerStore((state) => state.current);
  const audio = usePlayerStore((state) => state.audio);
  const queue = usePlayerStore((state) => state.queue);
  const playing = usePlayerStore((state) => state.playing);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const sleepUntil = usePlayerStore((state) => state.sleepUntil);
  const playAudio = usePlayerStore((state) => state.playAudio);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const requestSeek = usePlayerStore((state) => state.requestSeek);
  const setSleepTimer = usePlayerStore((state) => state.setSleepTimer);
  const openVideoOverlay = usePlayerStore((state) => state.openVideoOverlay);

  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [customMinutes, setCustomMinutes] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastSyncTimeRef = useRef(0);
  const lastSyncAtRef = useRef(0);
  const progressTrackRef = useRef<HTMLDivElement | null>(null);
  const seekPointerIdRef = useRef<number | null>(null);

  const jump = useCallback(
    (dir: -1 | 1) => {
      if (!current || queue.length < 2) return;
      const index = queue.findIndex((entry) => entry.id === current.id);
      if (index < 0) return;
      const next = queue[(index + dir + queue.length) % queue.length];
      if (!next) return;
      playAudio(next, { url: `https://www.youtube.com/watch?v=${next.id}`, mimeType: "audio/mpeg" }, queue);
    },
    [current, playAudio, queue]
  );

  const addCurrentToFavorites = useCallback(async () => {
    if (!current || current.type !== "music" || isSaving) return;
    setIsSaving(true);
    setStatus(null);
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
      setStatus("Song added to Favorites");
    } catch {
      setStatus("Sign in to save songs");
    } finally {
      setIsSaving(false);
    }
  }, [current, isSaving]);

  const closePage = useCallback(() => {
    setIsClosing(true);
    window.setTimeout(() => {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate("/home");
      }
    }, 260);
  }, [navigate]);

  const applyCustomTimer = useCallback(() => {
    const minutes = Number.parseInt(customMinutes, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setStatus("Enter valid custom minutes");
      return;
    }
    setSleepTimer(minutes);
    setStatus(`Sleep timer set for ${minutes} min`);
    setCustomMinutes("");
  }, [customMinutes, setSleepTimer]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      setIsOpening(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  const resolvedDuration = duration > 0 ? duration : Number(current?.duration || 0);

  useEffect(() => {
    lastSyncTimeRef.current = currentTime;
    lastSyncAtRef.current = performance.now();
    setDisplayTime(currentTime);
  }, [current?.id, currentTime]);

  useEffect(() => {
    if (!playing || !current || !audio) {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setDisplayTime(currentTime);
      lastSyncTimeRef.current = currentTime;
      lastSyncAtRef.current = performance.now();
      return;
    }

    const tick = (now: number) => {
      const elapsed = Math.max(0, (now - lastSyncAtRef.current) / 1000);
      const maxTime = resolvedDuration > 0 ? resolvedDuration : Number.MAX_SAFE_INTEGER;
      const nextTime = Math.min(maxTime, lastSyncTimeRef.current + elapsed);
      setDisplayTime(nextTime);
      rafRef.current = window.requestAnimationFrame(tick);
    };

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [audio, current?.id, currentTime, playing, resolvedDuration]);

  if (!current || !audio) {
    return (
      <section className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Now Playing</h1>
        <Card>
          <p className="text-sm text-muted-foreground">Nothing is playing yet. Start from Home or Search.</p>
        </Card>
      </section>
    );
  }

  if (current.type === "video") {
    return (
      <section className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Now Playing</h1>
        <Card className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A video is active. Open the full video player to continue.
          </p>
          <Button onClick={openVideoOverlay}>Open Video</Button>
        </Card>
      </section>
    );
  }

  const activeDuration = resolvedDuration;
  const progress = activeDuration > 0 ? Math.min(100, (displayTime / activeDuration) * 100) : 0;
  const sleepMinutesLeft = sleepUntil ? Math.max(0, Math.round((sleepUntil - Date.now()) / 60000)) : null;
  const accentSeed = `${current.id}-${current.creator}-${current.title}`;
  const accentStrong = accentColorFromSeed(accentSeed, 78, 57, 1);
  const commitSeekAtClientX = useCallback(
    (clientX: number) => {
      const track = progressTrackRef.current;
      if (!track || !activeDuration) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
      const nextTime = ratio * activeDuration;
      setDisplayTime(nextTime);
      setProgress(nextTime, activeDuration);
      requestSeek(nextTime);
    },
    [activeDuration, requestSeek, setProgress]
  );

  return (
    <section
      className={`mx-auto max-w-2xl space-y-5 pb-0 transition-all duration-300 ${
        isClosing || !isOpening ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={closePage} aria-label="Close now playing">
          <ChevronDown className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Now Playing</h1>
        <span className="w-10" aria-hidden="true" />
      </header>

      <div className="mx-auto w-full max-w-lg rounded-3xl border border-border bg-gradient-to-b from-card via-card to-muted/60 p-5">
        <div className="mx-auto aspect-square w-full max-w-[18rem] overflow-hidden rounded-2xl border border-border sm:max-w-[20rem]">
          <img src={current.thumbnail} alt={current.title} className="h-full w-full object-cover" />
        </div>

        <div className="mt-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-2xl font-semibold">{current.title}</h2>
            <p className="line-clamp-1 text-base text-muted-foreground">{current.creator}</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void addCurrentToFavorites()}
            disabled={isSaving}
            className="h-12 w-12 min-h-12 min-w-12 shrink-0 rounded-full"
            aria-label="Add song to playlist"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
          </Button>
        </div>

        <div className="mt-5 space-y-2">
          <div
            ref={progressTrackRef}
            className="group relative h-1 w-full cursor-pointer rounded-full bg-border/90"
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.max(1, Math.round(activeDuration))}
            aria-valuenow={Math.round(displayTime)}
            tabIndex={0}
            onPointerDown={(event) => {
              seekPointerIdRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              commitSeekAtClientX(event.clientX);
            }}
            onPointerMove={(event) => {
              if (seekPointerIdRef.current !== event.pointerId) return;
              commitSeekAtClientX(event.clientX);
            }}
            onPointerUp={(event) => {
              if (seekPointerIdRef.current !== event.pointerId) return;
              seekPointerIdRef.current = null;
            }}
            onPointerCancel={(event) => {
              if (seekPointerIdRef.current !== event.pointerId) return;
              seekPointerIdRef.current = null;
            }}
            onKeyDown={(event) => {
              if (!activeDuration) return;
              if (event.key === "ArrowRight") {
                event.preventDefault();
                const next = Math.min(activeDuration, displayTime + 10);
                setDisplayTime(next);
                setProgress(next, activeDuration);
                requestSeek(next);
              }
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                const next = Math.max(0, displayTime - 10);
                setDisplayTime(next);
                setProgress(next, activeDuration);
                requestSeek(next);
              }
            }}
          >
            <div
              className="relative h-full rounded-full"
              style={{ width: `${progress}%`, backgroundColor: accentStrong }}
            >
              <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1 rounded-full bg-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatDuration(Math.floor(displayTime))}</span>
            <span>{formatDuration(Math.floor(activeDuration))}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-5 items-center text-foreground">
          <button
            type="button"
            className="mx-auto text-muted-foreground transition hover:text-foreground"
            onClick={() => setStatus("Shuffle queue is not enabled yet")}
            aria-label="Shuffle"
          >
            <Shuffle className="h-5 w-5" />
          </button>
          <Button variant="ghost" size="icon" onClick={() => jump(-1)} aria-label="Previous song" className="mx-auto">
            <SkipBack className="h-6 w-6" />
          </Button>
          <Button
            size="icon"
            className="mx-auto h-14 w-14 rounded-full bg-primary text-primary-foreground hover:opacity-90"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? "Pause song" : "Play song"}
          >
            {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 fill-current" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => jump(1)} aria-label="Next song" className="mx-auto">
            <SkipForward className="h-6 w-6" />
          </Button>
          <button
            type="button"
            className="mx-auto text-muted-foreground transition hover:text-foreground"
            onClick={() => setShowTimerMenu((value) => !value)}
            aria-label="Sleep timer"
          >
            <Clock3 className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {sleepMinutesLeft !== null && sleepMinutesLeft > 0 ? `${sleepMinutesLeft} min left` : "Sleep timer off"}
        </p>

        {showTimerMenu ? (
          <div className="mt-3 space-y-2 rounded-2xl border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Sleep Timer</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSleepTimer(15);
                  setShowTimerMenu(false);
                }}
              >
                15 min
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSleepTimer(30);
                  setShowTimerMenu(false);
                }}
              >
                30 min
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSleepTimer(60);
                  setShowTimerMenu(false);
                }}
              >
                1 hour
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSleepTimer(null);
                  setShowTimerMenu(false);
                }}
              >
                Off
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="Custom min"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                className="h-9 w-28 rounded-full border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                aria-label="Custom sleep minutes"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  applyCustomTimer();
                  setShowTimerMenu(false);
                }}
              >
                Set
              </Button>
            </div>
          </div>
        ) : null}

        {status ? <p className="mt-2 text-center text-xs text-muted-foreground">{status}</p> : null}
      </div>
    </section>
  );
};
