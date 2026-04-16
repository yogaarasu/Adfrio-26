import { Loader2, Pause, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";
import type { MediaItem } from "@/types/media";

type Props = {
  item: MediaItem;
  onPlay: (item: MediaItem) => Promise<void> | void;
  onOpen?: (item: MediaItem) => Promise<void> | void;
  onAdd?: (item: MediaItem) => Promise<void> | void;
  isLoading?: boolean;
  isCurrentTrack?: boolean;
  isCurrentPlaying?: boolean;
};

export const MediaCard = ({
  item,
  onPlay,
  onOpen,
  onAdd,
  isLoading = false,
  isCurrentTrack = false,
  isCurrentPlaying = false,
}: Props) => (
  <Card className="group overflow-hidden p-0">
    <div
      className="relative aspect-video cursor-pointer overflow-hidden"
      role="button"
      tabIndex={0}
      onClick={() => void (onOpen ?? onPlay)(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void (onOpen ?? onPlay)(item);
        }
      }}
    >
      <img
        src={item.thumbnail}
        alt={item.title}
        loading="lazy"
        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <Badge className="absolute right-3 top-3 border-white/30 bg-black/60 text-white/90">
        {formatDuration(item.duration)}
      </Badge>
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
        <div>
          <p className="line-clamp-1 text-sm font-semibold text-white">{item.title}</p>
          <p className="line-clamp-1 text-xs text-white/70">{item.creator}</p>
        </div>
        <div className="flex gap-2">
          {onAdd && (
            <Button
              size="icon"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                void onAdd(item);
              }}
              disabled={isLoading}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            onClick={(event) => {
              event.stopPropagation();
              void onPlay(item);
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isCurrentTrack && isCurrentPlaying ? (
              <span className="flex items-end gap-0.5" aria-label="Playing">
                <span className="h-2 w-0.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                <span className="h-3 w-0.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                <span className="h-2 w-0.5 rounded-full bg-current animate-bounce" />
              </span>
            ) : isCurrentTrack ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
          </Button>
        </div>
      </div>
    </div>
  </Card>
);
