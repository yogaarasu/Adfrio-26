import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopNav } from "@/components/layout/top-nav";
import { GlobalAudioPlayer } from "@/components/player/global-audio-player";
import { GlobalVideoPlayer } from "@/components/player/global-video-player";

export const AppShell = () => {
  const location = useLocation();
  const isNowPlayingPage = location.pathname === "/now-playing";

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />
      <main
        className={
          "mx-auto w-full max-w-6xl px-4 pb-36 pt-6 md:pb-48"
        }
      >
        <Outlet />
      </main>
      <BottomNav />
      <GlobalAudioPlayer />
      <GlobalVideoPlayer />
    </div>
  );
};
