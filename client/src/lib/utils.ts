import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDuration = (seconds?: number | null): string => {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds) || seconds <= 0) return "--:--";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const min = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${min}:${sec}`;
  }
  return `${Number(min)}:${sec}`;
};
