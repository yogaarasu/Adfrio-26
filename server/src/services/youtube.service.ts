/**
 * youtube.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified search + stream-source resolver.
 *
 * Priority order
 *   Search:  Innertube → play-dl → Piped
 *   Stream:  Innertube → ytdl-core → play-dl → Piped direct URL
 *
 * Innertube (youtubei.js) is the most resilient because it uses the internal
 * YouTube API used by the official web client, so it is not subject to the
 * same bot-detection that breaks play-dl and ytdl-core in production.
 */

import play from "play-dl";
import ytdl from "@distube/ytdl-core";
import { getStreamData, normalizeStreams, searchPiped } from "./piped.js";
import { innertubeSearch, innertubeGetStreams, getInnertube } from "./innertube.js";
import { env } from "../config/env.js";

export interface MediaItem {
  id: string;
  title: string;
  creator: string;
  thumbnail: string;
  duration: number | null;
  type: "music" | "video";
  youtubeUrl: string;
}

const DISCOVERY_KEYWORDS = [
  "Lo-fi beats for relaxing", "Chillhop 2024", "Deep House Mix", "Synthwave 80s",
  "Acoustic covers of popular songs", "Jazz for study", "Classical masterpieces",
  "Epic cinematic music", "Nature sounds for sleep", "Techno 2024", "Reggae vibes",
  "Pop hits today", "Rock classics", "Piano melodies", "Gaming music mix",
  "Meditation sounds", "Indie pop discovery", "Blues guitar solo", "World music mix",
  "Future bass", "Trap beats", "Soulful R&B", "Metal workout", "Country road songs",
  "Top hits 2024", "Trending music", "New releases", "Billboard hot 100",
];

let playDlInitialized = false;

export const initPlayDl = async (): Promise<void> => {
  if (playDlInitialized) return;

  if (env.YOUTUBE_COOKIE?.trim()) {
    try {
      await play.setToken({ youtube: { cookie: env.YOUTUBE_COOKIE.trim() } });
      console.log("[play-dl] YouTube cookie set successfully");
    } catch (err: any) {
      console.warn("[play-dl] Failed to set YouTube cookie:", err?.message);
    }
  }

  playDlInitialized = true;
};

// ─── Search ───────────────────────────────────────────────────────────────────

export const searchYoutube = async (
  query: string | undefined,
  type: "music" | "video" = "music",
  pageToken?: string
): Promise<{ items: MediaItem[]; nextPageToken: string | null }> => {
  await initPlayDl();

  const isDiscovery = !query || query.trim().length === 0;
  const keywordIndex = isDiscovery ? parseInt(pageToken || "0", 10) : 0;

  const actualQuery = isDiscovery
    ? DISCOVERY_KEYWORDS[keywordIndex % DISCOVERY_KEYWORDS.length]!
    : query!;

  let results: MediaItem[] = [];
  let nextPageToken: string | null = isDiscovery ? (keywordIndex + 1).toString() : null;

  // ── 1. Innertube (most reliable) ─────────────────────────────────────────
  try {
    const searchResults = await innertubeSearch(actualQuery, 24);

    results = searchResults.map((v) => ({
      id: v.id,
      title: v.title,
      creator: v.creator,
      thumbnail: v.thumbnail,
      duration: v.duration,
      type: type as "music" | "video",
      youtubeUrl: `https://www.youtube.com/watch?v=${v.id}`,
    })).filter((item) => Boolean(item.id));

    if (results.length > 0) {
      console.log(`[search] Innertube OK — ${results.length} results for "${actualQuery}"`);
    }
  } catch (err: any) {
    console.warn("[search] Innertube failed, trying play-dl:", err?.message);

    // ── 2. play-dl ──────────────────────────────────────────────────────────
    try {
      const searchResults = await play.search(actualQuery, {
        limit: 20,
        source: { youtube: "video" },
      });

      results = searchResults
        .map((v) => ({
          id: v.id || "",
          title: v.title || "Unknown Title",
          creator: v.channel?.name || "Unknown Creator",
          thumbnail: v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          duration: v.durationInSec || null,
          type: type as "music" | "video",
          youtubeUrl: v.url,
        }))
        .filter((item) => Boolean(item.id));
    } catch (playDlErr: any) {
      console.warn("[search] play-dl failed, trying Piped:", playDlErr?.message);

      // ── 3. Piped ────────────────────────────────────────────────────────────
      try {
        const pipedResults = await searchPiped(actualQuery, type, pageToken || undefined);

        results = pipedResults.items
          .map((m) => {
            const id = m.url ? (m.url.split("v=")[1] || m.url.split("/").pop() || "") : "";
            return {
              id,
              title: m.title || "Unknown Title",
              creator: m.uploaderName || "Unknown Artist",
              thumbnail: m.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
              duration: m.duration || null,
              type: type as "music" | "video",
              youtubeUrl: `https://www.youtube.com/watch?v=${id}`,
            };
          })
          .filter((item) => Boolean(item.id));

        if (!isDiscovery) {
          nextPageToken = pipedResults.nextPageToken;
        }
      } catch (pipedErr: any) {
        console.error("[search] All search sources failed:", pipedErr?.message);
      }
    }
  }

  // De-duplicate + shuffle for discovery variety
  const unique = Array.from(new Map(results.map((item) => [item.id, item])).values());
  const shuffled = isDiscovery ? unique.sort(() => Math.random() - 0.5) : unique;

  return { items: shuffled, nextPageToken };
};

