import { useCallback, useEffect, useRef } from "react";
import { Pause, Play, Rewind, FastForward, Volume2, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player-store";
import { useMediaSession } from "@/hooks/use-media-session";
import { SleepTimer } from "@/components/player/sleep-timer";
import { mediaApi } from "@/services/api";
import { pickBestAudioSource } from "@/lib/playback";
import { buildMediaProxyUrl } from "@/lib/proxy-stream-url";

export const GlobalAudioPlayer = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recoveredIdRef = useRef<string | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const current = usePlayerStore((state) => state.current);
  const audio = usePlayerStore((state) => state.audio);
  const video = usePlayerStore((state) => state.video);
  const playing = usePlayerStore((state) => state.playing);
  const volume = usePlayerStore((state) => state.volume);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const queue = usePlayerStore((state) => state.queue);

  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const seekBy = usePlayerStore((state) => state.seekBy);
  const playAudio = usePlayerStore((state) => state.playAudio);

  // Reset recovery tracker when track changes
  useEffect(() => {
    if (current?.id !== recoveredIdRef.current) {
      recoveredIdRef.current = null;
    }
  }, [current?.id]);

  // Sync volume
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  // Sync src + play/pause
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (!audio?.url || video.active) {
      // Safely abort any in-flight play() before pausing
      if (playPromiseRef.current) {
        playPromiseRef.current.then(() => el.pause()).catch(() => undefined);
      } else {
        el.pause();
      }
      return;
    }

    if (el.src !== audio.url) {
      el.src = audio.url;
      el.load();
    }

    if (playing) {
      // Always capture the play() promise so we can abort it safely
      playPromiseRef.current = el.play().catch((err: Error) => {
        // "interrupted by new load" is safe to ignore; real errors should pause
        if (!err.message.includes("interrupted")) {
          setPlaying(false);
        }
      });
    } else {
      if (playPromiseRef.current) {
        playPromiseRef.current.then(() => el.pause()).catch(() => undefined);
        playPromiseRef.current = null;
      } else {
        el.pause();
      }
    }
  }, [audio?.url, playing, setPlaying, video.active]);

  const recoverCurrentTrack = useCallback(async () => {
    if (!current) return;
    if (recoveredIdRef.current === current.id) {
      setPlaying(false);
      return;
    }

    recoveredIdRef.current = current.id;

    try {
      const stream = await mediaApi.streams(current.id, { forceRefresh: true });
      if (stream.unavailableReason) {
        setPlaying(false);
        return;
      }

      const bestAudio = pickBestAudioSource(stream);
      if (!bestAudio?.url) {
        setPlaying(false);
        return;
      }

      playAudio(
        current,
        { url: buildMediaProxyUrl(current.id, "audio"), mimeType: bestAudio.mimeType },
        queue
      );
    } catch {
      setPlaying(false);
    }
  }, [current, playAudio, queue, setPlaying]);

  const jump = useCallback(
    async (dir: -1 | 1) => {
      if (!current || queue.length < 2) return;
      const idx = queue.findIndex((entry) => entry.id === current.id);
      if (idx === -1) return;

      const next = queue[(idx + dir + queue.length) % queue.length];
      if (!next) return;

      try {
        const stream = await mediaApi.streams(next.id);
        if (stream.unavailableReason) { setPlaying(false); return; }

        const bestAudio = pickBestAudioSource(stream);
        if (!bestAudio?.url) { setPlaying(false); return; }

        playAudio(
          next,
          { url: buildMediaProxyUrl(next.id, "audio"), mimeType: bestAudio.mimeType },
          queue
        );
      } catch {
        setPlaying(false);
      }
    },
    [current, playAudio, queue, setPlaying]
  );

  const onSeekBy = useCallback((seconds: number) => seekBy(seconds, audioRef.current), [seekBy]);
  const onSeekTo = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);
  const onTogglePlay = useCallback(() => setPlaying(!playing), [playing, setPlaying]);

  useMediaSession({
    onSeekBy,
    onNext: () => void jump(1),
    onPrev: () => void jump(-1),
    onTogglePlay,
    onSeekTo
  });

  const progress = Math.min(100, (currentTime / (duration || 1)) * 100);

  // Hidden element when no track — keeps audioRef mounted
  if (!current || !audio) {
    return <audio ref={audioRef} preload="none" />;
  }

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 border-t border-white/20 bg-black/95 px-4 py-3 backdrop-blur-md md:bottom-0">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        onEnded={() => void jump(1)}
        onError={() => void recoverCurrentTrack()}
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        {/* Progress bar — clickable */}
        <div
          className="group h-1.5 w-full cursor-pointer rounded-full bg-white/15"
          onClick={(e) => {
            if (!audioRef.current || !duration) return;
            const rect = (e.target as HTMLDivElement).getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = ratio * duration;
          }}
          role="slider"
          aria-label="Seek"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
        >
          <div
            className="h-full rounded-full bg-white transition-all duration-150 group-hover:bg-indigo-400"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          {/* Thumbnail + title */}
          <img
            src={current.thumbnail}
            alt={current.title}
            className="h-12 w-12 rounded-lg object-cover shadow-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{current.title}</p>
            <p className="truncate text-xs text-white/60">{current.creator}</p>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => void jump(-1)} aria-label="Previous">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onSeekBy(-10)} aria-label="Rewind 10s">
              <Rewind className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={onTogglePlay}
              className="h-10 w-10 rounded-full"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onSeekBy(10)} aria-label="Skip 10s">
              <FastForward className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void jump(1)} aria-label="Next">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Volume */}
          <div className="hidden items-center gap-2 md:flex">
            <Volume2 className="h-4 w-4 text-white/60" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-24 accent-indigo-400"
              aria-label="Volume"
            />
          </div>

          {/* Sleep timer */}
          <div className="hidden md:block">
            <SleepTimer />
          </div>
        </div>
      </div>
    </div>
  );
};
