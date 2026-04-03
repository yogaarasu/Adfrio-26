import { API_URL } from "@/lib/constants";

export const buildMediaProxyUrl = (mediaId: string, type: "audio" | "video", quality?: string): string => {
  const url = new URL(`${API_URL}/media/proxy/${encodeURIComponent(mediaId)}`);
  url.searchParams.set("type", type);

  if (type === "video" && quality) {
    url.searchParams.set("quality", quality);
  }

  return url.toString();
};
