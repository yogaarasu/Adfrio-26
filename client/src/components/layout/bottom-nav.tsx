import { NavLink } from "react-router-dom";
import { Headphones, User, Video, Library } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { path: "/music", label: "Music", icon: Headphones },
  { path: "/videos", label: "Videos", icon: Video },
  { path: "/library", label: "Library", icon: Library },
  { path: "/account", label: "Account", icon: User }
];

export const BottomNav = () => (
  <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black/95 p-2 md:hidden">
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
                  isActive ? "bg-white text-black" : "text-white/70"
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
