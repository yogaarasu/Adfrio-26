import { useEffect } from "react";

const SHEET_OPEN_COUNT_KEY = "__adfrioBottomSheetOpenCount";

type WindowWithSheetCounter = Window & {
  [SHEET_OPEN_COUNT_KEY]?: number;
};

export const useBottomSheetVisibility = (open: boolean) => {
  useEffect(() => {
    if (typeof window === "undefined" || !open) return;

    const body = document.body;
    const win = window as WindowWithSheetCounter;
    const currentCount = win[SHEET_OPEN_COUNT_KEY] ?? 0;
    const nextCount = currentCount + 1;
    win[SHEET_OPEN_COUNT_KEY] = nextCount;

    // Keep both attrs for backward compatibility with existing CSS hooks.
    body.setAttribute("data-bottom-sheet-open", "true");
    body.setAttribute("data-playlist-sheet-open", "true");

    return () => {
      const active = win[SHEET_OPEN_COUNT_KEY] ?? 1;
      const remaining = Math.max(0, active - 1);
      if (remaining === 0) {
        delete win[SHEET_OPEN_COUNT_KEY];
        body.removeAttribute("data-bottom-sheet-open");
        body.removeAttribute("data-playlist-sheet-open");
        return;
      }
      win[SHEET_OPEN_COUNT_KEY] = remaining;
    };
  }, [open]);
};
