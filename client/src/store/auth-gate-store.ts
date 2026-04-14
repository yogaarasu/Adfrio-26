import { create } from "zustand";

type AuthGateState = {
  open: boolean;
  title: string;
  message: string;
  show: (title?: string, message?: string) => void;
  hide: () => void;
};

const DEFAULT_TITLE = "Sign In Required";
const DEFAULT_MESSAGE = "Create an account or sign in to play songs and videos.";

export const useAuthGateStore = create<AuthGateState>((set) => ({
  open: false,
  title: DEFAULT_TITLE,
  message: DEFAULT_MESSAGE,
  show: (title, message) =>
    set({
      open: true,
      title: title?.trim() || DEFAULT_TITLE,
      message: message?.trim() || DEFAULT_MESSAGE,
    }),
  hide: () => set({ open: false }),
}));
