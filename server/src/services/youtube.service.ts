import play from "play-dl";
import ytdl from "@distube/ytdl-core";
import { getStreamData, normalizeStreams, searchPiped } from "./piped.js";
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
  "Future bass", "Trap beats", "Soulful R&B", "Metal workout", "Country road songs"
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

  try {
    // play-dl search — reliable and fast
    const searchResults = await play.search(actualQuery, {
      limit: 20,
      source: { youtube: "video" }
    });

    results = searchResults
      .map((v) => ({
        id: v.id || "",
        title: v.title || "Unknown Title",
        creator: v.channel?.name || "Unknown Creator",
        thumbnail: v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        duration: v.durationInSec || null,
        type: type as "music" | "video",
        youtubeUrl: v.url
      }))
      .filter((item) => Boolean(item.id));
  } catch (err: any) {
    console.warn("[search] play-dl failed, falling back to Piped:", err?.message);

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
            youtubeUrl: `https://www.youtube.com/watch?v=${id}`
          };
        })
        .filter((item) => Boolean(item.id));

      // Piped has real pagination — override nextPageToken for non-discovery searches
      if (!isDiscovery) {
        nextPageToken = pipedResults.nextPageToken;
      }
    } catch (pipedErr: any) {
      console.error("[search] All search sources failed:", pipedErr?.message);
    }
  }

  // Deduplicate then shuffle for discovery variety
  const unique = Array.from(new Map(results.map((item) => [item.id, item])).values());
  const shuffled = unique.sort(() => Math.random() - 0.5);

  return { items: shuffled, nextPageToken };
};

export const getStreamSource = async (
  videoId: string,
  type: "audio" | "video"
): Promise<{ stream: any } | { url: string }> => {
  await initPlayDl();

  const videoUrl = videoId.startsWith("http")
    ? videoId
    : `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // play-dl: quality 3 = highest, 0 = lowest
    const stream = await play.stream(videoUrl, {
      quality: type === "audio" ? 3 : 2,
      seek: 0,
      ...(type === "audio" ? { discordPlayerCompatibility: false } : {})
    } as Parameters<typeof play.stream>[1]);

    console.log(`[stream] play-dl OK for ${videoId} (${type})`);
    return stream;
  } catch (playDlErr: any) {
    console.warn(`[stream] play-dl failed for ${videoId}:`, playDlErr?.message);

    try {
      const ytdlInfo = await ytdl.getInfo(videoUrl);
      const stream = ytdl.downloadFromInfo(ytdlInfo, {
        filter: type === "audio" ? "audioonly" : "videoandaudio",
        quality: type === "audio" ? "highestaudio" : "highestvideo",
        highWaterMark: 1 << 25 // 32 MB buffer for fast initial buffering
      });
      console.log(`[stream] ytdl OK for ${videoId} (${type})`);
      return { stream };
    } catch (ytdlErr: any) {
      console.warn(`[stream] ytdl failed for ${videoId}:`, ytdlErr?.message);

      // Last resort: Piped direct URL (302 redirect so browser fetches it)
      const rawStreams = await getStreamData(videoId);
      const normalized = normalizeStreams(rawStreams);

      const candidateUrl =
        type === "audio"
          ? normalized.audio[0]?.url
          : normalized.video[0]?.url;

      if (!candidateUrl) {
        throw new Error(`No playable stream found for ${videoId} on any source`);
      }

      console.log(`[stream] Piped redirect for ${videoId}`);
      return { url: candidateUrl };
    }
  }
};
