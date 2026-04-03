import type { StreamResponse } from "@/types/media";

type AudioCandidate = {
  url: string;
  mimeType?: string;
};

const normalizeMime = (mimeType?: string): string => (mimeType ?? "").split(";")[0].trim().toLowerCase();

const hasAudioCodecHint = (mimeType?: string): boolean => {
  if (!mimeType) return false;
  const lower = mimeType.toLowerCase();
  if (lower.includes("mp4a") || lower.includes("opus") || lower.includes("vorbis")) return true;
  return /codecs="[^"]+,[^"]+"/i.test(mimeType);
};

const parseQuality = (quality?: string): number => {
  if (!quality) return 0;
  const match = quality.match(/(\d{3,4})/);
  return match ? Number(match[1]) : 0;
};

const audioPreferenceScore = (mimeType?: string): number => {
  const normalized = normalizeMime(mimeType);
  if (normalized === "audio/mpeg") return 100;
  if (normalized === "audio/mp4") return 95;
  if (normalized === "audio/webm") return 90;
  if (normalized.startsWith("audio/")) return 85;
  if (normalized === "video/mp4") return 80;
  if (normalized === "video/webm") return 70;
  return 50;
};

const canPlayMime = (element: HTMLMediaElement, mimeType?: string): boolean => {
  if (!mimeType) return true;
  return element.canPlayType(mimeType) !== "";
};

const getAudioCandidates = (stream: StreamResponse): AudioCandidate[] => {
  const directAudio: AudioCandidate[] = stream.audio
    .filter((entry) => Boolean(entry.url))
    .map((entry) => ({ url: entry.url, mimeType: entry.mimeType }));

  const fallbackFromVideo: AudioCandidate[] = stream.video
    .filter((entry) => Boolean(entry.url))
    .map((entry) => ({ url: entry.url, mimeType: entry.format }));

  const deduped = new Map<string, AudioCandidate>();
  [...directAudio, ...fallbackFromVideo].forEach((entry) => {
    if (!deduped.has(entry.url)) {
      deduped.set(entry.url, entry);
    }
  });

  return [...deduped.values()].sort((a, b) => audioPreferenceScore(b.mimeType) - audioPreferenceScore(a.mimeType));
};

export const pickBestAudioSource = (stream: StreamResponse): AudioCandidate | null => {
  const candidates = getAudioCandidates(stream);
  if (candidates.length === 0) return null;

  if (typeof window === "undefined") return candidates[0];

  const probe = document.createElement("audio");
  const playable = candidates.find((entry) => canPlayMime(probe, entry.mimeType));
  return playable ?? candidates[0];
};

export const pickPlayableVideoSources = (
  sources: Array<{ url: string; quality: string; format: string }>
): Array<{ url: string; quality: string; format: string }> => {
  if (sources.length === 0) return [];

  const scored = [...sources].sort((a, b) => {
    const aScore = (hasAudioCodecHint(a.format) ? 1000 : 0) + parseQuality(a.quality) + (normalizeMime(a.format) === "video/mp4" ? 100 : 0);
    const bScore = (hasAudioCodecHint(b.format) ? 1000 : 0) + parseQuality(b.quality) + (normalizeMime(b.format) === "video/mp4" ? 100 : 0);
    return bScore - aScore;
  });

  if (typeof window === "undefined") return scored;

  const probe = document.createElement("video");
  const playable = scored.filter((entry) => canPlayMime(probe, entry.format));
  return playable.length > 0 ? playable : scored;
};
