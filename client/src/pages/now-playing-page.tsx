import { useCallback } from "react";
import { ExternalLink, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/store/player-store";

const buildSpotifySearchUrl = (title: string, creator: string): string =>
  `https://open.spotify.com/search/${encodeURIComponent(`${title} ${creator}`)}`;

export const NowPlayingPage = () => {
  const current = usePlayerStore((state) => state.current);
  const audio = usePlayerStore((state) => state.audio);
  const queue = usePlayerStore((state) => state.queue);
  const playing = usePlayerStore((state) => state.playing);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const playAudio = usePlayerStore((state) => state.playAudio);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const openVideoOverlay = usePlayerStore((state) => state.openVideoOverlay);

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

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const spotifyUrl = buildSpotifySearchUrl(current.title, current.creator);
  const youtubeUrl = `https://www.youtube.com/watch?v=${current.id}`;

  return (
    <section className="mx-auto max-w-2xl space-y-6 pb-24">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Now Playing</h1>
        <p className="text-sm text-white/60">Song details and quick links</p>
      </header>

      <div className="mx-auto w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl border border-white/15 shadow-2xl shadow-black/50">
          <img src={current.thumbnail} alt={current.title} className="h-full w-full object-cover" />
        </div>

        <div className="mt-5 space-y-1 text-center">
          <h2 className="text-xl font-semibold">{current.title}</h2>
          <p className="text-sm text-white/70">{current.creator}</p>
        </div>

        <div className="mt-4 space-y-2">
          <div className="h-1.5 w-full rounded-full bg-white/20">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>{formatDuration(Math.floor(currentTime))}</span>
            <span>{formatDuration(Math.floor(duration || current.duration || 0))}</span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" onClick={() => jump(-1)} aria-label="Previous song">
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-11 w-11 rounded-full bg-white text-black hover:bg-white/90"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? "Pause song" : "Play song"}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => jump(1)} aria-label="Next song">
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10"
          >
            Open On Spotify
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10"
          >
            Open On YouTube
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
};
