import { useCallback, useEffect, useRef, useState } from "react";

export type RealtimeTimelineState = {
  percent: number;
  message: string;
  startedAt: number;
  finishedAt: number | null;
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

export const useRealtimeTimeline = () => {
  const [timeline, setTimeline] = useState<RealtimeTimelineState | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setTimeline(null);
  }, []);

  const push = useCallback(
    (percent: number | null | undefined, message: string) => {
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }

      const now = Date.now();
      setTimeline((previous) => {
        const basePercent = previous?.percent ?? 0;
        const nextPercent = clampPercent(
          typeof percent === "number" ? percent : Math.min(96, basePercent + 8)
        );

        return {
          percent: nextPercent,
          message,
          startedAt: previous?.startedAt ?? now,
          finishedAt: nextPercent >= 100 ? now : null
        };
      });

      if (typeof percent === "number" && percent >= 100) {
        clearTimerRef.current = window.setTimeout(() => {
          setTimeline(null);
          clearTimerRef.current = null;
        }, 950);
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current);
      }
    },
    []
  );

  return { timeline, push, clear };
};
