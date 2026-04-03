export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export const NAV_ITEMS = [
  { label: "Music", path: "/music" },
  { label: "Videos", path: "/videos" },
  { label: "Library", path: "/library" },
  { label: "Account", path: "/account" }
];
