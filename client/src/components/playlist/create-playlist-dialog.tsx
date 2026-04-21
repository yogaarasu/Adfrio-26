import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MediaType } from "@/types/media";

type Props = {
  open: boolean;
  creating?: boolean;
  title?: string;
  initialType?: MediaType;
  onClose: () => void;
  onCreate: (name: string, playlistType: MediaType) => Promise<void> | void;
};

export const CreatePlaylistDialog = ({
  open,
  creating = false,
  title = "Create Playlist",
  initialType = "music",
  onClose,
  onCreate,
}: Props) => {
  const [name, setName] = useState("");
  const [playlistType, setPlaylistType] = useState<MediaType>(initialType);

  useEffect(() => {
    if (open) {
      setPlaylistType(initialType);
      return;
    }
    setName("");
    setPlaylistType(initialType);
  }, [initialType, open]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    void onCreate(trimmed, playlistType);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[86] transition-opacity duration-200",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close create playlist dialog"
      />
      <section
        className={cn(
          "absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card p-5 transition-all duration-200",
          open ? "-translate-y-1/2 opacity-100" : "translate-y-6 opacity-0"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Create playlist dialog"
      >
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Name your playlist.</p>
        <div className="mt-3 inline-flex w-full items-center rounded-xl border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setPlaylistType("music")}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
              playlistType === "music"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={playlistType === "music"}
          >
            Songs
          </button>
          <button
            type="button"
            onClick={() => setPlaylistType("video")}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
              playlistType === "video"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={playlistType === "video"}
          >
            Videos
          </button>
        </div>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Playlist name"
          className="mt-3"
          maxLength={80}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          autoFocus={open}
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={creating || name.trim().length === 0}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </div>
      </section>
    </div>
  );
};
