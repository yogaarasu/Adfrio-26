import { API_URL } from "@/lib/constants";

const isGoogleVideoHost = (hostname: string): boolean => hostname.endsWith(".googlevideo.com");

const unique = (values: string[]): string[] => [...new Set(values)];

const parseHost = (hostname: string) => {
  const rrMatch = hostname.match(/^(rr\d+)---(sn-[^.]+)\.googlevideo\.com$/i);
  const snMatch = hostname.match(/^(sn-[^.]+)\.googlevideo\.com$/i);

  return {
    currentNode: (rrMatch?.[2] ?? snMatch?.[1] ?? "").toLowerCase(),
    rrPrefix: (rrMatch?.[1] ?? "rr1").toLowerCase()
  };
};

const extractNodes = (parsed: URL): string[] => {
  const mn = parsed.searchParams.get("mn");
  if (!mn) return [];

  return unique(
    mn
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.startsWith("sn-"))
  );
};

const toUrl = (base: URL, host: string): string => {
  const candidate = new URL(base.toString());
  candidate.hostname = host;
  return candidate.toString();
};

const isProxiedUrl = (rawUrl: string): boolean => rawUrl.startsWith(`${API_URL}/media/proxy?url=`);

const extractRawFromProxy = (rawUrl: string): string => {
  if (!isProxiedUrl(rawUrl)) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    const target = parsed.searchParams.get("url");
    return target ? decodeURIComponent(target) : rawUrl;
  } catch {
    return rawUrl;
  }
};

export const toProxiedGooglevideoUrl = (rawUrl: string): string => {
  if (isProxiedUrl(rawUrl)) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    if (!isGoogleVideoHost(parsed.hostname)) return rawUrl;
    return `${API_URL}/media/proxy?url=${encodeURIComponent(rawUrl)}`;
  } catch {
    return rawUrl;
  }
};

// Keep original URL signature intact; host failover is handled by backend proxy.
export const normalizeGooglevideoPrimaryUrl = (rawUrl: string): string => rawUrl;

export const getGooglevideoFallbackUrls = (rawUrl: string, max = 6): string[] => {
  const targetUrl = extractRawFromProxy(rawUrl);

  try {
    const parsed = new URL(targetUrl);
    if (!isGoogleVideoHost(parsed.hostname)) return [];

    const nodes = extractNodes(parsed);
    if (nodes.length === 0) return [];

    const { currentNode, rrPrefix } = parseHost(parsed.hostname);
    const hostVariants: string[] = [];

    for (const node of nodes) {
      if (node === currentNode) continue;
      hostVariants.push(`rr1---${node}.googlevideo.com`);
      hostVariants.push(`${rrPrefix}---${node}.googlevideo.com`);
      hostVariants.push(`${node}.googlevideo.com`);
    }

    if (currentNode) {
      hostVariants.push(`rr1---${currentNode}.googlevideo.com`);
      hostVariants.push(`${rrPrefix}---${currentNode}.googlevideo.com`);
      hostVariants.push(`${currentNode}.googlevideo.com`);
    }

    const normalizedPrimary = normalizeGooglevideoPrimaryUrl(rawUrl);

    const urls = unique(hostVariants)
      .map((host) => toProxiedGooglevideoUrl(toUrl(parsed, host)))
      .filter((candidate) => candidate !== rawUrl && candidate !== normalizedPrimary)
      .slice(0, max);

    return urls;
  } catch {
    return [];
  }
};
