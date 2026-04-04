import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      // In development: disable SW registration to prevent the
      // "message channel closed" error from stale service workers.
      disable: mode === "development",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "logo.svg"],
      manifest: {
        name: "Adfrio Media",
        short_name: "Adfrio",
        description: "Ad-free dual media platform for music and video streaming.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/logo.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        // Pre-cache all static assets
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // Bump cache version on every build
        additionalManifestEntries: [],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // API responses — always fresh, never cache stream URLs
            urlPattern: ({ url }) => url.pathname.startsWith("/api"),
            handler: "NetworkOnly"
          },
          {
            // Google Fonts — cache-first, long TTL
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            // YouTube thumbnails — stale-while-revalidate
            urlPattern: /^https:\/\/i\.ytimg\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "yt-thumbnails",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 5173,
    // Proxy API in dev so CORS is never an issue during local development
    proxy: {
      "/api": {
        target: "http://localhost:8081",
        changeOrigin: true,
        secure: false
      }
    }
  }
}));
