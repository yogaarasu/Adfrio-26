import type { Request, Response } from "express";
import { z } from "zod";
import { getStreamData, normalizeStreams, searchPiped } from "../services/piped.js";
import { proxyGooglevideoCandidates, proxyGooglevideoStream } from "../services/stream-proxy.js";
import { sendError } from "../utils/http.js";

const searchSchema = z.object({
  q: z.string().min(1),
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

const extractUpstreamMessage = (error: unknown): string | null => {
  const candidate = error as {
    response?: {
      data?: {
        error?: string;
        message?: string;
      } | string;
    };
    message?: string;
  };

  const data = candidate?.response?.data;
  if (typeof data === "string") return data.slice(0, 200);
  if (typeof data?.error === "string") return data.error;
  if (typeof data?.message === "string") return data.message;
  if (typeof candidate?.message === "string") return candidate.message;
  return null;
};

const extractMediaId = (rawUrl: string): string => {
  try {
    const normalized = rawUrl.startsWith("http")
      ? rawUrl
      : `https://www.youtube.com${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;

    const parsed = new URL(normalized);
    const fromQuery = parsed.searchParams.get("v");
    if (fromQuery) return fromQuery;

    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  } catch {
    const queryMatch = rawUrl.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (queryMatch?.[1]) return queryMatch[1];

    const pathMatch = rawUrl.match(/\/([a-zA-Z0-9_-]{6,})$/);
    return pathMatch?.[1] ?? "";
  }
};

export const searchMedia = async (req: Request, res: Response): Promise<Response> => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid query params");
  }

  try {
    const { items, nextPageToken } = await searchPiped(parsed.data.q, parsed.data.type, parsed.data.pageToken);

    const normalized = items
      .filter((item) => item.url && item.title)
      .map((item) => {
        const mediaId = extractMediaId(item.url ?? "");
        return {
          id: mediaId,
          title: item.title,
          creator: item.uploaderName ?? "Unknown artist",
          thumbnail: item.thumbnail ?? "",
          duration: item.duration ?? null,
          type: parsed.data.type,
          youtubeUrl: mediaId ? `https://www.youtube.com/watch?v=${mediaId}` : null
        };
      })
      .filter((item) => Boolean(item.id));

    return res.json({ items: normalized, nextPageToken });
  } catch (error) {
    const upstream = extractUpstreamMessage(error);
    const message = upstream
      ? `Unable to fetch media right now: ${upstream}`
      : "Unable to fetch media from upstream sources right now";
    return sendError(res, 502, message);
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

export const getMediaStreams = async (req: Request, res: Response): Promise<Response> => {
  const parsed = streamSchema.safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid media id");
  }

  try {
    const rawStreams = await getStreamData(parsed.data.id);
    const streams = normalizeStreams(rawStreams);

    if (streams.audio.length === 0 && streams.video.length === 0 && !streams.hls && !streams.dash) {
      return res.json(unavailablePayload("No playable streams found for this video on current upstream instances"));
    }

    return res.json({ ...streams, unavailableReason: null });
  } catch (error) {
    const upstream = extractUpstreamMessage(error);
    const blocked = upstream?.includes("SignInConfirmNotBotException") || upstream?.includes("temporarily blocked");

    if (blocked) {
      return res.json(unavailablePayload("This video is temporarily blocked by upstream extraction. Try another video."));
    }

    const message = upstream
      ? `Unable to load stream variants right now: ${upstream}`
      : "Unable to load stream variants right now";

    return res.json(unavailablePayload(message));
  }
};

export const proxyMediaStream = async (req: Request, res: Response): Promise<void | Response> => {
  const parsed = proxySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid proxy url");
  }

  try {
    await proxyGooglevideoStream(req, res, parsed.data.url);
  } catch (error) {
    const upstream = extractUpstreamMessage(error);
    const message = upstream
      ? `Unable to proxy stream right now: ${upstream}`
      : "Unable to proxy stream right now";

    if (!res.headersSent) {
      return sendError(res, 502, message);
    }
  }
};

export const proxyMediaById = async (req: Request, res: Response): Promise<void | Response> => {
  const parsedParams = proxyByIdSchema.safeParse(req.params);
  const parsedQuery = proxyByIdQuerySchema.safeParse(req.query);

  if (!parsedParams.success || !parsedQuery.success) {
    return sendError(res, 400, "Invalid proxy request");
  }

  const { id } = parsedParams.data;
  const { type, quality } = parsedQuery.data;

  try {
    const rawStreams = await getStreamData(id);
    const streams = normalizeStreams(rawStreams);

    const candidates =
      type === "audio"
        ? [...streams.audio.map((entry) => entry.url), ...streams.video.map((entry) => entry.url)].filter(Boolean)
        : (() => {
            const exact = quality ? streams.video.filter((entry) => entry.quality === quality).map((entry) => entry.url) : [];
            const allVideo = streams.video.map((entry) => entry.url);
            return [...exact, ...allVideo, ...streams.audio.map((entry) => entry.url)].filter(Boolean);
          })();

    if (candidates.length === 0) {
      return sendError(res, 404, "No proxy stream candidates available");
    }

    await proxyGooglevideoCandidates(req, res, candidates);
  } catch (error) {
    const upstream = extractUpstreamMessage(error);
    const message = upstream
      ? `Unable to proxy stream by media id right now: ${upstream}`
      : "Unable to proxy stream by media id right now";

    if (!res.headersSent) {
      return sendError(res, 502, message);
    }
  }
};
