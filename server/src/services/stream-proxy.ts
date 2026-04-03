import axios from "axios";
import type { Request, Response } from "express";

type ProxyAttempt = {
  url: string;
  error?: string;
};

const STREAM_TIMEOUT_MS = 15000;
const isGooglevideoHost = (hostname: string): boolean => hostname.endsWith(".googlevideo.com");

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

const getHostVariants = (rawUrl: string): string[] => {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return [];
  }

  if (parsed.protocol !== "https:" || !isGooglevideoHost(parsed.hostname)) {
    return [rawUrl];
  }

  const nodes = extractNodes(parsed);
  const { currentNode, rrPrefix } = parseHost(parsed.hostname);

  const hostCandidates: string[] = [parsed.hostname];

  if (currentNode) {
    hostCandidates.push(`rr1---${currentNode}.googlevideo.com`);
    hostCandidates.push(`${rrPrefix}---${currentNode}.googlevideo.com`);
    hostCandidates.push(`${currentNode}.googlevideo.com`);
  }

  for (const node of nodes) {
    if (node === currentNode) continue;
    hostCandidates.push(`rr1---${node}.googlevideo.com`);
    hostCandidates.push(`${rrPrefix}---${node}.googlevideo.com`);
    hostCandidates.push(`${node}.googlevideo.com`);
  }

  return unique(hostCandidates).map((host) => toUrl(parsed, host));
};

const pickProxyHeaders = (req: Request) => {
  const headers: Record<string, string> = {
    "user-agent": req.headers["user-agent"] ?? "Mozilla/5.0",
    accept: req.headers.accept ?? "*/*",
    "accept-encoding": "identity"
  };

  const range = req.headers.range;
  if (typeof range === "string" && range.length > 0) {
    headers.range = range;
  }

  return headers;
};

const copyResponseHeaders = (upstreamHeaders: Record<string, string | string[] | undefined>, res: Response): void => {
  const passHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
    "last-modified"
  ] as const;

  for (const header of passHeaders) {
    const value = upstreamHeaders[header];
    if (value) {
      res.setHeader(header, value);
    }
  }

  res.setHeader("x-adfrio-proxy", "googlevideo");
  res.setHeader("cross-origin-resource-policy", "cross-origin");
};

export const proxyGooglevideoCandidates = async (req: Request, res: Response, urls: string[]): Promise<void> => {
  const headers = pickProxyHeaders(req);
  const attempts: ProxyAttempt[] = [];

  const candidates = unique(
    urls
      .flatMap((url) => getHostVariants(url))
      .filter(Boolean)
  );

  if (candidates.length === 0) {
    throw new Error("No proxy candidates available");
  }

  for (const candidate of candidates) {
    try {
      const upstream = await axios.get(candidate, {
        responseType: "stream",
        timeout: STREAM_TIMEOUT_MS,
        headers,
        maxRedirects: 2,
        validateStatus: (status) => status === 200 || status === 206
      });

      copyResponseHeaders(upstream.headers as Record<string, string>, res);
      res.status(upstream.status);

      req.on("close", () => {
        upstream.data.destroy();
      });

      upstream.data.on("error", () => {
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
      });

      upstream.data.pipe(res);
      return;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown proxy error";
      attempts.push({ url: candidate, error: message });
    }
  }

  const reason = attempts.map((entry) => `${entry.url} -> ${entry.error}`).join(" | ");
  throw new Error(`All proxy hosts failed: ${reason}`);
};

export const proxyGooglevideoStream = async (req: Request, res: Response, rawUrl: string): Promise<void> => {
  await proxyGooglevideoCandidates(req, res, [rawUrl]);
};
