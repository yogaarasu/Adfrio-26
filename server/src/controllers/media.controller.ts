import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { sendError } from "../utils/http.js";
import { sendRealtimeEvent } from "../services/realtime.js";
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
  realtimeId: z.string().optional(),
});

const homeFeedSchema = z.object({
  mode: z.enum(["music", "video"]).default("music"),
  language: z.string().optional(),
  pageToken: z.string().optional(),
  sessionSeed: z.string().optional(),
  realtimeId: z.string().optional(),
  interestSeeds: z.string().optional(),
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

const HOME_MUSIC_TEMPLATES = [
  "top hit {language} songs {year}",
  "most viewed {language} songs {year}",
  "{language} chartbuster songs latest",
  "best of {language} songs this week",
  "{language} top playlist hits",
  "popular {language} songs official audio",
];

const HOME_VIDEO_TEMPLATES = [
  "top hit {language} videos {year}",
  "most watched {language} entertainment videos",
  "popular {language} videos this week",
  "{language} best videos now",
  "youtube most viewed {language} videos",
  "must watch {language} top videos",
];

const MAX_SEARCH_PAGES = 160;
const HOME_FALLBACK_MIN_ITEMS = 12;

const SEARCH_MUSIC_VARIANTS = [
  "{query}",
  "{query} official audio",
  "{query} lyrics",
  "{query} full song",
  "{query} live performance",
  "{query} remix",
  "{query} unplugged",
  "{query} playlist mix",
];

const SEARCH_VIDEO_VARIANTS = [
  "{query}",
  "{query} latest",
  "{query} highlights",
  "{query} full video",
  "{query} trending",
  "{query} explained",
  "{query} reaction",
  "{query} compilation",
];

const SEARCH_FIXUPS: Record<string, string> = {
  sond: "song",
  soong: "song",
  sonng: "song",
  musci: "music",
  musing: "music",
  vedio: "video",
  vedios: "videos",
  vidoe: "video",
  offical: "official",
  ofical: "official",
  lirics: "lyrics",
  lyriccs: "lyrics",
  relase: "release",
  trnding: "trending",
  yotube: "youtube",
  yuotube: "youtube",
};

const SEARCH_LEXICON = [
  "song",
  "songs",
  "music",
  "video",
  "videos",
  "youtube",
  "official",
  "lyrics",
  "lyric",
  "trending",
  "latest",
  "release",
  "playlist",
  "remix",
  "karaoke",
  "instrumental",
  "live",
  "full",
  "tutorial",
  "shorts",
  "highlights",
  "reaction",
  "compilation",
  "audio",
];

const levenshteinDistance = (source: string, target: string): number => {
  if (source === target) return 0;
  if (!source.length) return target.length;
  if (!target.length) return source.length;

  const matrix: number[][] = Array.from({ length: source.length + 1 }, () =>
    new Array(target.length + 1).fill(0)
  );

  for (let i = 0; i <= source.length; i += 1) matrix[i]![0] = i;
  for (let j = 0; j <= target.length; j += 1) matrix[0]![j] = j;

  for (let i = 1; i <= source.length; i += 1) {
    for (let j = 1; j <= target.length; j += 1) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      const deletion = matrix[i - 1]![j]! + 1;
      const insertion = matrix[i]![j - 1]! + 1;
      const substitution = matrix[i - 1]![j - 1]! + cost;
      matrix[i]![j] = Math.min(deletion, insertion, substitution);
    }
  }

  return matrix[source.length]![target.length]!;
};

const fuzzyCorrectToken = (token: string): string => {
  if (token.length < 3 || token.length > 16) return token;
  if (!/^[a-z]+$/i.test(token)) return token;

  const lower = token.toLowerCase();
  if (SEARCH_FIXUPS[lower]) return SEARCH_FIXUPS[lower]!;

  let bestTerm = lower;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of SEARCH_LEXICON) {
    if (candidate.charAt(0) !== lower.charAt(0)) continue;
    const distance = levenshteinDistance(lower, candidate);
    const score = distance / Math.max(lower.length, candidate.length);
    if (score < bestScore) {
      bestScore = score;
      bestTerm = candidate;
    }
  }

  return bestScore <= 0.34 ? bestTerm : token;
};

const parseIndexToken = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? "0", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

