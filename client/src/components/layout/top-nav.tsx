import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferences-store";

const navItems = [
  { label: "Home", path: "/home" },
  { label: "Search", path: "/search" },
  { label: "Library", path: "/library" },
  { label: "Profile", path: "/profile" }
];

export const TopNav = () => {
  const mode = usePreferencesStore((state) => state.mode);
  const setMode = usePreferencesStore((state) => state.setMode);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <NavLink to="/home" className="text-lg font-bold tracking-widest text-foreground">
          ADFRIO
        </NavLink>

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

        <nav className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-4 py-2 text-sm transition",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
};
