import type { MediaItem } from "@/types/media";

const BLOCKED_SONG_KEYWORDS = [
  "podcast",
  "audiobook",
  "audio book",
  "motivation",
  "interview",
  "speech",
  "lecture",
  "sermon",
  "news",
  "dialogue",
  "bgm",
  "background score",
  "instrumental only",
  "full album",
  "album playlist",
  "dj mix",
  "mega mix",
  "trailer reaction",
  "live stream",
  "full live",
  "episode",
  "full movie",
  "movie scene",
  "shorts",
  "cartoon",
  "cartoons",
  "kids",
  "nursery",
  "rhymes",
  "chhota bheem",
  "doraemon",
  "shinchan",
  "animation"
];

const BLOCKED_VIDEO_PATTERNS: RegExp[] = [
  /\bsex\b/i,
  /sexy/i,
  /sexual/i,
  /\bxxx\b/i,
  /\bporn\b/i,
  /\bnude\b/i,
  /\bnsfw\b/i,
  /\badult\b/i,
  /\b18\+\b/i,
  /\b21\+\b/i,
  /\bbikini\b/i,
  /\bcleavage\b/i,
  /\bboob(s)?\b/i,
  /\bnipple(s)?\b/i,
  /\bbed\s+scene\b/i,
  /\bhot\s+(scene|video|clip|clips|actress|model)\b/i,
  /\bkiss\s+scene\b/i,
  /\bromance\s+scene\b/i,
];

export const dedupeMediaItems = (items: MediaItem[]): MediaItem[] => {
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  return items.filter((item) => {
    const creator = item.creator.toLowerCase().replace(/\s+/g, " ").trim();
    const title = item.title.toLowerCase().replace(/\s+/g, " ").trim();
    const fingerprint = `${item.type}|${title}|${creator}`;
    if (seenIds.has(item.id) || seenFingerprints.has(fingerprint)) return false;
    seenIds.add(item.id);
    seenFingerprints.add(fingerprint);
    return true;
  });
};

export const isLikelySong = (item: MediaItem): boolean => {
  if (item.type !== "music") return false;

  // Strict song-only bounds: 1 to 8 minutes.
  if (item.duration === null) return false;
  if (item.duration < 60) return false;
  if (item.duration > 8 * 60) return false;

  const text = `${item.title} ${item.creator}`.toLowerCase();
  if (text.includes("official trailer")) return false;
  return !BLOCKED_SONG_KEYWORDS.some((keyword) => text.includes(keyword));
};

export const filterStrictSongs = (items: MediaItem[]): MediaItem[] =>
  items.filter(isLikelySong);

export const isSafeVideo = (item: MediaItem): boolean => {
  if (item.type !== "video") return false;
  if (typeof item.duration === "number" && item.duration > 0 && item.duration < 45) return false;

  const text = `${item.title} ${item.creator}`.toLowerCase();
  if (text.includes("shorts")) return false;
  return !BLOCKED_VIDEO_PATTERNS.some((pattern) => pattern.test(text));
};

export const filterSafeVideos = (items: MediaItem[]): MediaItem[] =>
  items.filter(isSafeVideo);
