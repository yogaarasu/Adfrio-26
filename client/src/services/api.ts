import axios, { AxiosError } from "axios";
import { API_URL } from "@/lib/constants";
import type { MediaItem, MediaType, PlaylistItem, PlaylistSummary, StreamResponse } from "@/types/media";
import { useAuthStore } from "@/store/auth-store";

const api = axios.create({
  baseURL: API_URL,
  timeout: 12000
});

const STREAM_TIMEOUT_MS = 30000;
const STREAM_MAX_ATTEMPTS = 2;
const STREAM_CACHE_TTL_MS = 90 * 1000;

const streamCache = new Map<string, { expiresAt: number; data: StreamResponse }>();
const streamInFlight = new Map<string, Promise<StreamResponse>>();

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("adfrio_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const status = error.response?.status;
    const message = error.response?.data?.message ?? "";
    const requestUrl = error.config?.url ?? "";
    const hasToken = Boolean(localStorage.getItem("adfrio_token"));
    const isAuthEndpoint =
      requestUrl.includes("/auth/signin") ||
      requestUrl.includes("/auth/signup") ||
      requestUrl.includes("/auth/password/forgot") ||
      requestUrl.includes("/auth/otp");
    const shouldForceLogout =
      hasToken &&
      !isAuthEndpoint &&
      (status === 401 || (status === 404 && /user not found/i.test(message)));

    if (shouldForceLogout) {
      useAuthStore.getState().logout();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/sign-in")) {
        window.location.replace("/sign-in");
      }
    }

    return Promise.reject(error);
  }
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getCachedStream = (id: string): StreamResponse | null => {
  const entry = streamCache.get(id);
  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    streamCache.delete(id);
    return null;
  }

  return entry.data;
};

const setCachedStream = (id: string, data: StreamResponse): void => {
  streamCache.set(id, { data, expiresAt: Date.now() + STREAM_CACHE_TTL_MS });
};

const isCanceledError = (error: unknown): boolean => {
  const axiosError = error as AxiosError;
  return axiosError.code === "ERR_CANCELED";
};

const shouldRetryStream = (error: unknown): boolean => {
  const axiosError = error as AxiosError;
  const status = axiosError.response?.status;
  if (isCanceledError(error)) return false;
  return !status || status >= 500 || axiosError.code === "ECONNABORTED";
};

const fetchStreamWithRetry = async (id: string, signal?: AbortSignal): Promise<StreamResponse> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= STREAM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { data } = await api.get<StreamResponse>(`/media/streams/${id}`, {
        timeout: STREAM_TIMEOUT_MS,
        signal
      });
      return data;
    } catch (error) {
      lastError = error;
      const retry = attempt < STREAM_MAX_ATTEMPTS && shouldRetryStream(error) && !signal?.aborted;
      if (!retry) throw error;
      await sleep(250);
    }
  }

  throw lastError ?? new Error("Failed to load stream");
};

export type MeResponse = {
  user: {
    id: string;
    email: string;
    name: string;
    avatar: string | null;
  };
};

export type SearchApiResponse = {
  items: MediaItem[];
  nextPageToken: string | null;
  suggestions?: string[];
  correctedQuery?: string | null;
  appliedQuery?: string | null;
};

