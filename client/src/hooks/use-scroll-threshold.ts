import { useEffect, useRef } from "react";

export const useScrollThreshold = (onReach: () => void, threshold = 0.8) => {
  const callbackRef = useRef(onReach);
  const lockedRef = useRef(false);

  callbackRef.current = onReach;

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const maxScrollable = doc.scrollHeight - window.innerHeight;
      if (maxScrollable <= 0) return;

      const ratio = window.scrollY / maxScrollable;
      if (ratio >= threshold && !lockedRef.current) {
        lockedRef.current = true;
        callbackRef.current();
        return;
      }

      if (ratio < threshold - 0.2) {
        lockedRef.current = false;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [threshold]);
};
