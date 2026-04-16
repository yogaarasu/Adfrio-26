import { useEffect } from "react";
import { usePreferencesStore } from "@/store/preferences-store";

const applyTheme = (theme: "system" | "light" | "dark", prefersDark: boolean) => {
  const root = document.documentElement;
  const useDark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", useDark);
  root.style.colorScheme = useDark ? "dark" : "light";
};

export const ThemeSync = () => {
  const theme = usePreferencesStore((state) => state.theme);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const sync = () => {
      applyTheme(theme, mediaQuery.matches);
    };

    sync();
    mediaQuery.addEventListener("change", sync);

    return () => {
      mediaQuery.removeEventListener("change", sync);
    };
  }, [theme]);

  return null;
};
