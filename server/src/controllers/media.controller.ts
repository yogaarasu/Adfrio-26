import type { Request, Response } from "express";
import { z } from "zod";
import play from "play-dl";
import { env } from "../config/env.js";
import { sendError } from "../utils/http.js";
import { searchYoutube, getStreamSource, initPlayDl } from "../services/youtube.service.js";

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
        // Basic fallback info if video_info fails
        info = {
            video_details: {
                title: "Media Item",
                description: "",
                thumbnails: [{ url: `https://img.youtube.com/vi/${parsed.data.id}/maxresdefault.jpg` }],
                channel: { name: "YouTube" }
            }
        };
    }
    
    // Using a relative path for the frontend (the client constant will prepend its API_URL)
    // or we can use the server's PORT to build a full URL if needed.
    const baseUrl = `http://localhost:${env.PORT}/api`;
    
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

  // If it's a direct proxy of a URL, we might still want to use play-dl if it's a youtube url
  return sendError(res, 501, "Direct URL proxying is deprecated. Use id-based proxy.");
};

export const proxyMediaById = async (req: Request, res: Response): Promise<void | Response> => {
  const parsedParams = proxyByIdSchema.safeParse(req.params);
  const parsedQuery = proxyByIdQuerySchema.safeParse(req.query);

  if (!parsedParams.success || !parsedQuery.success) {
    return sendError(res, 400, "Invalid proxy request");
  }

  const { id } = parsedParams.data;
  const { type } = parsedQuery.data;

  try {
    const streamInfo = await getStreamSource(id, type as "audio" | "video");

    // Handle Redirect if the server is blocked
    if ("url" in streamInfo) {
      console.log(`Redirecting to: ${streamInfo.url.substring(0, 50)}...`);
      return res.redirect(302, streamInfo.url);
    }

    if (!("stream" in streamInfo) || !streamInfo.stream) {
      return sendError(res, 502, "Unable to proxy stream by media id right now");
    }

    const { stream } = streamInfo;

    // Set headers for audio/video
    res.setHeader("Content-Type", type === "audio" ? "audio/mpeg" : "video/mp4");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Adfrio-Proxy", "play-dl-proxy");

    stream.pipe(res);

    req.on("close", () => {
      if (stream.destroy) stream.destroy();
    });

    stream.on("error", (err: any) => {
      console.error("Stream Proxy Error:", err);
      if (!res.headersSent) {
        res.status(502).end();
      } else {
        res.end();
      }
    });

  } catch (error) {
    console.error("Proxy Media Error:", error);
    if (!res.headersSent) {
      return sendError(res, 502, "Unable to proxy stream by media id right now");
    }
  }
};
