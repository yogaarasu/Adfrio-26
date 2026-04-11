import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Clock3, Loader2, Pause, Play, Plus, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const setSleepTimer = usePlayerStore((state) => state.setSleepTimer);
  const openVideoOverlay = usePlayerStore((state) => state.openVideoOverlay);

  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [customMinutes, setCustomMinutes] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);

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

  if (!current || !audio) {
    return (
      <section className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Now Playing</h1>
        <Card>
          <p className="text-sm text-white/70">Nothing is playing yet. Start from Home or Search.</p>
        </Card>
      </section>
    );
  }

  if (current.type === "video") {
    return (
      <section className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Now Playing</h1>
        <Card className="space-y-3">
          <p className="text-sm text-white/70">A video is active. Open the full video player to continue.</p>
          <Button onClick={openVideoOverlay}>Open Video</Button>
        </Card>
      </section>
    );
  }

  const activeDuration = duration > 0 ? duration : Number(current.duration || 0);
  const progress = activeDuration > 0 ? Math.min(100, (currentTime / activeDuration) * 100) : 0;
  const sleepMinutesLeft = sleepUntil ? Math.max(0, Math.round((sleepUntil - Date.now()) / 60000)) : null;

  return (
    <section
      className={`mx-auto max-w-2xl space-y-5 pb-24 transition-all duration-300 ${
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

      <div className="mx-auto w-full max-w-lg rounded-3xl border border-white/10 bg-gradient-to-b from-rose-900/30 via-black/30 to-black/45 p-5">
        <div className="mx-auto aspect-square w-full max-w-[18rem] overflow-hidden rounded-2xl border border-white/15 sm:max-w-[20rem]">
          <img src={current.thumbnail} alt={current.title} className="h-full w-full object-cover" />
        </div>

        <div className="mt-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-2xl font-semibold">{current.title}</h2>
            <p className="line-clamp-1 text-base text-white/70">{current.creator}</p>
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
          <div className="h-1.5 w-full rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>{formatDuration(Math.floor(currentTime))}</span>
            <span>{formatDuration(Math.floor(activeDuration))}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-5 items-center text-white">
          <button
            type="button"
            className="mx-auto text-white/75 transition hover:text-white"
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
            className="mx-auto h-14 w-14 rounded-full bg-white text-black hover:bg-white/90"
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
            className="mx-auto text-white/75 transition hover:text-white"
            onClick={() => setShowTimerMenu((value) => !value)}
            aria-label="Sleep timer"
          >
            <Clock3 className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-white/60">
          {sleepMinutesLeft !== null && sleepMinutesLeft > 0 ? `${sleepMinutesLeft} min left` : "Sleep timer off"}
        </p>

        {showTimerMenu ? (
          <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-white/65">Sleep Timer</p>
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
                className="h-9 w-28 rounded-full border border-white/20 bg-black/40 px-3 text-sm outline-none placeholder:text-white/35 focus:border-white/45"
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

        {status ? <p className="mt-2 text-center text-xs text-white/70">{status}</p> : null}
      </div>
    </section>
  );
};
