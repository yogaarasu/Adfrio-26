/**
 * youtube.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified search + stream-source resolver.
 *
 * Stream priority order (most → least reliable in production):
 *   1. play-dl stream() — pipes directly, works with cookie auth on Render
 *   2. ytdl-core downloadFromInfo — Node.js stream, no redirects
 *   3. Piped direct URL — last resort, may need CORS proxy
 *
 * Search priority order:
 *   Innertube → play-dl → Piped
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
  creatorAvatarUrl?: string | null;
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

  const cookie = env.YOUTUBE_COOKIE?.trim();
  if (cookie) {
    try {
      // play-dl v4+ uses setToken; some builds export it differently
      const playAny = play as any;
      const setter = playAny.setToken ?? playAny.default?.setToken;
      if (typeof setter === "function") {
        await setter({ youtube: { cookie } });
        console.log("[play-dl] YouTube cookie accepted ✓");
      } else {
        console.warn("[play-dl] setToken not found — running without cookie");
      }
    } catch (err: any) {
      console.warn("[play-dl] setToken threw:", err?.message);
    }
  } else {
    console.warn("[play-dl] No YOUTUBE_COOKIE set — bot-detection risk in production");
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
      creatorAvatarUrl: v.creatorAvatarUrl ?? null,
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
          creatorAvatarUrl: (v as any).channel?.icons?.[0]?.url ?? null,
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
              creatorAvatarUrl: null,
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

  // De-duplicate while preserving source order (no random shuffling).
  const unique = Array.from(new Map(results.map((item) => [item.id, item])).values());

  return { items: unique, nextPageToken };
};

// ─── Stream Source Resolution ─────────────────────────────────────────────────────

/**
 * Returns a Node.js Readable stream (preferred — piped directly to the browser
 * response with no redirect/CORS issues) or a direct URL as last resort.
 *
 * Priority order (most → least reliable):
 *   1. Innertube client.download() — v17 native API; handles deciphering internally,
 *      works without cookies for most videos, returns a proper Node.js ReadableStream.
 *   2. play-dl stream() — fast when YOUTUBE_COOKIE is set in env.
 *   3. ytdl-core downloadFromInfo — heavier init but reliable fallback.
 *   4. Piped direct URL — absolute last resort; controller proxies via stream-proxy.ts.
 */
export const getStreamSource = async (
  videoId: string,
  type: "audio" | "video"
): Promise<{ stream: any; mimeType?: string } | { url: string }> => {
  await initPlayDl();

  const videoUrl = videoId.startsWith("http")
    ? videoId
    : `https://www.youtube.com/watch?v=${videoId}`;

  const cleanId = videoId.startsWith("http")
    ? (new URL(videoId).searchParams.get("v") ?? videoId.split("/").pop() ?? videoId)
    : videoId;

  // ── 1. Innertube client.download() (primary — most reliable) ──────────────────
  // youtubei.js handles all signature deciphering internally and returns a
  // proper ReadableStream. No cookies required for most public videos.
  try {
    const client = await getInnertube();
    const stream = await client.download(cleanId, {
      type: type === "audio" ? "audio" : "video+audio",
      quality: type === "audio" ? "best" : "360p",
      client: "WEB",
    });

    // youtubei.js returns a web ReadableStream — convert it to Node.js Readable
    const { Readable } = await import("stream");
    const nodeStream = Readable.fromWeb(stream as any);

    const mimeType = type === "audio" ? "audio/webm; codecs=opus" : "video/mp4";
    console.log(`[stream] ✓ Innertube download OK for ${cleanId} (${type})`);
    return { stream: nodeStream, mimeType };
  } catch (innertubeErr: any) {
    console.error(
      `[stream] ❌ Innertube download FAILED for ${cleanId} (${type}):`,
      innertubeErr?.message ?? innertubeErr
    );
  }

  // ── 2. play-dl (secondary) ────────────────────────────────────────────────────────
  // play-dl.stream() returns a PlayStream; we extract the inner Node.js Readable.
  try {
    const playdlResult = await play.stream(videoUrl, {
      quality: type === "audio" ? 3 : 2,
    } as Parameters<typeof play.stream>[1]);

    const readable = (playdlResult as any).stream ?? playdlResult;
    const mimeType: string = type === "audio" ? "audio/mpeg" : "video/mp4";

    console.log(`[stream] ✓ play-dl OK for ${cleanId} (${type})`);
    return { stream: readable, mimeType };
  } catch (playDlErr: any) {
    console.error(
      `[stream] ❌ play-dl FAILED for ${cleanId} (${type}):`,
      playDlErr?.message ?? playDlErr
    );
  }

  // ── 3. ytdl-core (tertiary) ───────────────────────────────────────────────────────
  try {
    const ytdlInfo = await ytdl.getInfo(videoUrl);
    const stream = ytdl.downloadFromInfo(ytdlInfo, {
      filter: type === "audio" ? "audioonly" : "videoandaudio",
      quality: type === "audio" ? "highestaudio" : "highestvideo",
      highWaterMark: 1 << 25, // 32 MB
    });
    console.log(`[stream] ✓ ytdl-core OK for ${cleanId} (${type})`);
    return { stream, mimeType: type === "audio" ? "audio/mpeg" : "video/mp4" };
  } catch (ytdlErr: any) {
    console.error(
      `[stream] ❌ ytdl-core FAILED for ${cleanId} (${type}):`,
      ytdlErr?.message ?? ytdlErr
    );
  }

  // ── 4. Piped direct URL (absolute last resort) ─────────────────────────────────
  console.warn(`[stream] All Node.js extractors failed for ${cleanId} — falling back to Piped URL`);
  try {
    const rawStreams = await getStreamData(cleanId);
    const normalized = normalizeStreams(rawStreams);
    const candidateUrl =
      type === "audio" ? normalized.audio[0]?.url : normalized.video[0]?.url;

    if (!candidateUrl) {
      throw new Error(`Piped returned no playable ${type} URL for ${cleanId}`);
    }

    console.log(`[stream] Piped URL fallback for ${cleanId}: ${candidateUrl.slice(0, 60)}...`);
    return { url: candidateUrl };
  } catch (pipedErr: any) {
    console.error(
      `[stream] ❌ Piped FAILED for ${cleanId}:`,
      pipedErr?.message ?? pipedErr
    );
  }

  throw new Error(
    `[stream] All extractors exhausted for ${cleanId} (${type}). ` +
    `Ensure YOUTUBE_COOKIE is set and valid in the server environment.`
  );
};

