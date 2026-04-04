import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.use(
  cors({
    origin: [env.CLIENT_URL],
    credentials: true,
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
