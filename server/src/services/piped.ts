import axios from "axios";
import ytdl from "@distube/ytdl-core";
import play from "play-dl";
import { env, pipedInstances } from "../config/env.js";

type PipedSearchItem = {
  type?: string;
  url?: string;
  title?: string;
  thumbnail?: string;
  uploaderName?: string;
  duration?: number;
};

type StreamInfo = {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  uploader?: string;
  audioStreams?: Array<{ url: string; mimeType?: string; bitrate?: number }>;
  videoStreams?: Array<{ url: string; quality?: string; mimeType?: string; codec?: string }>;
  relatedStreams?: Array<{ url?: string; title?: string; thumbnail?: string; uploaderName?: string; duration?: number }>;
  hls?: string | null;
  dash?: string | null;
};

type DiscoveryInstance = {
  api_url?: string;
};

const STATIC_FALLBACKS = ["https://api.piped.private.coffee", "https://pipedapi.kavin.rocks"];
const DISCOVERY_URL = "https://piped-instances.kavin.rocks";
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const STREAM_CACHE_TTL_MS = 5 * 60 * 1000;

let discoveredInstances: string[] = [];
let discoveredAt = 0;
let playDlInitialized = false;
const searchCache = new Map<string, { expiresAt: number; data: { items: PipedSearchItem[]; nextPageToken: string | null } }>();
const streamCache = new Map<string, { expiresAt: number; data: StreamInfo }>();
const streamInFlight = new Map<string, Promise<StreamInfo>>();
const FALLBACK_EXTRACT_TIMEOUT_MS = 10000;

const createClient = (baseURL: string) =>
  axios.create({
    baseURL,
    timeout: 8000,
    headers: {
      "user-agent": "AdfrioMedia/1.0",
      accept: "application/json"
    }
  });

const isLikelyApiUrl = (value: string): boolean => value.startsWith("https://") || value.startsWith("http://");
const dedupe = (values: string[]): string[] => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const shuffled = (values: string[]): string[] => {
  const list = [...values];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const qualityRank = (quality?: string): number => {
  if (!quality) return 0;
  const match = quality.match(/(\d{3,4})p/);
  return match ? Number(match[1]) : 0;
};

const isMuxedMimeType = (mimeType?: string): boolean => {
  if (!mimeType) return false;
  const lower = mimeType.toLowerCase();
  if (!lower.includes("video/")) return false;
  if (lower.includes("mp4a") || lower.includes("opus") || lower.includes("vorbis")) return true;
  return /codecs="[^"]+,[^"]+"/i.test(mimeType);
};

const durationTextToSeconds = (raw?: string): number | null => {
  if (!raw) return null;
  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;

  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
};

const extractMediaId = (url: string): string => {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://www.youtube.com${url.startsWith("/") ? "" : "/"}${url}`);
    const fromQuery = parsed.searchParams.get("v");
    if (fromQuery) return fromQuery;
    const path = parsed.pathname.split("/").filter(Boolean);
    return path[path.length - 1] ?? "";
  } catch {
    const fromQuery = url.match(/[?&]v=([a-zA-Z0-9_-]+)/)?.[1];
    if (fromQuery) return fromQuery;
    return url.match(/([a-zA-Z0-9_-]{8,})$/)?.[1] ?? "";
  }
};

const ensureJsonPayload = (data: unknown): void => {
  if (typeof data === "string") {
    throw new Error("Piped instance returned non-JSON response");
  }
};

const hasPlayableStreams = (raw: StreamInfo): boolean => {
  const hasAudio = (raw.audioStreams ?? []).some((entry) => Boolean(entry.url));
  const hasVideo = (raw.videoStreams ?? []).some((entry) => Boolean(entry.url));
  return hasAudio || hasVideo || Boolean(raw.hls) || Boolean(raw.dash);
};

const hasMuxedVideoStreams = (raw: StreamInfo): boolean =>
  (raw.videoStreams ?? []).some((entry) => Boolean(entry.url) && isMuxedMimeType(entry.mimeType));