const normalizeLanguage = (value: string | undefined): string => {
  if (!value) return "global";
  const clean = value.trim().replace(/[^a-zA-Z ]+/g, "").replace(/\s+/g, " ");
  return clean.length > 0 ? clean : "global";
};

const parseInterestSeeds = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split("|")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2)
    .slice(0, 8);
};

const withInterest = (
  baseQuery: string,
  mode: "music" | "video",
  interest: string | undefined
): string => {
  if (!interest) return baseQuery;
  const modeHint = mode === "music" ? "songs" : "videos";
  return `${interest} ${modeHint} ${baseQuery}`.replace(/\s+/g, " ").trim();
};

const buildHomeQuery = (
  mode: "music" | "video",
  language: string,
  pageIndex: number,
  seed: number
): string => {
  const templates = mode === "music" ? HOME_MUSIC_TEMPLATES : HOME_VIDEO_TEMPLATES;
  const year = new Date().getUTCFullYear().toString();
  const offset = ((seed % templates.length) + templates.length) % templates.length;
  const template = templates[(offset + pageIndex) % templates.length] ?? templates[0]!;

  return template
    .replace(/\{language\}/g, language)
    .replace(/\{year\}/g, year)
    .replace(/\s+/g, " ")
    .trim();
};

const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
};

