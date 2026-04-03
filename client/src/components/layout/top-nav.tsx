import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const TopNav = () => (
  <header className="sticky top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur">
    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
      <NavLink to="/music" className="text-lg font-bold tracking-widest text-white">
        ADFRIO
      </NavLink>
      <nav className="hidden items-center gap-2 md:flex">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "rounded-full px-4 py-2 text-sm transition",
                isActive ? "bg-white text-black" : "text-white/70 hover:text-white"
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