export const authApi = {
  requestOtp: (email: string, name: string) => api.post("/auth/otp/request", { email, name }),
  verifyOtp: (email: string, otp: string) => api.post("/auth/otp/verify", { email, otp }),
  signupRequest: (name: string, email: string, password: string) =>
    api.post("/auth/signup/request", { name, email, password }),
  signupResend: (email: string) => api.post("/auth/signup/resend", { email }),
  signupVerify: (email: string, otp: string) => api.post("/auth/signup/verify", { email, otp }),
  signIn: (email: string, password: string) => api.post("/auth/signin", { email, password }),
  requestForgotPasswordOtp: (email: string) =>
    api.post("/auth/password/forgot/request", { email }),
  verifyForgotPasswordOtp: (email: string, otp: string) =>
    api.post<{ message: string; resetToken: string }>("/auth/password/forgot/verify", {
      email,
      otp,
    }),
  resetForgotPassword: (resetToken: string, newPassword: string, confirmPassword: string) =>
    api.post("/auth/password/forgot/reset", {
      resetToken,
      newPassword,
      confirmPassword,
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch("/auth/password", { currentPassword, newPassword }),
  googleAuth: (credential: string) => api.post("/auth/google", { credential }),
  googleAuthCode: (code: string) => api.post("/auth/google/code", { code }),
  me: () => api.get<MeResponse>("/auth/me"),
  deleteAccount: () => api.delete("/auth/me")
};

type StreamOptions = {
  forceRefresh?: boolean;
  signal?: AbortSignal;
};

export const mediaApi = {
  search: async (
    q: string,
    type: MediaType,
    pageToken?: string,
    realtimeId?: string
  ): Promise<SearchApiResponse> => {
    const { data } = await api.get("/media/search", { params: { q, type, pageToken, realtimeId } });
    return data;
  },
  homeFeed: async (params: {
    mode: MediaType;
    language: string;
    pageToken?: string;
    sessionSeed?: number;
    realtimeId?: string;
    interestSeeds?: string[];
  }): Promise<{ items: MediaItem[]; nextPageToken: string | null }> => {
    const { data } = await api.get("/media/home", {
      params: {
        mode: params.mode,
        language: params.language,
        pageToken: params.pageToken,
        sessionSeed: params.sessionSeed,
        realtimeId: params.realtimeId,
        interestSeeds: params.interestSeeds?.join("|"),
      },
    });
    return data;
  },
  streams: async (id: string, options?: StreamOptions): Promise<StreamResponse> => {
    const forceRefresh = options?.forceRefresh ?? false;
    const signal = options?.signal;
    const useSharedInFlight = !forceRefresh && !signal;

    if (forceRefresh) {
      streamCache.delete(id);
    }

    if (!forceRefresh) {
      const cached = getCachedStream(id);
      if (cached) return cached;
    }

    if (useSharedInFlight) {
      const pending = streamInFlight.get(id);
      if (pending) return pending;

      const request = fetchStreamWithRetry(id)
        .then((data) => {
          setCachedStream(id, data);
          return data;
        })
        .finally(() => {
          streamInFlight.delete(id);
        });

      streamInFlight.set(id, request);
      return request;
    }

    const data = await fetchStreamWithRetry(id, signal);
    setCachedStream(id, data);
    return data;
  },
  prefetchStreams: (ids: string[]) => {
    const unique = [...new Set(ids)].slice(0, 4);
    unique.forEach((id) => {
      if (!id || getCachedStream(id) || streamInFlight.has(id)) return;
      void mediaApi.streams(id).catch(() => undefined);
    });
  },
  clearStreamCache: () => {
    streamCache.clear();
  },
  isCanceledError
};

export const playlistApi = {
  list: async () => {
    const { data } = await api.get("/playlists");
    return data.playlists as PlaylistSummary[];
  },
  create: (
    name: string,
    description: string,
    playlistType: MediaType,
    initialItem?: PlaylistItem
  ) =>
    api.post("/playlists", { name, description, playlistType, initialItem }),
  update: (playlistId: string, payload: { name?: string; description?: string }) =>
    api.patch(`/playlists/${playlistId}`, payload),
  addItem: (playlistId: string, item: PlaylistItem) => api.post(`/playlists/${playlistId}/items`, item),
  reorderItems: (playlistId: string, mediaIds: string[]) =>
    api.patch(`/playlists/${playlistId}/items/reorder`, { mediaIds }),
  removeItem: (playlistId: string, mediaId: string) => api.delete(`/playlists/${playlistId}/items/${mediaId}`),
  delete: (playlistId: string) => api.delete(`/playlists/${playlistId}`),
};
