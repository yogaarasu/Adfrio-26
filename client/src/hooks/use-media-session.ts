import { useEffect } from "react";
import { usePlayerStore } from "@/store/player-store";

type Params = {
  onSeekBy: (seconds: number) => void;
  onNext: () => void;
  onPrev: () => void;
};

export const useMediaSession = ({ onSeekBy, onNext, onPrev }: Params) => {
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.creator,
      artwork: current.thumbnail ? [{ src: current.thumbnail, sizes: "512x512", type: "image/jpeg" }] : []
    });

    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("nexttrack", onNext);
    navigator.mediaSession.setActionHandler("previoustrack", onPrev);
    navigator.mediaSession.setActionHandler("seekforward", () => onSeekBy(10));
    navigator.mediaSession.setActionHandler("seekbackward", () => onSeekBy(-10));
  }, [current, onNext, onPrev, onSeekBy, playing]);
};
