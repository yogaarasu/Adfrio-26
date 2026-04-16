import { NavLink } from "react-router-dom";
import { Home, Search, Library, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/search", label: "Search", icon: Search },
  { path: "/library", label: "Library", icon: Library },
  { path: "/profile", label: "Profile", icon: User }
];

export const BottomNav = () => (
  <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-background/95 p-2 backdrop-blur md:hidden">
    <ul className="grid grid-cols-4 gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-xl py-2 text-xs",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
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
