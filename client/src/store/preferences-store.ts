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

type PreferencesState = {
  mode: MediaType;
  language: AppLanguage;
  setMode: (mode: MediaType) => void;
  setLanguage: (language: AppLanguage) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      mode: "music",
      language: "Tamil",
      setMode: (mode) => set({ mode }),
      setLanguage: (language) => set({ language })
    }),
    {
      name: "adfrio-preferences"
    }
  )
);
