import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { RouterProvider } from "react-router-dom";
import { GOOGLE_CLIENT_ID } from "@/lib/constants";
import { router } from "@/app/router";
import "@/index.css";

// ------------------------------------------------------------------
// Suppressed browser / extension noise
// ------------------------------------------------------------------
const SUPPRESSED_MESSAGES = [
  "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received",
  "The play() request was interrupted by a new load request",
  "The fetching process for the media resource",
  "AbortError"
];

const shouldSuppress = (msg: string): boolean =>
  SUPPRESSED_MESSAGES.some((s) => msg.includes(s));

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { message?: string; name?: string } | null | undefined;
  if (!reason) return;
  if (reason.name === "AbortError" || shouldSuppress(reason.message ?? "")) {
    event.preventDefault();
  }
});

window.addEventListener("error", (event) => {
  if (shouldSuppress(event.message ?? "")) {
    event.preventDefault();
  }
});

// ------------------------------------------------------------------
// Service Worker — only register in production, aggressively unregister
// in development to avoid stale SW message-channel errors.
// ------------------------------------------------------------------
const setupServiceWorker = (): void => {
  if (!("serviceWorker" in navigator)) return;

  if (import.meta.env.DEV) {
    // Fire-and-forget — do NOT await before rendering; SW cleanup is best-effort.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((r) => void r.unregister());
    }).catch(() => undefined);

    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((k) => void caches.delete(k));
      }).catch(() => undefined);
    }
    return;
  }

  // Production only — dynamic import so it is tree-shaken in dev.
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onNeedRefresh() { /* Silently update */ },
      onOfflineReady() { /* Ready */ },
    });
  }).catch(() => undefined);
};

setupServiceWorker();

// ------------------------------------------------------------------
// React Query — tuned for a media streaming app
// ------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,      // 2 min — feed stays fresh
      gcTime: 10 * 60 * 1000,        // 10 min — inactive pages stay in cache
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
