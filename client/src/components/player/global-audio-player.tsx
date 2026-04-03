import { useCallback, useEffect, useRef } from "react";
import { Pause, Play, Rewind, FastForward, Volume2 } from "lucide-react";
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

  useEffect(() => {
    if (current?.id !== recoveredIdRef.current) {
      recoveredIdRef.current = null;
    }
  }, [current?.id]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!audioRef.current) return;

    if (!audio?.url || video.active) {
      audioRef.current.pause();
      return;
    }

    if (audioRef.current.src !== audio.url) {
      audioRef.current.src = audio.url;
      audioRef.current.load();
    }

    if (playing) {
      void audioRef.current.play().catch(() => setPlaying(false));
    } else {
      audioRef.current.pause();
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

      playAudio(current, { url: buildMediaProxyUrl(current.id, "audio"), mimeType: bestAudio.mimeType }, queue);
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
        if (stream.unavailableReason) {
          setPlaying(false);
          return;
        }

        const bestAudio = pickBestAudioSource(stream);
        if (!bestAudio?.url) {
          setPlaying(false);
          return;
        }

        playAudio(next, { url: buildMediaProxyUrl(next.id, "audio"), mimeType: bestAudio.mimeType }, queue);
      } catch {
        setPlaying(false);
      }
    },
    [current, playAudio, queue, setPlaying]
  );

  const onSeekBy = useCallback((seconds: number) => seekBy(seconds, audioRef.current), [seekBy]);
  useMediaSession({ onSeekBy, onNext: () => void jump(1), onPrev: () => void jump(-1) });

  const progress = Math.min(100, (currentTime / (duration || 1)) * 100);

  if (!current || !audio) return <audio ref={audioRef} preload="none" />;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 border-t border-white/20 bg-black/95 px-4 py-3 backdrop-blur md:bottom-0">
      <audio
        ref={audioRef}
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime, event.currentTarget.duration || 0)}
        onEnded={() => void jump(1)}
        onError={() => {
          void recoverCurrentTrack();
        }}
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="h-1 w-full rounded-full bg-white/10">
          <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-3">
          <img src={current.thumbnail} alt={current.title} className="h-12 w-12 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{current.title}</p>
            <p className="truncate text-xs text-white/70">{current.creator}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => onSeekBy(-10)}>
              <Rewind className="h-4 w-4" />
            </Button>
            <Button variant="default" size="icon" onClick={() => setPlaying(!playing)}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onSeekBy(10)}>
              <FastForward className="h-4 w-4" />
            </Button>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Volume2 className="h-4 w-4 text-white/70" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </div>
        </div>
        <div className="hidden md:block">
          <SleepTimer />
        </div>
      </div>
    </div>
  );
};
