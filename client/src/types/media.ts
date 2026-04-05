export type MediaType = "music" | "video";

export type MediaItem = {
  id: string;
  title: string;
  creator: string;
  thumbnail: string;
  duration: number | null;
  type: MediaType;
  youtubeUrl?: string | null;
};

export type StreamResponse = {
  title: string;
  description: string;
  thumbnail: string;
  uploader: string;
  audio: Array<{ url: string; mimeType?: string; bitrate?: number }>;
  video: Array<{ url: string; quality: string; format: string }>;
  related: MediaItem[];
  hls: string | null;
  dash: string | null;
  unavailableReason?: string | null;
};

export type PlaylistItem = {
  mediaId: string;
  mediaType: MediaType;
  title: string;
  artwork?: string | null;
  creator?: string | null;
  duration?: number | null;
};
