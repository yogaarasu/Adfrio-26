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
  description: string;
  uploader: string;
  uploaderAvatarUrl: string | null;
  likes: number | null;
  sources: VideoSource[];
  related: MediaItem[];
};

type VideoExtras = {
  related?: MediaItem[];
  description?: string;
  uploader?: string;
  uploaderAvatarUrl?: string | null;
  likes?: number | null;
  sources?: VideoSource[];
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
  audioError: string | null;
  setQueue: (queue: MediaItem[]) => void;
  playAudio: (media: MediaItem, source: AudioSource, queue?: MediaItem[]) => void;
  playVideo: (media: MediaItem, sources: VideoSource[], extras?: MediaItem[] | VideoExtras) => void;
  updateVideoSession: (mediaId: string, updates: VideoExtras) => void;
  openVideoOverlay: () => void;
  pauseAll: () => void;
  resumeAudio: () => void;
  setPlaying: (playing: boolean) => void;
  setProgress: (currentTime: number, duration: number) => void;
  setVolume: (volume: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  seekBy: (seconds: number, element: HTMLMediaElement | null) => void;
  clearVideo: () => void;
  setAudioError: (error: string | null) => void;
};

let sleepTimeout: ReturnType<typeof setTimeout> | null = null;

const emptyVideoSession: VideoSession = {
  active: false,
  title: "",
  poster: "",
  description: "",
  uploader: "",
  uploaderAvatarUrl: null,
  likes: null,
  sources: [],
  related: [],
};

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
      audioError: null,

      setQueue: (queue) => set({ queue }),

      playAudio: (media, source, queue) => {
        set({
          current: media,
          audio: source,
          video: emptyVideoSession,
          queue: queue ?? get().queue,
          playing: true,
          currentTime: 0,
          duration: 0,
          audioError: null,
        });
      },

      playVideo: (media, sources, extras = []) => {
        const normalized: VideoExtras = Array.isArray(extras) ? { related: extras } : extras;
        const resolvedSources = normalized.sources ?? sources;
        set({
          current: media,
          audio: { url: `https://www.youtube.com/watch?v=${media.id}`, mimeType: "audio/mpeg" },
          playing: true,
          currentTime: 0,
          duration: 0,
          video: {
            active: true,
            title: media.title,
            poster: media.thumbnail,
            description: normalized.description ?? "",
            uploader: normalized.uploader ?? media.creator ?? "",
            uploaderAvatarUrl: normalized.uploaderAvatarUrl ?? null,
            likes: normalized.likes ?? null,
            sources: resolvedSources,
            related: normalized.related ?? [],
          },
        });
      },

      updateVideoSession: (mediaId, updates) => {
        const state = get();
        if (!state.current || state.current.type !== "video" || state.current.id !== mediaId) {
          return;
        }
        set({
          video: {
            ...state.video,
            related: updates.related ?? state.video.related,
            description: updates.description ?? state.video.description,
            uploader: updates.uploader ?? state.video.uploader,
            uploaderAvatarUrl:
              updates.uploaderAvatarUrl === undefined
                ? state.video.uploaderAvatarUrl
                : updates.uploaderAvatarUrl,
            likes: updates.likes === undefined ? state.video.likes : updates.likes,
            sources: updates.sources ?? state.video.sources,
          },
        });
      },

      openVideoOverlay: () => {
        const current = get().current;
        if (!current || current.type !== "video") return;
        const previous = get().video;
        set({
          video: {
            ...previous,
            active: true,
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
      setProgress: (nextTime, nextDuration) =>
        set((state) => {
          const fallbackDuration = Number(state.current?.duration ?? 0);
          const previousDuration = Number(state.duration);
          const resolvedDuration =
            Number.isFinite(nextDuration) && nextDuration > 0
              ? nextDuration
              : previousDuration > 0
                ? previousDuration
                : fallbackDuration > 0
                  ? fallbackDuration
                  : 0;

          const rawTime = Number.isFinite(nextTime) ? nextTime : state.currentTime;
          const boundedTime =
            resolvedDuration > 0
              ? Math.max(0, Math.min(rawTime, resolvedDuration))
              : Math.max(0, rawTime);

          return {
            currentTime: boundedTime,
            duration: resolvedDuration,
          };
        }),
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
        element.currentTime = Math.max(
          0,
          Math.min(
            element.duration || Number.MAX_SAFE_INTEGER,
            element.currentTime + seconds
          )
        );
      },

      // Stop video overlay and pause playback.
      clearVideo: () =>
        set({
          video: {
            ...get().video,
            active: false,
          },
          playing: false,
        }),

      setAudioError: (error) => set({ audioError: error }),
    }),
    {
      name: "adfrio-player",
      // Persist audio source + current so playback survives cross-page navigation
      partialize: (state) => ({
        queue: state.queue,
        current: state.current,
        audio: state.audio, // <-- was missing before; this is the key fix
        volume: state.volume,
        // Do NOT persist: playing (force replay after refresh), video (re-fetch on demand)
      }),
    }
  )
);
