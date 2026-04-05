import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { sendError } from "../utils/http.js";
import {
  searchYoutube,
  getStreamSource,
  getVideoInfo,
  initPlayDl,
} from "../services/youtube.service.js";
import { proxyGooglevideoCandidates } from "../services/stream-proxy.js";

// ─── Validation schemas ───────────────────────────────────────────────────────

const searchSchema = z.object({
  q: z.string().optional(),
  type: z.enum(["music", "video"]).default("music"),
  pageToken: z.string().optional(),
});

const proxyByIdSchema = z.object({
  id: z.string().min(1),
});

const proxyByIdQuerySchema = z.object({
  type: z.enum(["audio", "video"]).default("audio"),
  quality: z.string().optional(),
});

const streamSchema = z.object({
  id: z.string().min(1),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const unavailablePayload = (reason: string) => ({
  title: "Unavailable",
  description: "",
  thumbnail: "",
  uploader: "",
  audio: [],
  video: [],
  related: [],
  hls: null,
  dash: null,
  unavailableReason: reason,
});

/** Build the server base URL from the incoming request — works in dev and production. */
const buildBaseUrl = (req: Request): string => {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol ?? "http";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ??
    req.headers.host ??
    `localhost:${env.PORT}`;
  return `${proto}://${host}/api`;
};

const cleanVideoId = (raw: string): string => {
  if (!raw.startsWith("http")) return raw;
  try {
    const parsed = new URL(raw);
    return parsed.searchParams.get("v") ?? raw.split("/").pop() ?? raw;
  } catch {
    return raw;
  }
};

// ─── Handlers ────────────────────────────────────────────────────────────────

/** GET /api/media/search */
export const searchMedia = async (req: Request, res: Response): Promise<Response> => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, "Invalid query params");

  try {
    const { items, nextPageToken } = await searchYoutube(
      parsed.data.q,
      parsed.data.type as "music" | "video",
      parsed.data.pageToken
    );
    return res.json({ items, nextPageToken });
  } catch (error) {
    console.error("Search Error:", error);
    return sendError(res, 502, "Unable to fetch media from upstream sources right now");
  }
};

/**
 * GET /api/media/streams/:id
 *
 * Returns stream metadata. Both audio & video point to our proxy endpoint
 * so the browser always goes through the server (avoids CORS on googlevideo.com).
 */
export const getMediaStreams = async (req: Request, res: Response): Promise<Response> => {
  const parsed = streamSchema.safeParse(req.params);
  if (!parsed.success) return sendError(res, 400, "Invalid media id");

  const id = cleanVideoId(parsed.data.id);

  try {
    await initPlayDl();
    const info = await getVideoInfo(id);
    const baseUrl = buildBaseUrl(req);

    // Build proxy URLs. The actual source is resolved server-side on demand.
    const audioProxyUrl = `${baseUrl}/media/proxy/${encodeURIComponent(id)}?type=audio`;
    const videoProxyUrl = `${baseUrl}/media/proxy/${encodeURIComponent(id)}?type=video`;

    // Also provide any direct stream URLs from Innertube as fallback hints
    // so the client can verify availability before loading.
    const audioEntries = info.audioStreams.length > 0
      ? info.audioStreams.slice(0, 1).map(() => ({
          url: audioProxyUrl,
          mimeType: "audio/mpeg",
          bitrate: 128000,
        }))
      : [{ url: audioProxyUrl, mimeType: "audio/mpeg", bitrate: 128000 }];

    const videoEntries = info.videoStreams.length > 0
      ? info.videoStreams.slice(0, 3).map((v) => ({
          url: `${baseUrl}/media/proxy/${encodeURIComponent(id)}?type=video&quality=${encodeURIComponent(v.quality)}`,
          quality: v.quality,
          format: v.mimeType,
        }))
      : [{ url: videoProxyUrl, quality: "720p", format: "video/mp4" }];

    // Build related as MediaItem array
    const related = info.related.map((r) => ({
      id: r.id,
      title: r.title,
      creator: r.creator,
      thumbnail: r.thumbnail,
      duration: r.duration,
      type: r.type,
      youtubeUrl: r.youtubeUrl,
    }));

    return res.json({
      title: info.title,
      description: info.description,
      thumbnail: info.thumbnail,
      uploader: info.uploader,
      audio: audioEntries,
      video: videoEntries,
      related,
      hls: info.hls,
      dash: info.dash,
      unavailableReason: null,
    });
  } catch (error) {
    console.error("getMediaStreams Error:", error);
    return res.json(unavailablePayload("Unable to load stream variants right now"));
  }
};