// ─── Video Info (for streams endpoint) ───────────────────────────────────────

export type VideoInfo = {
  title: string;
  description: string;
  thumbnail: string;
  uploader: string;
  uploaderAvatarUrl: string | null;
  likes: number | null;
  audioStreams: Array<{ url: string; mimeType: string; bitrate: number }>;
  videoStreams: Array<{ url: string; quality: string; mimeType: string }>;
  related: MediaItem[];
  hls: string | null;
  dash: string | null;
};

const MIN_RELATED_VIDEOS = 20;

const dedupeRelatedVideos = (items: MediaItem[], excludeId: string): MediaItem[] => {
  const seen = new Set<string>();
  const unique: MediaItem[] = [];
  for (const item of items) {
    if (!item.id) continue;
    if (item.id === excludeId) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
};

const fetchFallbackRelatedVideos = async (
  query: string,
  excludeId: string,
  existingIds: Set<string>,
  neededCount: number
): Promise<MediaItem[]> => {
  if (neededCount <= 0) return [];
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  try {
    const candidates = await innertubeSearch(trimmedQuery, Math.max(neededCount * 3, 36));
    const fallback: MediaItem[] = [];

    for (const item of candidates) {
      if (!item.id) continue;
      if (item.id === excludeId) continue;
      if (existingIds.has(item.id)) continue;
      existingIds.add(item.id);
      fallback.push({
        id: item.id,
        title: item.title,
        creator: item.creator,
        creatorAvatarUrl: item.creatorAvatarUrl ?? null,
        thumbnail: item.thumbnail,
        duration: item.duration,
        type: "video",
        youtubeUrl: `https://www.youtube.com/watch?v=${item.id}`,
      });
      if (fallback.length >= neededCount) break;
    }

    return fallback;
  } catch {
    return [];
  }
};

export const getVideoInfo = async (videoId: string): Promise<VideoInfo> => {
  const cleanId = videoId.startsWith("http")
    ? (new URL(videoId).searchParams.get("v") ?? videoId.split("/").pop() ?? videoId)
    : videoId;

  // ── 1. Innertube ────────────────────────────────────────────────────────
  try {
    const data = await innertubeGetStreams(cleanId);

    // Use the real related metadata parsed from watch_next_feed
    let related: MediaItem[] = (data.related ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      creator: r.creator,
      creatorAvatarUrl: r.creatorAvatarUrl ?? null,
      thumbnail: r.thumbnail,
      duration: r.duration,
      type: "video" as const,
      youtubeUrl: `https://www.youtube.com/watch?v=${r.id}`,
    }));
    related = dedupeRelatedVideos(related, cleanId);

    if (related.length < MIN_RELATED_VIDEOS) {
      const knownIds = new Set(related.map((item) => item.id));
      const fallbackRelated = await fetchFallbackRelatedVideos(
        `${data.title} ${data.uploader}`,
        cleanId,
        knownIds,
        MIN_RELATED_VIDEOS - related.length
      );
      related = dedupeRelatedVideos([...related, ...fallbackRelated], cleanId);
    }

    return {
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      uploader: data.uploader,
      uploaderAvatarUrl: data.uploaderAvatarUrl,
      likes: data.likes,
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
    const title = info.video_details.title ?? "Unknown Title";
    const uploader = info.video_details.channel?.name ?? "Unknown Creator";
    const related = await fetchFallbackRelatedVideos(
      `${title} ${uploader}`,
      cleanId,
      new Set<string>(),
      MIN_RELATED_VIDEOS
    );
    return {
      title,
      description: info.video_details.description ?? "",
      thumbnail:
        info.video_details.thumbnails?.[info.video_details.thumbnails.length - 1]?.url ??
        `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
      uploader,
      uploaderAvatarUrl: info.video_details.channel?.icons?.[0]?.url ?? null,
      likes: null,
      audioStreams: [],
      videoStreams: [],
      related,
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
    uploaderAvatarUrl: null,
    likes: null,
    audioStreams: [],
    videoStreams: [],
    related: [],
    hls: null,
    dash: null,
  };
};
