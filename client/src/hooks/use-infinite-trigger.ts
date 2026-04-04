import { useEffect, useRef, useCallback } from "react";

/**
 * Fires `onIntersect` whenever the returned ref's element enters the viewport.
 * rootMargin of 400px means it triggers well before the user reaches the bottom.
 */
export const useInfiniteTrigger = (onIntersect: () => void) => {
  const ref = useRef<HTMLDivElement | null>(null);
  // Stable callback ref so the observer never re-creates on re-render
  const callbackRef = useRef(onIntersect);
  callbackRef.current = onIntersect;

  const stableCallback = useCallback(() => {
    callbackRef.current();
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    const target = ref.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          stableCallback();
        }
      },
      {
        rootMargin: "400px",   // trigger 400px before element is visible
        threshold: 0
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [stableCallback]);

  return ref;
};