// ─── Stream Source Resolution ─────────────────────────────────────────────────

/**
 * Returns either a Node.js Readable stream or a direct URL string.
 * The controller (media.controller.ts) decides how to use it.
 */
export const getStreamSource = async (
  videoId: string,
  type: "audio" | "video"
): Promise<{ stream: any } | { url: string }> => {
  await initPlayDl();

  const videoUrl = videoId.startsWith("http")
    ? videoId
    : `https://www.youtube.com/watch?v=${videoId}`;

  const cleanId = videoId.startsWith("http")
    ? (new URL(videoId).searchParams.get("v") ?? videoId.split("/").pop() ?? videoId)
    : videoId;

  // ── 1. Innertube — High priority streaming ───────────────────────────
  try {
    const streamData = await innertubeGetStreams(cleanId);
    const candidates = type === "audio" ? streamData.audioStreams : streamData.videoStreams;
    const best = candidates[0];
    if (best?.url) {
      console.log(`[stream] Innertube OK for ${cleanId} (${type})`);
      return { url: best.url };
    }
  } catch (innertubeErr: any) {
    console.warn(`[stream] Innertube failed for ${cleanId}:`, innertubeErr?.message);
  }

  // ── 2. ytdl-core ─────────────────────────────────────────────────────────
  try {
    const ytdlInfo = await ytdl.getInfo(videoUrl);
    const stream = ytdl.downloadFromInfo(ytdlInfo, {
      filter: type === "audio" ? "audioonly" : "videoandaudio",
      quality: type === "audio" ? "highestaudio" : "highestvideo",
      highWaterMark: 1 << 25, // 32 MB
    });
    console.log(`[stream] ytdl OK for ${cleanId} (${type})`);
    return { stream };
  } catch (ytdlErr: any) {
    console.warn(`[stream] ytdl failed for ${cleanId}:`, ytdlErr?.message);
  }

  // ── 3. play-dl ───────────────────────────────────────────────────────────
  try {
    const stream = await play.stream(videoUrl, {
      quality: type === "audio" ? 3 : 2,
      seek: 0,
    } as Parameters<typeof play.stream>[1]);
    console.log(`[stream] play-dl OK for ${cleanId} (${type})`);
    return stream;
  } catch (playDlErr: any) {
    console.warn(`[stream] play-dl failed for ${cleanId}:`, playDlErr?.message);
  }

  // ── 4. Piped direct URL (last resort) ────────────────────────────────────
  const rawStreams = await getStreamData(cleanId);
  const normalized = normalizeStreams(rawStreams);

  const candidateUrl =
    type === "audio" ? normalized.audio[0]?.url : normalized.video[0]?.url;

  if (!candidateUrl) {
    throw new Error(`No playable stream found for ${cleanId} on any source`);
  }

  console.log(`[stream] Piped redirect for ${cleanId}`);
  return { url: candidateUrl };
};

// ─── Video Info (for streams endpoint) ───────────────────────────────────────

export type VideoInfo = {
  title: string;
  description: string;
  thumbnail: string;
  uploader: string;
  audioStreams: Array<{ url: string; mimeType: string; bitrate: number }>;
  videoStreams: Array<{ url: string; quality: string; mimeType: string }>;
  related: MediaItem[];
  hls: string | null;
  dash: string | null;
};

export const getVideoInfo = async (videoId: string): Promise<VideoInfo> => {
  const cleanId = videoId.startsWith("http")
    ? (new URL(videoId).searchParams.get("v") ?? videoId.split("/").pop() ?? videoId)
    : videoId;

  // ── 1. Innertube ────────────────────────────────────────────────────────
  try {
    const data = await innertubeGetStreams(cleanId);

    // Resolve related items (basic info)
    const related: MediaItem[] = data.relatedIds
      .map((id) => ({
        id,
        title: "Related Video",
        creator: "YouTube",
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: null,
        type: "video" as const,
        youtubeUrl: `https://www.youtube.com/watch?v=${id}`,
      }));

    return {
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      uploader: data.uploader,
      audioStreams: data.audioStreams,
      videoStreams: data.videoStreams,
      related,
      hls: data.hls,
      dash: data.dash,
    };
  } catch (err: any) {
    console.warn(`[getVideoInfo] Innertube failed for ${cleanId}:`, err?.message);
  }

  // ── 2. play-dl fallback ────────────────────────────────────────────────
  await initPlayDl();
  try {
    const info = await play.video_info(`https://www.youtube.com/watch?v=${cleanId}`);
    return {
      title: info.video_details.title ?? "Unknown Title",
      description: info.video_details.description ?? "",
      thumbnail:
        info.video_details.thumbnails?.[info.video_details.thumbnails.length - 1]?.url ??
        `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
      uploader: info.video_details.channel?.name ?? "Unknown Creator",
      audioStreams: [],
      videoStreams: [],
      related: [],
      hls: null,
      dash: null,
    };
  } catch (err: any) {
    console.warn(`[getVideoInfo] play-dl failed for ${cleanId}:`, err?.message);
  }

  // ── 3. Minimal stub so the proxy URL is still returned ─────────────────
  return {
    title: "Media Item",
    description: "",
    thumbnail: `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
    uploader: "YouTube",
    audioStreams: [],
    videoStreams: [],
    related: [],
    hls: null,
    dash: null,
  };
};
