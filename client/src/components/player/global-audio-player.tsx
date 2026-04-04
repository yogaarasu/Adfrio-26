import { useCallback, useEffect, useState } from "react";
import { Pause, Play, Rewind, FastForward, Volume2, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player-store";
import { useMediaSession } from "@/hooks/use-media-session";
import { SleepTimer } from "@/components/player/sleep-timer";
import { mediaApi } from "@/services/api";
import { pickBestAudioSource } from "@/lib/playback";
import { buildMediaProxyUrl } from "@/lib/proxy-stream-url";
import { useAudioPlayer } from "react-use-audio-player";

export const GlobalAudioPlayer = () => {
  const current = usePlayerStore((state) => state.current);
  const audio = usePlayerStore((state) => state.audio);
  const video = usePlayerStore((state) => state.video);
  const playing = usePlayerStore((state) => state.playing);
  const volume = usePlayerStore((state) => state.volume);
  const storeCurrentTime = usePlayerStore((state) => state.currentTime);
  const storeDuration = usePlayerStore((state) => state.duration);
  const queue = usePlayerStore((state) => state.queue);

  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const playAudio = usePlayerStore((state) => state.playAudio);
  
  // @ts-ignore Ignore type checks for react-use-audio-player
  const { load, play, pause, stop, playing: isPlaying, setVolume: setPlayerVolume, duration, getPosition, seek } = useAudioPlayer();

  // Polling for exact progress updates from the audio library
  const [pos, setPos] = useState(0);
  useEffect(() => {
    let frame: number;
    const updateProgress = () => {
      const p = typeof getPosition === "function" ? getPosition() : 0;
      setPos(p);
      setProgress(p, duration || storeDuration);
      frame = requestAnimationFrame(updateProgress);
    };
    if (isPlaying) {
      frame = requestAnimationFrame(updateProgress);
    }
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, getPosition, duration, storeDuration, setProgress]);

  // Sync Global Zustand Volume to AudioPlayer
  useEffect(() => {
    if (typeof setPlayerVolume === "function") {
      setPlayerVolume(volume);
    }
  }, [volume, setPlayerVolume]);

  const recoverCurrentTrack = useCallback(async () => {
    console.warn("[GlobalAudioPlayer] Attempting automated error recovery...");
    if (!current) return;

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
    } catch (err) {
      console.error("[GlobalAudioPlayer] Recovery failed:", err);
      setPlaying(false);
    }
  }, [current, playAudio, queue, setPlaying]);

  // Master Loader for Audio
  useEffect(() => {
    if (!audio?.url || video.active) {
      if (typeof stop === "function") stop();
      return;
    }

    // @ts-ignore Ignore type checks for Howler options passthrough
    load(audio.url, {
      autoplay: playing,
      html5: true, // Required to handle piping chunked proxy streams without crashing
      format: "mp3",
      onplay: () => setPlaying(true),
      onpause: () => setPlaying(false),
      onend: () => void jump(1),
      onloaderror: (id: any, err: any) => {
        console.error(`[GlobalAudioPlayer] Load Error (ID: ${id}):`, err);
        void recoverCurrentTrack();
      },
      onplayerror: (id: any, err: any) => {
        console.error(`[GlobalAudioPlayer] Play Error (ID: ${id}):`, err);
        void recoverCurrentTrack();
      }
    } as any);
  }, [audio?.url, video.active]);

  // Sync Global Play/Pause
  useEffect(() => {
    if (playing && !isPlaying && audio?.url) {
      if (typeof play === "function") play();
    } else if (!playing && isPlaying) {
      if (typeof pause === "function") pause();
    }
  }, [playing, isPlaying, play, pause, audio?.url]);

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

  const onSeekBy = useCallback((seconds: number) => {
    const next = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, getPosition() + seconds));
    seek(next);
  }, [duration, getPosition, seek]);
  
  const onSeekTo = useCallback((time: number) => seek(time), [seek]);
  const onTogglePlay = useCallback(() => setPlaying(!playing), [playing, setPlaying]);

  useMediaSession({
    onSeekBy,
    onNext: () => void jump(1),
    onPrev: () => void jump(-1),
    onTogglePlay,
    onSeekTo
  });

  const progress = Math.min(100, (pos / (duration || 1)) * 100);

  if (!current || !audio) {
    return null;
  }

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 border-t border-white/20 bg-black/95 px-4 py-3 backdrop-blur-md md:bottom-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        <div
          className="group h-1.5 w-full cursor-pointer rounded-full bg-white/15"
          onClick={(e) => {
            if (!duration) return;
            const rect = (e.target as HTMLDivElement).getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            seek(ratio * duration);
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
            style={{ width: `${progress || 0}%` }}
          />
        </div>

        <div className="flex items-center gap-3">
          <img
            src={current.thumbnail}
            alt={current.title}
            className="h-12 w-12 rounded-lg object-cover shadow-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{current.title}</p>
            <p className="truncate text-xs text-white/60">{current.creator}</p>
          </div>

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

          <div className="hidden md:block">
            <SleepTimer />
          </div>
        </div>
      </div>
    </div>
  );
};
