/**
 * innertube.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper around youtubei.js (Innertube client) — the most resilient source
 * for YouTube metadata and stream extraction because it mimics the official
 * web client without depending on yt-dlp or fragile undocumented APIs.
 */

import { Innertube, UniversalCache } from "youtubei.js";

let _client: Innertube | null = null;
let _initPromise: Promise<Innertube> | null = null;

export const getInnertube = async (): Promise<Innertube> => {
  if (_client) return _client;
  if (_initPromise) return _initPromise;

  _initPromise = Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
  }).then((client) => {
    _client = client;
    console.log("[innertube] client ready");
    return client;
  });

  try {
    return await _initPromise;
  } catch (err) {
    _initPromise = null;
    throw err;
  }
};

// ─── Search ───────────────────────────────────────────────────────────────────

export type InnertubeSearchItem = {
  id: string;
  title: string;
  creator: string;
  thumbnail: string;
  duration: number | null;
};

export const innertubeSearch = async (
  query: string,
  limit = 20
): Promise<InnertubeSearchItem[]> => {
  const client = await getInnertube();

  // Use any-cast to avoid youtubei.js version-specific type differences
  const search: any = await client.search(query, { type: "video" } as any);

  const results: InnertubeSearchItem[] = [];

  for (const item of (search.results ?? []) as any[]) {
    if (results.length >= limit) break;

    const id: string = item?.id ?? item?.video_id ?? "";
    if (!id) continue;

    const titleObj: any = item?.title;
    const title: string =
      typeof titleObj === "string"
        ? titleObj
        : (titleObj?.text ?? titleObj?.runs?.[0]?.text ?? "Unknown Title");

    const authorObj: any = item?.short_byline_text ?? item?.author;
    const creator: string =
      typeof authorObj === "string"
        ? authorObj
        : (authorObj?.text ?? authorObj?.runs?.[0]?.text ?? authorObj?.name ?? "Unknown Creator");

    const thumbSources: Array<{ url: string }> =
      (item?.best_thumbnail?.sources ?? item?.thumbnails ?? []) as Array<{ url: string }>;
    const thumbnail =
      thumbSources[thumbSources.length - 1]?.url ??
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    const durationSec: number | null =
      typeof item?.duration?.seconds === "number"
        ? item.duration.seconds
        : (item?.duration_secs as number | null | undefined) ?? null;

    results.push({ id, title, creator, thumbnail, duration: durationSec });
  }

  return results;
};

// ─── Stream Extraction ────────────────────────────────────────────────────────

export type InnertubeStreamResult = {
  title: string;
  description: string;
  thumbnail: string;
  uploader: string;
  audioStreams: Array<{ url: string; mimeType: string; bitrate: number }>;
  videoStreams: Array<{ url: string; quality: string; mimeType: string }>;
  related: Array<{ id: string; title: string; creator: string; thumbnail: string; duration: number | null }>;
  relatedIds: string[];
  hls: string | null;
  dash: string | null;
};

