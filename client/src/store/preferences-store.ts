import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaType } from "@/types/media";

export const LANGUAGE_OPTIONS = [
  "Tamil",
  "English",
  "Hindi",
  "Telugu",
  "Malayalam",
  "Kannada"
] as const;

export type AppLanguage = (typeof LANGUAGE_OPTIONS)[number];
export const THEME_OPTIONS = ["system", "light", "dark"] as const;
export type AppTheme = (typeof THEME_OPTIONS)[number];

type PreferencesState = {
  mode: MediaType;
  language: AppLanguage;
  theme: AppTheme;
  videoAutoplay: boolean;
  setMode: (mode: MediaType) => void;
  setLanguage: (language: AppLanguage) => void;
  setTheme: (theme: AppTheme) => void;
  setVideoAutoplay: (enabled: boolean) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      mode: "music",
      language: "Tamil",
      theme: "system",
      videoAutoplay: true,
      setMode: (mode) => set({ mode }),
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setVideoAutoplay: (enabled) => set({ videoAutoplay: enabled })
    }),
    {
      name: "adfrio-preferences"
    }
  )
);
