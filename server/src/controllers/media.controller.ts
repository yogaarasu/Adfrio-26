import type { Request, Response } from "express";
import { z } from "zod";
import play from "play-dl";
import { env } from "../config/env.js";
import { sendError } from "../utils/http.js";
import { searchYoutube, getStreamSource, initPlayDl } from "../services/youtube.service.js";
import { proxyGooglevideoCandidates } from "../services/stream-proxy.js";

const searchSchema = z.object({
  q: z.string().optional(),
  type: z.enum(["music", "video"]).default("music"),
  pageToken: z.string().optional()
});

const proxySchema = z.object({
  url: z.string().url()
});

const proxyByIdSchema = z.object({
  id: z.string().min(1)
});

const proxyByIdQuerySchema = z.object({
  type: z.enum(["audio", "video"]).default("audio"),
  quality: z.string().optional()
});

export const searchMedia = async (req: Request, res: Response): Promise<Response> => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid query params");
  }

  try {
    const { items, nextPageToken } = await searchYoutube(
      parsed.data.q,
      parsed.data.type as "music" | "video",
      parsed.data.pageToken
    );
    return res.json({ items, nextPageToken });
  } catch (error) {
    console.error("Search Youtube Error:", error);
    return sendError(res, 502, "Unable to fetch media from upstream sources right now");
  }
};

const streamSchema = z.object({
  id: z.string().min(1)
});

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
  unavailableReason: reason
});

/** Build the server base URL from the incoming request — works in dev and production. */
const buildBaseUrl = (req: Request): string => {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol ?? "http";
  const host = (req.headers["x-forwarded-host"] as string | undefined)
    ?? req.headers.host
    ?? `localhost:${env.PORT}`;
  return `${proto}://${host}/api`;
};

export const getMediaStreams = async (req: Request, res: Response): Promise<Response> => {
  const parsed = streamSchema.safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid media id");
  }

  try {
    await initPlayDl();
    const videoUrl = parsed.data.id.startsWith("http")
      ? parsed.data.id
      : `https://www.youtube.com/watch?v=${parsed.data.id}`;

    let info: any;
    try {
      info = await play.video_info(videoUrl);
    } catch (err) {
      console.warn("play-dl.video_info failed, using basic info...");
      info = {
        video_details: {
          title: "Media Item",
          description: "",
          thumbnails: [{ url: `https://img.youtube.com/vi/${parsed.data.id}/maxresdefault.jpg` }],
          channel: { name: "YouTube" }
        }
      };
    }

    const baseUrl = buildBaseUrl(req);

    return res.json({
      title: info.video_details.title,
      description: info.video_details.description,
      thumbnail: info.video_details.thumbnails?.[0]?.url,
      uploader: info.video_details.channel?.name,
      audio: [{
        url: `${baseUrl}/media/proxy/${parsed.data.id}?type=audio`,
        mimeType: "audio/mpeg",
        bitrate: 128000
      }],
      video: [{
        url: `${baseUrl}/media/proxy/${parsed.data.id}?type=video`,
        quality: "720p",
        format: "video/mp4"
      }],
      related: [],
      hls: null,
      dash: null,
      unavailableReason: null
    });
  } catch (error) {
    console.error("Get Media Streams Error:", error);
    return res.json(unavailablePayload("Unable to load stream variants right now"));
  }
};

export const proxyMediaStream = async (req: Request, res: Response): Promise<void | Response> => {
  const parsed = proxySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid proxy url");
  }
  return sendError(res, 501, "Direct URL proxying is deprecated. Use id-based proxy.");
};

export const proxyMediaById = async (req: Request, res: Response): Promise<void | Response | any> => {
  const parsedParams = proxyByIdSchema.safeParse(req.params);
  const parsedQuery = proxyByIdQuerySchema.safeParse(req.query);

  if (!parsedParams.success || !parsedQuery.success) {
    return sendError(res, 400, "Invalid proxy request");
  }

  const { id } = parsedParams.data;
  const { type } = parsedQuery.data;

  try {
    const streamInfo = await getStreamSource(id, type as "audio" | "video");

    // ----------------------------------------------------------------
    // If play-dl/ytdl are blocked, we get a Piped URL fallback.
    // We proxy this on the backend explicitly via stream-proxy!
    // ----------------------------------------------------------------
    if ("url" in streamInfo) {
      console.log(`[proxy] Fetching upstream via proxy worker: ${streamInfo.url.substring(0, 80)}...`);
      return proxyGooglevideoCandidates(req, res, [streamInfo.url]);
    }

    if (!("stream" in streamInfo) || !streamInfo.stream) {
      return sendError(res, 502, "No stream object returned from source");
    }

    const rawStream = streamInfo.stream;

    // play-dl returns { stream: Readable, content_length, type }
    // @distube/ytdl-core returns a Readable directly
    const readable: NodeJS.ReadableStream =
      (rawStream as any).stream ?? rawStream;

    const contentLength: number | undefined =
      typeof (rawStream as any).content_length === "number"
        ? (rawStream as any).content_length
        : typeof (rawStream as any).contentLength === "number"
        ? (rawStream as any).contentLength
        : undefined;

    // ----------------------------------------------------------------
    // Range-request handling — required for audio/video seeking
    // ----------------------------------------------------------------
    const rangeHeader = req.headers.range;
    const mimeType = type === "audio" ? "audio/mpeg" : "video/mp4";

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
        "Cache-Control": "public, max-age=3600",
        "X-Adfrio-Proxy": "play-dl-stream"
      });
    } else {
      const headers: Record<string, string | number> = {
        "Accept-Ranges": "bytes",
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=3600",
        "X-Adfrio-Proxy": "play-dl-stream"
      };
      if (contentLength) {
        headers["Content-Length"] = contentLength;
      }
      res.writeHead(200, headers);
    }

    // ----------------------------------------------------------------
    // Pipe — destroy upstream on client disconnect
    // ----------------------------------------------------------------
    req.on("close", () => {
      try { (readable as any).destroy?.(); } catch { /* ignore */ }
    });

    readable.on("error", (err: any) => {
      console.error("[proxy] stream error:", err?.message ?? err);
      if (!res.headersSent) {
        res.statusCode = 502;
      }
      res.end();
    });

    readable.pipe(res);

  } catch (error: any) {
    console.error("[proxy] fatal error:", error?.message ?? error);
    if (!res.headersSent) {
      return sendError(res, 502, "Unable to proxy stream — please try again");
    }
  }
};
