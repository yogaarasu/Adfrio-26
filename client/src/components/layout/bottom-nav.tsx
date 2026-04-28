import { type MouseEvent } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Search, Library, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/search", label: "Search", icon: Search },
  { path: "/library", label: "Library", icon: Library },
  { path: "/profile", label: "Profile", icon: User }
];

export const BottomNav = () => (
  <BottomNavContent />
);

const BottomNavContent = () => {
  const location = useLocation();

  return (
    <nav className="adfrio-mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[70] border-t border-border/70 bg-background/80 p-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl md:hidden">
      <ul className="grid grid-cols-4 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const preventDuplicateNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
            if (location.pathname === item.path) {
              event.preventDefault();
            }
          };

          return (
            <li key={item.path}>
              <NavLink
                to={item.path}
                replace
                onClick={preventDuplicateNavigation}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 rounded-xl py-2 text-xs transition",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
