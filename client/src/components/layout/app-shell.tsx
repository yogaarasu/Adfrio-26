import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TopNav } from "@/components/layout/top-nav";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GlobalAudioPlayer } from "@/components/player/global-audio-player";
import { GlobalVideoPlayer } from "@/components/player/global-video-player";
import { AuthRequiredDialog } from "@/components/auth/auth-required-dialog";
import { cn } from "@/lib/utils";

export const AppShell = () => {
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pathname = location.pathname.toLowerCase();
  const isAuthRoute =
    pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/sign-up/verify";

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      document.body.style.removeProperty("overflow");
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.removeProperty("overflow");
    };
  }, [mobileSidebarOpen]);

  return (
    <div
      className={cn(
        "min-h-screen",
        isAuthRoute ? "bg-[#ececec] text-[#111]" : "bg-background text-foreground"
      )}
    >
      {!isAuthRoute ? (
        <>
          <TopNav onMenuToggle={() => setMobileSidebarOpen(true)} />
          <SidebarNav mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
        </>
      ) : null}
      <main
        className={cn(
          "w-full",
          isAuthRoute
            ? "flex min-h-screen items-center justify-center px-4 py-8 sm:py-12"
            : "px-4 pb-36 pt-6 md:pb-40 lg:pl-[18rem]"
        )}
      >
        <div className={cn("mx-auto w-full", isAuthRoute ? "" : "max-w-6xl")}>
          <Outlet />
        </div>
      </main>
      {!isAuthRoute ? (
        <>
          <BottomNav />
          <GlobalAudioPlayer />
          <GlobalVideoPlayer />
          <AuthRequiredDialog />
        </>
      ) : null}
    </div>
  );
};
