import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaItem } from "@/types/media";

type AudioSource = {
  url: string;
  mimeType?: string;
};

type VideoSource = {
  url: string;
  quality: string;
  format: string;
};

type VideoSession = {
  active: boolean;
  title: string;
  poster: string;
  sources: VideoSource[];
  related: MediaItem[];
};

type PlayerState = {
  queue: MediaItem[];
  current: MediaItem | null;
  audio: AudioSource | null;
  video: VideoSession;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  sleepUntil: number | null;
  setQueue: (queue: MediaItem[]) => void;
  playAudio: (media: MediaItem, source: AudioSource, queue?: MediaItem[]) => void;
  playVideo: (media: MediaItem, sources: VideoSource[], related?: MediaItem[]) => void;
  pauseAll: () => void;
  resumeAudio: () => void;
  setPlaying: (playing: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
  setVolume: (volume: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  seekBy: (seconds: number, element: HTMLMediaElement | null) => void;
  clearVideo: () => void;
};

let sleepTimeout: ReturnType<typeof setTimeout> | null = null;

const emptyVideoSession: VideoSession = { active: false, title: "", poster: "", sources: [], related: [] };

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      current: null,
      audio: null,
      video: emptyVideoSession,
      playing: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      sleepUntil: null,
      setQueue: (queue) => set({ queue }),
      playAudio: (media, source, queue) => {
        set({
          current: media,
          audio: source,
          video: emptyVideoSession,
          queue: queue ?? get().queue,
          playing: true
        });
      },
      playVideo: (media, sources, related = []) => {
        set({
          current: media,
          playing: true,
          video: {
            active: true,
            title: media.title,
            poster: media.thumbnail,
            sources,
            related
          }
        });
      },
      pauseAll: () => set({ playing: false }),
      resumeAudio: () => {
        if (get().audio) {
          set({ playing: true, video: emptyVideoSession });
        }
      },
      setPlaying: (playing) => set({ playing }),
      setProgress: (currentTime, duration) => set({ currentTime, duration }),
      setVolume: (volume) => set({ volume }),
      setSleepTimer: (minutes) => {
        if (sleepTimeout) {
          clearTimeout(sleepTimeout);
          sleepTimeout = null;
        }

        if (minutes === null) {
          set({ sleepUntil: null });
          return;
        }

        const sleepUntil = Date.now() + minutes * 60 * 1000;
        set({ sleepUntil });

        sleepTimeout = setTimeout(() => {
          set({ playing: false, sleepUntil: null });
        }, minutes * 60 * 1000);
      },
      seekBy: (seconds, element) => {
        if (!element) return;
        element.currentTime = Math.max(0, Math.min(element.duration || Number.MAX_SAFE_INTEGER, element.currentTime + seconds));
      },
      clearVideo: () => set({ video: emptyVideoSession, playing: Boolean(get().audio) })
    }),
    {
      name: "adfrio-player",
      partialize: (state) => ({
        queue: state.queue,
        current: state.current,
        volume: state.volume
      })
    }
  )
);