const getCached = <T>(cache: Map<string, { expiresAt: number; data: T }>, key: string): T | null => {
  const now = Date.now();
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < now) {
    cache.delete(key);
    return null;
  }
  return hit.data;
};

const setCached = <T>(cache: Map<string, { expiresAt: number; data: T }>, key: string, data: T, ttlMs: number): void => {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Extractor timeout")), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });

const discoverInstances = async (): Promise<string[]> => {
  const now = Date.now();
  if (discoveredInstances.length > 0 && now - discoveredAt < DISCOVERY_TTL_MS) {
    return discoveredInstances;
  }

  try {
    const { data } = await axios.get(DISCOVERY_URL, {
      timeout: 6000,
      headers: { accept: "application/json" }
    });

    const fromDirectory = Array.isArray(data)
      ? (data as DiscoveryInstance[])
          .map((entry) => entry.api_url?.trim() ?? "")
          .filter((entry) => Boolean(entry) && isLikelyApiUrl(entry))
      : [];

    discoveredInstances = dedupe(fromDirectory);
    discoveredAt = now;
  } catch {
    // Continue using env and static fallbacks.
  }

  return discoveredInstances;
};

const getRuntimeInstances = async (): Promise<string[]> => {
  const dynamic = await discoverInstances();
  return dedupe([...pipedInstances, ...dynamic, ...STATIC_FALLBACKS]);
};

const withFailover = async <T>(operation: (baseURL: string) => Promise<T>): Promise<T> => {
  const instances = shuffled(await getRuntimeInstances());
  let lastError: unknown;

  for (const baseURL of instances) {
    try {
      return await operation(baseURL);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("No Piped instance available");
};

const initPlayDl = async (): Promise<void> => {
  if (playDlInitialized) return;

  if (env.YOUTUBE_COOKIE?.trim()) {
    const playWithToken = play as unknown as {
      setToken?: (token: { youtube?: { cookie?: string } }) => unknown;
    };

    if (playWithToken.setToken) {
      await Promise.resolve(playWithToken.setToken({ youtube: { cookie: env.YOUTUBE_COOKIE } }));
    }
  }

  playDlInitialized = true;
};

const getPlayDlStreams = async (videoId: string): Promise<StreamInfo> => {
  await initPlayDl();
  const info = await play.video_info(`https://www.youtube.com/watch?v=${videoId}`);
  const anyInfo = info as unknown as {
    format?: Array<Record<string, unknown>>;
    video_details?: Record<string, unknown>;
  };

  const details = anyInfo.video_details ?? {};
  const formats = Array.isArray(anyInfo.format) ? anyInfo.format : [];

  const explicitAudioStreams = formats
    .filter((entry) => typeof entry.url === "string")
    .filter((entry) => {
      const mime = String(entry.mimeType ?? "");
      const hasAudio = entry.hasAudio === true || mime.startsWith("audio/") || Number(entry.audioBitrate ?? 0) > 0;
      const hasVideo = entry.hasVideo === true || mime.includes("video");
      return hasAudio && !hasVideo;
    })
    .map((entry) => ({
      url: String(entry.url),
      mimeType: String(entry.mimeType ?? "audio/mp4"),
      bitrate: Number(entry.bitrate ?? entry.audioBitrate ?? 0)
    }))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const progressiveAudioFallback = formats
    .filter((entry) => typeof entry.url === "string")
    .filter((entry) => {
      const mime = String(entry.mimeType ?? "");
      const hasAudio = entry.hasAudio === true || Number(entry.audioBitrate ?? 0) > 0 || mime.includes("mp4a");
      const isVideo = entry.hasVideo === true || mime.includes("video/");
      return hasAudio && isVideo;
    })
    .map((entry) => ({
      url: String(entry.url),
      mimeType: String(entry.mimeType ?? "audio/mp4"),
      bitrate: Number(entry.audioBitrate ?? entry.bitrate ?? 0)
    }))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const dedupedAudio = new Map<string, { url: string; mimeType?: string; bitrate?: number }>();
  for (const entry of [...explicitAudioStreams, ...progressiveAudioFallback]) {
    if (!dedupedAudio.has(entry.url)) {
      dedupedAudio.set(entry.url, entry);
    }
  }
  const audioStreams = [...dedupedAudio.values()];

  const allVideoCandidates = formats
    .filter((entry) => typeof entry.url === "string")
    .filter((entry) => {
      const mime = String(entry.mimeType ?? "");
      return entry.hasVideo === true || mime.includes("video/") || typeof entry.qualityLabel === "string";
    });

  const progressiveVideo = allVideoCandidates.filter((entry) => {
    const mime = String(entry.mimeType ?? "").toLowerCase();
    return entry.hasAudio === true || Number(entry.audioBitrate ?? 0) > 0 || mime.includes("mp4a");
  });
  const pickedVideoCandidates = progressiveVideo.length > 0 ? progressiveVideo : allVideoCandidates;

  const dedupedVideo = new Map<string, { url: string; quality: string; mimeType: string; codec?: string }>();

  for (const entry of pickedVideoCandidates) {
    const quality = String(entry.qualityLabel ?? (entry.height ? `${entry.height}p` : "720p"));
    const mimeType = String(entry.mimeType ?? "video/mp4");
    const codec = mimeType.match(/codecs="([^"]+)"/)?.[1];
    const url = String(entry.url);

    const existing = dedupedVideo.get(quality);
    if (!existing) {
      dedupedVideo.set(quality, { url, quality, mimeType, codec });
      continue;
    }

    if (mimeType.includes("mp4") && !existing.mimeType.includes("mp4")) {
      dedupedVideo.set(quality, { url, quality, mimeType, codec });
    }
  }

  const videoStreams = [...dedupedVideo.values()]
    .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality))
    .map((entry) => ({
      url: entry.url,
      quality: entry.quality,
      mimeType: entry.mimeType,
      codec: entry.codec
    }));

  const relatedSource = Array.isArray((details as { related_videos?: unknown[] }).related_videos)
    ? ((details as { related_videos?: unknown[] }).related_videos as Array<Record<string, unknown>>)
    : [];

  const relatedStreams = relatedSource
    .map((entry) => {
      const id = String(entry.id ?? "");
      if (!id) return null;

      const thumbnails = Array.isArray(entry.thumbnails) ? (entry.thumbnails as Array<Record<string, unknown>>) : [];
      const thumbnail = String(
        (thumbnails[thumbnails.length - 1]?.url as string | undefined) ??
          (entry.thumbnail as string | undefined) ??
          ""
      );

      const uploaderName = String(
        (entry.channel_name as string | undefined) ??
          ((entry.channel as { name?: string } | undefined)?.name ?? "Unknown creator")
      );

      const parsedDuration =
        typeof entry.durationInSec === "number"
          ? entry.durationInSec
          : durationTextToSeconds(String(entry.duration_raw ?? ""));

      return {
        url: `https://www.youtube.com/watch?v=${id}`,
        title: String(entry.title ?? "Untitled"),
        thumbnail,
        uploaderName,
        duration: parsedDuration ?? undefined
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const detailThumbs = Array.isArray((details as { thumbnails?: unknown[] }).thumbnails)
    ? ((details as { thumbnails?: unknown[] }).thumbnails as Array<Record<string, unknown>>)
    : [];

  return {
    title: String(details.title ?? "Unknown title"),
    description: String(details.description ?? ""),
    thumbnailUrl: String((detailThumbs[detailThumbs.length - 1]?.url as string | undefined) ?? ""),
    uploader: String(
      ((details.channel as { name?: string; title?: string } | undefined)?.name ??
        (details.channel as { name?: string; title?: string } | undefined)?.title ??
        "Unknown creator")
    ),
    audioStreams,
    videoStreams,
    relatedStreams,
    hls: null,
    dash: null
  };
};

const getYtdlStreams = async (videoId: string): Promise<StreamInfo> => {
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);

  const details = info.videoDetails as unknown as {
    title?: string;
    description?: string;
    author?: { name?: string };
    thumbnails?: Array<{ url?: string }>;
    related_videos?: Array<{ id?: string; title?: string; author?: string; length_seconds?: string }>;
  };

  const formats = (info.formats ?? [])
    .filter((entry) => Boolean(entry.url))
    .map((entry) => ({
      url: entry.url,
      mimeType: entry.mimeType ?? undefined,
      qualityLabel: entry.qualityLabel ?? undefined,
      hasAudio: entry.hasAudio,
      hasVideo: entry.hasVideo,
      audioBitrate: entry.audioBitrate,
      bitrate: entry.bitrate,
      height: entry.height
    }));

  const audioStreams = formats
    .filter((entry) => entry.hasAudio && !entry.hasVideo)
    .map((entry) => ({
      url: entry.url,
      mimeType: entry.mimeType,
      bitrate: entry.audioBitrate ?? entry.bitrate ?? undefined
    }))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const progressiveVideo = formats.filter((entry) => entry.hasVideo && entry.hasAudio);
  const videoCandidates = progressiveVideo.length > 0 ? progressiveVideo : formats.filter((entry) => entry.hasVideo);

  const dedupedVideo = new Map<string, { url: string; quality: string; mimeType: string; codec?: string }>();

  for (const entry of videoCandidates) {
    const quality = entry.qualityLabel ?? (entry.height ? `${entry.height}p` : "720p");
    const mimeType = entry.mimeType ?? "video/mp4";
    const codec = mimeType.match(/codecs="([^"]+)"/)?.[1];

    if (!dedupedVideo.has(quality)) {
      dedupedVideo.set(quality, { url: entry.url, quality, mimeType, codec });
      continue;
    }

    const existing = dedupedVideo.get(quality);
    if (existing && mimeType.includes("mp4") && !existing.mimeType.includes("mp4")) {
      dedupedVideo.set(quality, { url: entry.url, quality, mimeType, codec });
    }
  }

  const videoStreams = [...dedupedVideo.values()]
    .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality))
    .map((entry) => ({
      url: entry.url,
      quality: entry.quality,
      mimeType: entry.mimeType,
      codec: entry.codec
    }));

  const relatedStreams = (details.related_videos ?? [])
    .map((entry) => {
      const id = entry.id ?? "";
      if (!id) return null;

      return {
        url: `https://www.youtube.com/watch?v=${id}`,
        title: entry.title ?? "Untitled",
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        uploaderName: entry.author ?? "Unknown creator",
        duration: entry.length_seconds ? Number(entry.length_seconds) : undefined
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const thumbnails = details.thumbnails ?? [];

  return {
    title: details.title ?? "Unknown title",
    description: details.description ?? "",
    thumbnailUrl: thumbnails[thumbnails.length - 1]?.url ?? "",
    uploader: details.author?.name ?? "Unknown creator",
    audioStreams,
    videoStreams,
    relatedStreams,
    hls: null,
    dash: null
  };
};

export const searchPiped = async (
  query: string,
  mediaType: "music" | "video",
  pageToken?: string
): Promise<{ items: PipedSearchItem[]; nextPageToken: string | null }> => {
  const cacheKey = `${mediaType}:${query.trim().toLowerCase()}:${pageToken ?? ""}`;
  const cached = getCached(searchCache, cacheKey);
  if (cached) return cached;

  const response = await withFailover(async (baseURL) => {
    const client = createClient(baseURL);
    const filter = mediaType === "music" ? "music_songs" : "videos";

    const { data } = await client.get("/search", {
      params: {
        q: query,
        filter,
        nextpage: pageToken || undefined
      }
    });

    ensureJsonPayload(data);

    if (Array.isArray(data)) {
      return { items: data as PipedSearchItem[], nextPageToken: null };
    }

    const rawItems = Array.isArray((data as { items?: unknown[] }).items)
      ? ((data as { items?: unknown[] }).items as PipedSearchItem[])
      : [];

    return {
      items: rawItems,
      nextPageToken:
        typeof (data as { nextpage?: unknown }).nextpage === "string"
          ? ((data as { nextpage?: string }).nextpage ?? null)
          : null
    };
  });

  setCached(searchCache, cacheKey, response, SEARCH_CACHE_TTL_MS);
  return response;
};

export const getStreamData = async (videoId: string): Promise<StreamInfo> => {
  const cached = getCached(streamCache, videoId);
  if (cached) return cached;

  const pending = streamInFlight.get(videoId);
  if (pending) return pending;

  const request = (async () => {
    let pipedCandidate: StreamInfo | null = null;
    let pipedError: unknown;

    try {
      const pipedData = await withFailover(async (baseURL) => {
        const client = createClient(baseURL);
        const { data } = await client.get(`/streams/${videoId}`);
        ensureJsonPayload(data);
        return data as StreamInfo;
      });

      if (hasPlayableStreams(pipedData)) {
        if (hasMuxedVideoStreams(pipedData)) {
          setCached(streamCache, videoId, pipedData, STREAM_CACHE_TTL_MS);
          return pipedData;
        }
        pipedCandidate = pipedData;
      }
    } catch (error) {
      pipedError = error;
    }

    const extractorTasks = [
      withTimeout(getPlayDlStreams(videoId), FALLBACK_EXTRACT_TIMEOUT_MS),
      withTimeout(getYtdlStreams(videoId), FALLBACK_EXTRACT_TIMEOUT_MS)
    ];

    try {
      const extracted = await Promise.any(extractorTasks);
      if (hasPlayableStreams(extracted)) {
        setCached(streamCache, videoId, extracted, STREAM_CACHE_TTL_MS);
        return extracted;
      }
    } catch {
      // Continue to piped candidate/error fallback.
    }

    if (pipedCandidate) {
      setCached(streamCache, videoId, pipedCandidate, STREAM_CACHE_TTL_MS);
      return pipedCandidate;
    }

    throw pipedError ?? new Error("Unable to extract streams");
  })();

  streamInFlight.set(videoId, request);

  try {
    return await request;
  } finally {
    streamInFlight.delete(videoId);
  }
};

export const normalizeStreams = (raw: StreamInfo) => {
  const audio = (raw.audioStreams ?? [])
    .filter((entry) => Boolean(entry.url))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const dedupedVideo = new Map<string, { url: string; quality: string; format: string; codec: string | null }>();

  for (const video of raw.videoStreams ?? []) {
    if (!video.url || !video.quality || !isMuxedMimeType(video.mimeType)) continue;
    const existing = dedupedVideo.get(video.quality);
    if (!existing) {
      dedupedVideo.set(video.quality, {
        url: video.url,
        quality: video.quality,
        format: video.mimeType ?? "video/mp4",
        codec: video.codec ?? null
      });
      continue;
    }

    if ((video.mimeType ?? "").includes("mp4") && !(existing.format ?? "").includes("mp4")) {
      dedupedVideo.set(video.quality, {
        url: video.url,
        quality: video.quality,
        format: video.mimeType ?? "video/mp4",
        codec: video.codec ?? null
      });
    }
  }

  const related = (raw.relatedStreams ?? [])
    .map((entry) => {
      const id = entry.url ? extractMediaId(entry.url) : "";
      if (!id) return null;

      return {
        id,
        title: entry.title ?? "Untitled",
        creator: entry.uploaderName ?? "Unknown creator",
        thumbnail: entry.thumbnail ?? "",
        duration: entry.duration ?? null,
        type: "video" as const,
        youtubeUrl: `https://www.youtube.com/watch?v=${id}`
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const video = [...dedupedVideo.values()].sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
  const audioFallbackFromMuxedVideo = video.map((entry) => ({
    url: entry.url,
    mimeType: entry.format,
    bitrate: undefined
  }));
  const normalizedAudio = audio.length > 0 ? audio : audioFallbackFromMuxedVideo;

  return {
    title: raw.title ?? "Unknown title",
    description: raw.description ?? "",
    thumbnail: raw.thumbnailUrl ?? "",
    uploader: raw.uploader ?? "",
    audio: normalizedAudio,
    video,
    related,
    hls: raw.hls ?? null,
    dash: raw.dash ?? null
  };
};
