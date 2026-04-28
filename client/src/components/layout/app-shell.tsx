import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TopNav } from "@/components/layout/top-nav";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GlobalAudioPlayer } from "@/components/player/global-audio-player";
import { GlobalVideoPlayer } from "@/components/player/global-video-player";
import { AuthRequiredDialog } from "@/components/auth/auth-required-dialog";
import { cn } from "@/lib/utils";
import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export const AppShell = () => {
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const token = useAuthStore((state) => state.token);
  const pathname = location.pathname.toLowerCase();
  const isAuthRoute =
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname === "/sign-up/verify" ||
    pathname === "/forgot-password" ||
    pathname === "/forgot-password/otp" ||
    pathname === "/forgot-password/reset";

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      document.body.style.removeProperty("overflow");
      document.body.removeAttribute("data-sidebar-open");
      return;
    }
    document.body.style.overflow = "hidden";
    document.body.setAttribute("data-sidebar-open", "true");
    return () => {
      document.body.style.removeProperty("overflow");
      document.body.removeAttribute("data-sidebar-open");
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".adfrio-mobile-bottom-nav")) {
        setMobileSidebarOpen(false);
      }
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (isAuthRoute || !token) return;
    let cancelled = false;
    let pending = false;

    const heartbeat = async () => {
      if (pending || cancelled) return;
      pending = true;
      try {
        await authApi.me();
      } catch {
        // Interceptor handles logout and redirect for invalid/deleted users.
      } finally {
        pending = false;
      }
    };

    void heartbeat();
    const timer = window.setInterval(() => {
      void heartbeat();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isAuthRoute, token]);

  return (
    <div className={cn("relative min-h-screen", isAuthRoute ? "text-[#111]" : "bg-background text-foreground")}>
      {!isAuthRoute ? (
        <>
          <TopNav onMenuToggle={() => setMobileSidebarOpen(true)} />
          <SidebarNav mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
        </>
      ) : null}
      <main
        className={cn(
          "relative z-10 w-full",
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