export const innertubeGetStreams = async (
  videoId: string
): Promise<InnertubeStreamResult> => {
  const client = await getInnertube();

  // getBasicInfo is lighter; use getInfo for full format list
  const info: any = await client.getInfo(videoId);

  const details: any = info.basic_info ?? {};
  const title: string = details.title ?? "Unknown Title";
  const description: string = details.short_description ?? "";

  const thumbArr: Array<{ url: string }> = details.thumbnail ?? [];
  const thumbnail: string =
    thumbArr[thumbArr.length - 1]?.url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const uploader: string =
    details.channel?.name ??
    (typeof details.author === "string" ? details.author : details.author?.name) ??
    "Unknown Creator";

  const adaptiveFormats: any[] = info.streaming_data?.adaptive_formats ?? [];
  const streamingFormats: any[] = info.streaming_data?.formats ?? [];
  const allFormats: any[] = [...adaptiveFormats, ...streamingFormats];

  const audioStreams: Array<{ url: string; mimeType: string; bitrate: number }> = [];
  const videoStreams: Array<{ url: string; quality: string; mimeType: string }> = [];

  for (const fmt of allFormats) {
    let url: string | undefined;
    try {
      url = fmt.url;
      if (!url && typeof fmt.decipher === "function") {
        url = fmt.decipher(client.session?.player);
      }
    } catch {
      // youtubei.js throws getter errors if deciphering fails internally; skip this format
      continue;
    }
    
    if (!url) continue;

    const mimeType: string = fmt.mime_type ?? "application/octet-stream";
    const hasAudio: boolean =
      fmt.has_audio === true ||
      mimeType.startsWith("audio/") ||
      Number(fmt.audio_quality ?? 0) > 0;
    const hasVideo: boolean =
      fmt.has_video === true ||
      mimeType.startsWith("video/") ||
      typeof fmt.quality_label === "string";
    const bitrate: number = fmt.bitrate ?? fmt.average_bitrate ?? 0;
    const quality: string = fmt.quality_label ?? (fmt.height ? `${fmt.height}p` : "720p");

    if (hasAudio && !hasVideo) {
      audioStreams.push({ url, mimeType, bitrate });
    }
    if (hasVideo) {
      videoStreams.push({ url, quality, mimeType });
    }
    // Muxed (progressive) — add to both
    if (hasAudio && hasVideo) {
      audioStreams.push({ url, mimeType, bitrate });
    }
  }

  // Sort audio descending by bitrate; de-dup by URL
  audioStreams.sort((a, b) => b.bitrate - a.bitrate);
  const seenAudio = new Set<string>();
  const dedupedAudio = audioStreams.filter((s) => {
    if (seenAudio.has(s.url)) return false;
    seenAudio.add(s.url);
    return true;
  });

  // Sort video descending by resolution; de-dup by quality (prefer mp4)
  const qualityRank = (q: string) => {
    const m = q.match(/(\d{3,4})p/);
    return m ? Number(m[1]) : 0;
  };
  videoStreams.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

  const seenQuality = new Map<string, { url: string; quality: string; mimeType: string }>();
  for (const s of videoStreams) {
    const existing = seenQuality.get(s.quality);
    if (!existing) {
      seenQuality.set(s.quality, s);
    } else if (s.mimeType.includes("mp4") && !existing.mimeType.includes("mp4")) {
      seenQuality.set(s.quality, s);
    }
  }

  const hls: string | null = info.streaming_data?.hls_manifest_url ?? null;
  const dash: string | null = info.streaming_data?.dash_manifest_url ?? null;

  // Related videos from watch-next feed — parse real metadata
  const relatedFeed: any[] = info.watch_next_feed ?? [];

  type RelatedItem = {
    id: string;
    title: string;
    creator: string;
    thumbnail: string;
    duration: number | null;
  };

  const related: RelatedItem[] = [];

  for (const item of relatedFeed) {
    if (related.length >= 12) break;

    const id: string = item?.id ?? item?.video_id ?? "";
    if (!id) continue;

    const titleObj: any = item?.title;
    const title: string =
      typeof titleObj === "string"
        ? titleObj
        : (titleObj?.text ?? titleObj?.runs?.[0]?.text ?? "Related Video");

    const authorObj: any = item?.short_byline_text ?? item?.author ?? item?.channel;
    const creator: string =
      typeof authorObj === "string"
        ? authorObj
        : (authorObj?.text ?? authorObj?.runs?.[0]?.text ?? authorObj?.name ?? "YouTube");

    const thumbSources: Array<{ url: string }> =
      (item?.best_thumbnail?.sources ?? item?.thumbnails ?? []) as Array<{ url: string }>;
    const thumbnail: string =
      thumbSources[thumbSources.length - 1]?.url ??
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    const durationSec: number | null =
      typeof item?.duration?.seconds === "number"
        ? item.duration.seconds
        : (item?.duration_secs as number | null | undefined) ?? null;

    related.push({ id, title, creator, thumbnail, duration: durationSec });
  }

  // Keep old relatedIds for backward compat
  const relatedIds: string[] = related.map((r) => r.id);

  return {
    title,
    description,
    thumbnail,
    uploader,
    audioStreams: dedupedAudio,
    videoStreams: [...seenQuality.values()],
    relatedIds,
    related,
    hls,
    dash,
  };
};
