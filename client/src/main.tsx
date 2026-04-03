import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { GOOGLE_CLIENT_ID } from "@/lib/constants";
import { router } from "@/app/router";
import "@/index.css";

const queryClient = new QueryClient();

const setupServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) return;

  if (import.meta.env.DEV) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
    return;
  }

  registerSW({ immediate: true });
};

void setupServiceWorker();

const ignoredPromiseMessages = [
  "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received",
  "The play() request was interrupted by a new load request"
];

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { message?: string; name?: string } | undefined;
  if (!reason) return;

  const message = reason.message ?? "";
  const shouldIgnore =
    reason.name === "AbortError" ||
    ignoredPromiseMessages.some((snippet) => message.includes(snippet));

  if (shouldIgnore) {
    event.preventDefault();
  }
});

window.addEventListener("error", (event) => {
  const message = event.message ?? "";
  if (ignoredPromiseMessages.some((snippet) => message.includes(snippet))) {
    event.preventDefault();
  }
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
