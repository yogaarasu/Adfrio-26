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
  "shorts"
];

export const dedupeMediaItems = (items: MediaItem[]): MediaItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
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
