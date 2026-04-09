import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

const normalizeOrigin = (value: string): string => {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
};

// Trust Render's reverse proxy so req.ip and rate-limit work correctly.
app.set("trust proxy", 1);

const allowedOrigins = new Set<string>([
  normalizeOrigin(env.CLIENT_URL),
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173"
]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, health checks).
      if (!origin) return callback(null, true);

      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.has(normalized)) return callback(null, true);

      // Allow Render preview domains.
      if (/^https:\/\/.+\.onrender\.com$/.test(normalized)) return callback(null, true);

      // Allow Vercel preview domains.
      if (/^https:\/\/.+\.vercel\.app$/.test(normalized)) return callback(null, true);

      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "range"],
    exposedHeaders: [
      "content-range",
      "accept-ranges",
      "content-length",
      "content-type",
      "cache-control",
      "etag",
      "x-adfrio-proxy"
    ]
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api", apiRouter);
app.use(errorHandler);
