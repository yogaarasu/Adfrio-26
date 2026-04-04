import { Readable } from "node:stream";
import { searchMusics } from "node-youtube-music";
import play from "play-dl";
import ytdl from "@distube/ytdl-core";
import axios from "axios";
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

export const initPlayDl = async () => {
  if (playDlInitialized) return;
  if (env.YOUTUBE_COOKIE) {
    await play.setToken({
      youtube: {
        cookie: env.YOUTUBE_COOKIE
      }
    });
  }
  playDlInitialized = true;
};

export const searchYoutube = async (
  query: string | undefined,
  type: "music" | "video" = "music",
  pageToken?: string
): Promise<{ items: MediaItem[], nextPageToken: string | null }> => {
  await initPlayDl();
  
  const isDiscovery = !query || query.trim().length === 0;
  const keywordIndex = isDiscovery ? parseInt(pageToken || "0", 10) : 0;
  
  const actualQuery = isDiscovery
    ? DISCOVERY_KEYWORDS[keywordIndex % DISCOVERY_KEYWORDS.length]
    : query!;

  let results: MediaItem[] = [];
  let nextPageToken: string | null = isDiscovery ? (keywordIndex + 1).toString() : null;

  try {
    // USE play-dl for both music and video search for maximum reliability
    const searchResults = await play.search(actualQuery, {
      limit: 20,
      source: { youtube: "video" }
    });

    results = searchResults.map(v => ({
      id: v.id || "",
      title: v.title || "Unknown Title",
      creator: v.channel?.name || "Unknown Creator",
      thumbnail: v.thumbnails?.[0]?.url || "",
      duration: v.durationInSec || null,
      type: (type === "music" ? "music" : "video") as "music" | "video",
      youtubeUrl: v.url
    })).filter(item => item.id);
  } catch (err: any) {
    console.error("Play-dl search failed:", err.message);
    console.warn("Using Piped fallback...");
    const pipedResults = await searchPiped(actualQuery, type, pageToken || undefined);
    
    results = pipedResults.items.map(m => {
        const id = m.url ? (m.url.split('v=')[1] || m.url.split('/').pop() || "") : "";
        return {
          id,
          title: m.title || "Unknown Title",
          creator: m.uploaderName || "Unknown Artist",
          thumbnail: m.thumbnail || "",
          duration: m.duration || null,
          type: (type === "music" ? "music" : "video") as "music" | "video",
          youtubeUrl: `https://www.youtube.com/watch?v=${id}`
        };
    }).filter(item => item.id);
    
    nextPageToken = isDiscovery ? nextPageToken : pipedResults.nextPageToken;
  }

  // Duplicate filtering and Shuffling
  const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());
  const shuffled = uniqueResults.sort(() => Math.random() - 0.5);

  return {
    items: shuffled,
    nextPageToken
  };
};

export const getStreamSource = async (videoId: string, type: "audio" | "video"): Promise<{ stream: any } | { url: string }> => {
  await initPlayDl();
  
  const videoUrl = videoId.startsWith("http") 
    ? videoId 
    : `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Try play-dl first
    const info = await play.video_info(videoUrl);
    const stream = await play.stream(videoUrl, {
      quality: type === "audio" ? 0 : 2, 
      seek: 0
    });
    return stream;
  } catch (err) {
    console.warn("Play-dl blocked, trying ytdl fallback...");
    
    try {
      // Fallback to @distube/ytdl-core - fetch info first to catch blocks
      const ytdlInfo = await ytdl.getInfo(videoUrl);
      const stream = ytdl.downloadFromInfo(ytdlInfo, { 
        filter: type === "audio" ? "audioonly" : "videoandaudio",
        quality: type === "audio" ? "highestaudio" : "highestvideo",
      });
      return { stream }; 
    } catch (ytdlErr) {
      console.warn("Ytdl blocked, using Piped redirect fallback...");
      
      const rawStreams = await getStreamData(videoId);
      const normalized = normalizeStreams(rawStreams);
      
      const candidateUrl = type === "audio" 
        ? normalized.audio[0]?.url 
        : normalized.video[0]?.url;
        
      if (!candidateUrl) throw new Error("No playable streams found on any source.");

      // Instead of proxying a blocked stream from the server, 
      // we return a URL that the controller can use to issue a 302 redirect.
      // This allows the browser to fetch it directly, which often bypasses server-level IP blocks.
      return { url: candidateUrl };
    }
  }
};
