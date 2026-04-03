import { Loader2, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";
import type { MediaItem } from "@/types/media";

type Props = {
  item: MediaItem;
  onPlay: (item: MediaItem) => Promise<void> | void;
  onAdd?: (item: MediaItem) => Promise<void> | void;
  isLoading?: boolean;
};

export const MediaCard = ({ item, onPlay, onAdd, isLoading = false }: Props) => (
  <Card className="group overflow-hidden p-0">
    <div className="relative aspect-video overflow-hidden">
      <img
        src={item.thumbnail}
        alt={item.title}
        loading="lazy"
        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <Badge className="absolute right-3 top-3 bg-black/60">{formatDuration(item.duration)}</Badge>
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
        <div>
          <p className="line-clamp-1 text-sm font-semibold">{item.title}</p>
          <p className="line-clamp-1 text-xs text-white/70">{item.creator}</p>
        </div>
        <div className="flex gap-2">
          {onAdd && (
            <Button size="icon" variant="outline" onClick={() => void onAdd(item)} disabled={isLoading}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" onClick={() => void onPlay(item)} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
          </Button>
        </div>
      </div>
    </div>
  </Card>
);
