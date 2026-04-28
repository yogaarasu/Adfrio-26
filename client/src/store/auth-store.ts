import { create } from "zustand";
import { persist } from "zustand/middleware";

type User = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
};

type AuthState = {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => {
        localStorage.setItem("adfrio_token", token);
        set({ token, user });
      },
      logout: () => {
        localStorage.removeItem("adfrio_token");
        localStorage.removeItem("adfrio-player");
        localStorage.removeItem("adfrio-auth");
        if (typeof window !== "undefined") {
          const sessionKeys = Object.keys(sessionStorage);
          sessionKeys.forEach((key) => {
            if (key.startsWith("adfrio_")) {
              sessionStorage.removeItem(key);
            }
          });
        }
        set({ token: null, user: null });
      }
    }),
    {
      name: "adfrio-auth"
    }
  )
);

export const hasAuthSession = (): boolean => {
  const state = useAuthStore.getState();
  if (state.token && state.user) return true;
  if (typeof window === "undefined") return Boolean(state.token);
  return Boolean(state.token ?? localStorage.getItem("adfrio_token"));
};
