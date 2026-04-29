import { Moon, Sun } from "lucide-react";
import { usePreferencesStore } from "@/store/preferences-store";
import { Button } from "@/components/ui/button";

const isDarkActive = (theme: "system" | "light" | "dark"): boolean => {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

export const AuthHeader = () => {
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const dark = isDarkActive(theme);

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <p className="bg-gradient-to-r from-black to-zinc-500 bg-clip-text text-lg font-bold tracking-wide text-transparent dark:from-white dark:to-zinc-400">
          Adfrio
        </p>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => setTheme(dark ? "light" : "dark")}
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
};