/**
 * GET /api/media/proxy/:id?type=audio|video
 *
 * Proxies the actual raw stream bytes through the server.
 * Handles Range requests for seek support.
 */
export const proxyMediaById = async (
  req: Request,
  res: Response
): Promise<void | Response | any> => {
  const parsedParams = proxyByIdSchema.safeParse(req.params);
  const parsedQuery = proxyByIdQuerySchema.safeParse(req.query);

  if (!parsedParams.success || !parsedQuery.success) {
    return sendError(res, 400, "Invalid proxy request");
  }

  const { id } = parsedParams.data;
  const { type } = parsedQuery.data;

  try {
    const streamInfo = await getStreamSource(id, type as "audio" | "video");

    // ── URL proxy (Piped direct URL) ────────────────────────────────────────
    if ("url" in streamInfo) {
      const targetUrl = streamInfo.url;
      try {
        console.log(`[proxy] Piping via stream-proxy -> ${targetUrl.substring(0, 60)}...`);
        return await proxyGooglevideoCandidates(req, res, [targetUrl]);
      } catch (proxyErr: any) {
        console.error("[proxy] stream-proxy failed, 302 redirect:", proxyErr?.message);
        if (!res.headersSent) {
          return res.redirect(302, targetUrl);
        }
        return;
      }
    }

    // ── Node.js stream (play-dl or ytdl-core) ────────────────────────────────
    if (!("stream" in streamInfo) || !streamInfo.stream) {
      console.error("[proxy] No stream object returned from getStreamSource for", id);
      return sendError(res, 502, "No stream object returned from source");
    }

    const rawStream = streamInfo.stream;
    const readable: NodeJS.ReadableStream = (rawStream as any).stream ?? rawStream;

    // Prefer the mimeType returned by the extractor; fall back to type-derived default
    const mimeType =
      (streamInfo as any).mimeType ??
      (type === "audio" ? "audio/mpeg" : "video/mp4");

    const contentLength: number | undefined =
      typeof (rawStream as any).content_length === "number"
        ? (rawStream as any).content_length
        : typeof (rawStream as any).contentLength === "number"
        ? (rawStream as any).contentLength
        : undefined;

    const rangeHeader = req.headers.range;

    if (contentLength && rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${contentLength}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mimeType,
        "Cache-Control": "no-cache",
        "X-Adfrio-Proxy": "node-stream",
      });
    } else {
      const headers: Record<string, string | number> = {
        "Accept-Ranges": "bytes",
        "Content-Type": mimeType,
        "Cache-Control": "no-cache",
        "X-Adfrio-Proxy": "node-stream",
      };
      if (contentLength) headers["Content-Length"] = contentLength;
      res.writeHead(200, headers);
    }

    req.on("close", () => {
      try { (readable as any).destroy?.(); } catch { /* ignore */ }
    });

    readable.on("error", (err: any) => {
      console.error("[proxy] stream pipe error:", err?.message ?? err);
      if (!res.headersSent) res.statusCode = 502;
      res.end();
    });

    readable.pipe(res);
  } catch (error: any) {
    console.error("[proxy] fatal error for", id, ":", error?.message ?? error);
    if (!res.headersSent) {
      return sendError(res, 502, "Unable to proxy stream — please try again");
    }
  }
};

// Keep deprecated URL-based proxy returning 501
export const proxyMediaStream = async (req: Request, res: Response): Promise<Response> => {
  return sendError(res, 501, "Direct URL proxying is deprecated. Use id-based proxy.");
};
