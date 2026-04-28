import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  Clock3,
  Pause,
  Play,
  Plus,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AddToPlaylistSheet } from "@/components/playlist/add-to-playlist-sheet";
import { accentColorFromSeed } from "@/lib/accent-color";
import { useBottomSheetVisibility } from "@/hooks/use-bottom-sheet-visibility";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/store/player-store";
import type { MediaItem } from "@/types/media";

const SLEEP_OPTIONS = [5, 10, 30, 45, 60];

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

  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [sleepSheetOpen, setSleepSheetOpen] = useState(false);
  const [playlistSheetOpen, setPlaylistSheetOpen] = useState(false);
  const [playlistTargetItem, setPlaylistTargetItem] = useState<MediaItem | null>(null);
  useBottomSheetVisibility(sleepSheetOpen);

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

  const activeDuration = resolvedDuration;
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

  const progress = activeDuration > 0 ? Math.min(100, (displayTime / activeDuration) * 100) : 0;
  const sleepMinutesLeft = sleepUntil ? Math.max(0, Math.round((sleepUntil - Date.now()) / 60000)) : null;
  const accentSeed = `${current.id}-${current.creator}-${current.title}`;
  const accentStrong = accentColorFromSeed(accentSeed, 78, 57, 1);

  return (
    <>
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
              onClick={() => {
                setPlaylistTargetItem(current);
                setPlaylistSheetOpen(true);
              }}
              className="h-12 w-12 min-h-12 min-w-12 shrink-0 rounded-full"
              aria-label="Add song to playlist"
            >
              <Plus className="h-5 w-5" />
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
              onClick={() => toast.info("Shuffle queue is not enabled yet.")}
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
              onClick={() => setSleepSheetOpen(true)}
              aria-label="Sleep timer"
            >
              <Clock3 className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            {sleepMinutesLeft !== null && sleepMinutesLeft > 0 ? `${sleepMinutesLeft} min left` : "Sleep timer off"}
          </p>

        </div>
      </section>

      <div
        className={cn(
          "fixed inset-0 z-[70] transition-opacity duration-300",
          sleepSheetOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/60"
          onClick={() => setSleepSheetOpen(false)}
          aria-label="Close sheet"
        />
        <section
          className={cn(
            "absolute bottom-0 left-0 right-0 max-h-[75vh] rounded-t-3xl border-t border-border bg-card px-4 pb-5 pt-4 shadow-2xl transition-transform duration-300 ease-out",
            sleepSheetOpen ? "translate-y-0" : "translate-y-full"
          )}
          aria-label="Sleep timer options"
        >
          <div className="mx-auto w-full max-w-xl space-y-4">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-border" />
            <h2 className="text-base font-semibold">Sleep Timer</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {SLEEP_OPTIONS.map((value) => (
                <Button
                  key={value}
                  variant="outline"
                  onClick={() => {
                    setSleepTimer(value);
                    setSleepSheetOpen(false);
                  }}
                >
                  {value === 60 ? "1 hour" : `${value} min`}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setSleepTimer(null);
                setSleepSheetOpen(false);
              }}
            >
              Turn Off Sleep Timer
            </Button>
          </div>
        </section>
      </div>

      <AddToPlaylistSheet
        open={playlistSheetOpen}
        item={playlistTargetItem}
        onClose={() => setPlaylistSheetOpen(false)}
      />
    </>
  );
};
