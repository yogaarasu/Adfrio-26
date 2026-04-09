import { useEffect, useRef } from "react";

export const useScrollThreshold = (onReach: () => void, threshold = 0.8) => {
  const callbackRef = useRef(onReach);
  const lastTriggerAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  callbackRef.current = onReach;

  useEffect(() => {
    const checkThreshold = () => {
      const doc = document.documentElement;
      const scrollHeight = Math.max(doc.scrollHeight, document.body.scrollHeight);
      if (scrollHeight <= 0) return;

      const ratio = (window.scrollY + window.innerHeight) / scrollHeight;
      if (ratio >= threshold) {
        const now = Date.now();
        if (now - lastTriggerAtRef.current < 420) return;
        lastTriggerAtRef.current = now;
        callbackRef.current();
      }
    };

    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        checkThreshold();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [threshold]);
};