const sanitizeSearchQuery = (value: string): string =>
  value.trim().replace(/[^\p{L}\p{N}\s&'-]+/gu, " ").replace(/\s+/g, " ");

const collapseRepeatingChars = (token: string): string =>
  token.replace(/([A-Za-z])\1{2,}/g, "$1$1");

const autoCorrectSearchQuery = (query: string): string => {
  const cleaned = sanitizeSearchQuery(query);
  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((rawToken) => {
      const collapsed = collapseRepeatingChars(rawToken);
      return fuzzyCorrectToken(collapsed);
    })
    .join(" ");
};

const buildSearchVariantQuery = (
  mode: "music" | "video",
  query: string,
  pageIndex: number
): string => {
  const variants = mode === "music" ? SEARCH_MUSIC_VARIANTS : SEARCH_VIDEO_VARIANTS;
  const template = variants[pageIndex % variants.length] ?? variants[0] ?? "{query}";
  return template.replace(/\{query\}/g, query).replace(/\s+/g, " ").trim();
};

const buildSearchSuggestions = (
  mode: "music" | "video",
  rawQuery: string,
  correctedQuery: string
): string[] => {
  const sanitizedRaw = sanitizeSearchQuery(rawQuery);
  const base = correctedQuery || sanitizedRaw;
  if (!base) return [];

  const baseTokens = base
    .toLowerCase()
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  const tail = baseTokens[baseTokens.length - 1] ?? "";

  const suggestions = [
    correctedQuery && correctedQuery !== sanitizedRaw ? correctedQuery : "",
    buildSearchVariantQuery(mode, base, 1),
    buildSearchVariantQuery(mode, base, 2),
    buildSearchVariantQuery(mode, base, 3),
    mode === "music" ? `${base} karaoke` : `${base} shorts`,
    mode === "music" ? `${base} instrumental` : `${base} tutorial`,
    tail.length >= 3 ? `${base} ${fuzzyCorrectToken(tail)}` : "",
  ].filter((entry) => entry.length > 0);

  return [...new Set(suggestions)].slice(0, 5);
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const unavailablePayload = (reason: string) => ({
  title: "Unavailable",
  description: "",
  thumbnail: "",
  uploader: "",
  uploaderAvatarUrl: null,
  likes: null,
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

  const mode = parsed.data.type as "music" | "video";
  const pageIndex = parseIndexToken(parsed.data.pageToken);
  const realtimeId = parsed.data.realtimeId;
  const rawQuery = (parsed.data.q ?? "").trim();
  const correctedQuery = rawQuery ? autoCorrectSearchQuery(rawQuery) : "";
  const effectiveBaseQuery = correctedQuery || rawQuery;

  const publishProgress = (percent: number, message: string): void => {
    if (!realtimeId) return;
    sendRealtimeEvent(realtimeId, {
      type: "search:progress",
      mode,
      page: pageIndex,
      percent,
      message,
      query: rawQuery,
    });
  };

  if (pageIndex >= MAX_SEARCH_PAGES) {
    return res.json({
      items: [],
      nextPageToken: null,
      correctedQuery: correctedQuery !== rawQuery ? correctedQuery : null,
      suggestions: buildSearchSuggestions(mode, rawQuery, correctedQuery),
    });
  }

  try {
    const queryForPage = effectiveBaseQuery
      ? buildSearchVariantQuery(mode, effectiveBaseQuery, pageIndex)
      : undefined;

    publishProgress(4, "Search started");
    publishProgress(14, `Searching "${queryForPage ?? "trending"}"`);
    const primary = await searchYoutube(queryForPage, mode);
    publishProgress(56, `Collected ${primary.items.length} results`);

    let combined = [...primary.items];

    if (queryForPage && combined.length < 20) {
      const fallbackQuery = buildSearchVariantQuery(mode, effectiveBaseQuery, pageIndex + 5);
      publishProgress(72, `Expanding results with "${fallbackQuery}"`);
      const fallback = await searchYoutube(fallbackQuery, mode);
      combined = combined.concat(fallback.items);
    }

    const items = dedupeById(combined).slice(0, 24);
    const nextPageToken = effectiveBaseQuery
      ? pageIndex + 1 < MAX_SEARCH_PAGES
        ? String(pageIndex + 1)
        : null
      : primary.nextPageToken;

    publishProgress(88, `Finalizing ${items.length} results`);
    publishProgress(100, `Ready: ${items.length} results`);

    return res.json({
      items,
      nextPageToken,
      correctedQuery: correctedQuery !== rawQuery ? correctedQuery : null,
      suggestions: buildSearchSuggestions(mode, rawQuery, correctedQuery),
      appliedQuery: queryForPage ?? null,
    });
  } catch (error) {
    console.error("Search Error:", error);
    publishProgress(100, "Search failed");
    return sendError(res, 502, "Unable to fetch media from upstream sources right now");
  }
};

/** GET /api/media/home */
export const getHomeFeed = async (req: Request, res: Response): Promise<Response> => {
  const parsed = homeFeedSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, "Invalid home feed params");

  const mode = parsed.data.mode;
  const pageIndex = parseIndexToken(parsed.data.pageToken);
  const seed = parseIndexToken(parsed.data.sessionSeed);
  const language = normalizeLanguage(parsed.data.language);
  const interestSeeds = parseInterestSeeds(parsed.data.interestSeeds);
  const realtimeId = parsed.data.realtimeId;

  const publishProgress = (percent: number, message: string): void => {
    if (!realtimeId) return;
    sendRealtimeEvent(realtimeId, {
      type: "home-feed:progress",
      mode,
      page: pageIndex,
      percent,
      message,
    });
  };

  try {
    const selectedInterest = interestSeeds.length
      ? interestSeeds[(pageIndex + seed) % interestSeeds.length]
      : undefined;
    const primaryQuery = withInterest(
      buildHomeQuery(mode, language, pageIndex, seed),
      mode,
      selectedInterest
    );
    publishProgress(4, "Feed update started");
    publishProgress(16, `Finding ${mode === "music" ? "songs" : "videos"} for "${primaryQuery}"`);

    const primary = await searchYoutube(primaryQuery, mode);
    publishProgress(61, `Collected ${primary.items.length} candidates`);

    let combined = [...primary.items];

    if (combined.length < HOME_FALLBACK_MIN_ITEMS) {
      const fallbackInterest =
        interestSeeds.length > 1
          ? interestSeeds[(pageIndex + seed + 1) % interestSeeds.length]
          : selectedInterest;
      const fallbackQuery = withInterest(
        buildHomeQuery(mode, language, pageIndex + 3, seed + 5),
        mode,
        fallbackInterest
      );
      publishProgress(75, `Expanding feed with "${fallbackQuery}"`);
      const fallback = await searchYoutube(fallbackQuery, mode);
      combined = combined.concat(fallback.items);
    }

    const items = dedupeById(combined).slice(0, 20);
    const nextPageToken = String(pageIndex + 1);

    publishProgress(90, `Finalizing ${items.length} items`);
    publishProgress(100, `Ready: ${items.length} items`);
    return res.json({ items, nextPageToken });
  } catch (error) {
    console.error("Home Feed Error:", error);
    publishProgress(100, "Feed update failed");
    return sendError(res, 502, "Unable to load home feed right now");
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
      creatorAvatarUrl: r.creatorAvatarUrl ?? null,
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
      uploaderAvatarUrl: info.uploaderAvatarUrl,
      likes: info.likes,
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
