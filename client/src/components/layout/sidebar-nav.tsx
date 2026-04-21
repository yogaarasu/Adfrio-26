import { Home, Library, Search, User, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

export const SidebarNav = ({ mobileOpen, onClose }: SidebarNavProps) => (
  <>
    <aside className="fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 border-r border-border/80 bg-background/95 px-3 py-4 backdrop-blur lg:block">
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
    </aside>

    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/45 transition-opacity duration-300 lg:hidden",
        mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
      onClick={onClose}
      aria-hidden="true"
    />
    <aside
      className={cn(
        "fixed left-0 top-0 z-[60] h-screen w-72 border-r border-border/80 bg-background px-4 py-4 transition-transform duration-300 ease-out lg:hidden",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
      aria-label="Mobile navigation menu"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-base font-semibold tracking-wide">Menu</p>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </Button>
      </div>
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
    </aside>
  </>
);
