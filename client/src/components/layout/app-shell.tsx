import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopNav } from "@/components/layout/top-nav";
import { GlobalAudioPlayer } from "@/components/player/global-audio-player";
import { GlobalVideoPlayer } from "@/components/player/global-video-player";
import { AuthRequiredDialog } from "@/components/auth/auth-required-dialog";
import { cn } from "@/lib/utils";

export const AppShell = () => {
  const location = useLocation();
  const pathname = location.pathname.toLowerCase();
  const isAuthRoute =
    pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/sign-up/verify";

  return (
    <div
      className={cn("min-h-screen", isAuthRoute ? "bg-[#ececec] text-[#111]" : "bg-black text-white")}
    >
      {!isAuthRoute ? <TopNav /> : null}
      <main
        className={cn(
          "mx-auto w-full",
          isAuthRoute
            ? "flex min-h-screen items-center justify-center px-4 py-8 sm:py-12"
            : "max-w-6xl px-4 pb-36 pt-6 md:pb-48"
        )}
      >
        <Outlet />
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
