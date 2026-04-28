import { Home, Library, Search, User, X } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";

const items = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/search", label: "Search", icon: Search },
  { path: "/library", label: "Library", icon: Library },
  { path: "/profile", label: "Profile", icon: User },
];

type SidebarNavProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

const avatarColorFromName = (name: string): string => {
  const seed = name.trim().toLowerCase() || "user";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 72% 45%)`;
};

export const SidebarNav = ({ mobileOpen, onClose }: SidebarNavProps) => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const avatarBg = avatarColorFromName(user?.name ?? "");
  const firstLetter = (user?.name?.trim().charAt(0) ?? "U").toUpperCase();

  const handleLogout = () => {
    logout();
    onClose();
    navigate("/sign-in");
  };

  return (
    <>
      <aside className="fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 border-r border-border/80 bg-background/90 px-3 py-4 backdrop-blur-xl lg:flex lg:flex-col">
        <nav className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 pt-3">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start rounded-2xl"
            onClick={handleLogout}
          >
            Logout
          </Button>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-white" style={{ backgroundColor: avatarBg, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {firstLetter}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name ?? "Guest User"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email ?? "Not signed in"}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          "fixed inset-x-0 bottom-16 top-0 z-50 bg-black/45 transition-opacity duration-300 lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed bottom-16 left-0 top-0 z-[60] flex w-72 flex-col border-r border-border/80 bg-background px-4 py-4 transition-transform duration-300 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Mobile navigation menu"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold tracking-wide">Menu</p>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="mb-3 border-t border-border/70" />
        <nav className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 pt-3">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start rounded-2xl"
            onClick={handleLogout}
          >
            Logout
          </Button>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <span
                    className="text-sm font-semibold text-white"
                    style={{ backgroundColor: avatarBg, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {firstLetter}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name ?? "Guest User"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email ?? "Not signed in"}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
