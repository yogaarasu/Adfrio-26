import { Menu } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferences-store";

type TopNavProps = {
  onMenuToggle: () => void;
};

export const TopNav = ({ onMenuToggle }: TopNavProps) => {
  const location = useLocation();
  const mode = usePreferencesStore((state) => state.mode);
  const setMode = usePreferencesStore((state) => state.setMode);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuToggle}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <NavLink
            replace
            to="/home"
            className="text-lg font-bold tracking-widest text-foreground"
            onClick={(event) => {
              if (location.pathname !== "/home") return;
              event.preventDefault();
            }}
          >
            ADFRIO
          </NavLink>
        </div>

        <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setMode("music")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition",
              mode === "music"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Songs
          </button>
          <button
            type="button"
            onClick={() => setMode("video")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition",
              mode === "video"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Videos
          </button>
        </div>
      </div>
    </header>
  );
};
