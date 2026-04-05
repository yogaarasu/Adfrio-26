import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig(() => ({
  plugins: [
    react(),
    VitePWA({
      disable: false,
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
        type: "module"
      },
      includeAssets: [
        "icons/adfrio-192.png",
        "icons/adfrio-512.png",
        "icons/adfrio-maskable-192.png",
        "icons/adfrio-maskable-512.png"
      ],
      manifest: {
        name: "Adfrio",
        short_name: "Adfrio",
        description: "Adfrio music and video streaming app.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icons/adfrio-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/adfrio-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icons/adfrio-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/icons/adfrio-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        // Pre-cache all static assets
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        globIgnores: ["**/adfrio-logo.png"],
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
    headers: {
      "Permissions-Policy": "compute-pressure=*"
    },
    // Proxy API in dev so CORS is never an issue during local development
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false
      }
    }
  }
}));
