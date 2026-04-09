export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const DEFAULT_WS_URL = "ws://localhost:8080/api/realtime/ws";

export const REALTIME_WS_URL = (() => {
  try {
    const apiUrl = new URL(API_URL);
    apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    apiUrl.pathname = `${apiUrl.pathname.replace(/\/+$/, "")}/realtime/ws`;
    apiUrl.search = "";
    apiUrl.hash = "";
    return apiUrl.toString();
  } catch {
    return DEFAULT_WS_URL;
  }
})();
