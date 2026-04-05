import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/router";
import "@/index.css";

// ------------------------------------------------------------------
// Suppressed browser / extension noise
// ------------------------------------------------------------------
const SUPPRESSED_MESSAGES = [
  "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received",
  "The play() request was interrupted by a new load request",
  "The fetching process for the media resource",
  "AbortError",
  "compute-pressure is not allowed in this document"
];

const shouldSuppress = (msg: string): boolean =>
  SUPPRESSED_MESSAGES.some((s) => msg.includes(s));

const COMPUTE_PRESSURE_TOKEN = "compute-pressure";

const patchIframeAllowPolicy = (iframe: HTMLIFrameElement): void => {
  const src = iframe.src || "";
  if (!/(youtube\.com|youtube-nocookie\.com)/i.test(src)) return;

  const current = (iframe.getAttribute("allow") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  if (current.includes(COMPUTE_PRESSURE_TOKEN)) return;
  iframe.setAttribute("allow", [...current, COMPUTE_PRESSURE_TOKEN].join("; "));
};

const setupIframePolicyPatch = (): void => {
  if (typeof MutationObserver === "undefined") return;

  const patchExisting = () => {
    document.querySelectorAll("iframe").forEach((node) => {
      patchIframeAllowPolicy(node as HTMLIFrameElement);
    });
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.tagName === "IFRAME") {
          patchIframeAllowPolicy(node as HTMLIFrameElement);
        }
        node.querySelectorAll?.("iframe").forEach((iframeNode) => {
          patchIframeAllowPolicy(iframeNode as HTMLIFrameElement);
        });
      });
    }
  });

  patchExisting();
  observer.observe(document.documentElement, { childList: true, subtree: true });
};

if (import.meta.env.DEV) {
  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const text = args
      .map((value) => {
        if (typeof value === "string") return value;
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })
      .join(" ");
    if (shouldSuppress(text)) return;
    originalWarn(...args);
  };
}

setupIframePolicyPatch();

if (import.meta.env.DEV && window.location.hostname === "127.0.0.1") {
  const normalized = new URL(window.location.href);
  normalized.hostname = "localhost";
  window.location.replace(normalized.toString());
}

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
// Service Worker registration
// ------------------------------------------------------------------
const setupServiceWorker = (): void => {
  if (!("serviceWorker" in navigator)) return;

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
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
