import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

// Collect all allowed CORS origins
const allowedOrigins = new Set<string>(
  [
    env.CLIENT_URL,
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
  ].filter(Boolean)
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, Render health-checks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      // Allow any Render preview subdomain (*.onrender.com)
      if (/\.onrender\.com$/.test(origin)) return callback(null, true);
      // Allow any Vercel preview subdomain (*.vercel.app)
      if (/\.vercel\.app$/.test(origin)) return callback(null, true);
      callback(null, true); // Permissive — tighten in production if needed
    },
    credentials: true,
    allowedHeaders: ["authorization", "content-type", "range"],
    exposedHeaders: [
      "content-range",
      "accept-ranges",
      "content-length",
      "content-type",
      "cache-control",
      "etag",
      "x-adfrio-proxy",
    ],
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
