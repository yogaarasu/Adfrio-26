import { useCallback, useEffect, useMemo, useState } from "react";
import { EllipsisVertical, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { playlistApi } from "@/services/api";
import { CreatePlaylistDialog } from "@/components/playlist/create-playlist-dialog";
import type { MediaItem, PlaylistSummary } from "@/types/media";

type Props = {
  open: boolean;
  item: MediaItem | null;
  onClose: () => void;
};

export const AddToPlaylistSheet = ({ open, item, onClose }: Props) => {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingPlaylistId, setAddingPlaylistId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionPlaylist, setActionPlaylist] = useState<PlaylistSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      const result = (await playlistApi.list()) as PlaylistSummary[];
      setPlaylists(result);
    } catch {
      toast.error("Sign in to manage playlists.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadPlaylists();
  }, [loadPlaylists, open]);

  useEffect(() => {
    if (!open) {
      setShowCreateDialog(false);
      setActionPlaylist(null);
      setConfirmDelete(false);
    }
  }, [open]);

  const addToPlaylist = useCallback(
    async (playlistId: string) => {
      if (!item) return;
      setAddingPlaylistId(playlistId);
      try {
        await playlistApi.addItem(playlistId, {
          mediaId: item.id,
          mediaType: item.type,
          title: item.title,
          creator: item.creator,
          artwork: item.thumbnail,
          duration: item.duration,
        });
        toast.success(`${item.type === "music" ? "Song" : "Video"} added to playlist.`);
        onClose();
      } catch {
        toast.error(`Could not add ${item.type === "music" ? "song" : "video"} to playlist.`);
      } finally {
        setAddingPlaylistId(null);
      }
    },
    [item, onClose]
  );

  const createPlaylist = useCallback(async (name: string, playlistType: "music" | "video") => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await playlistApi.create(trimmed, "Created from Adfrio", playlistType);
      await loadPlaylists();
      setShowCreateDialog(false);
      toast.success("Playlist created.");
    } catch {
      toast.error("Could not create playlist.");
    } finally {
      setCreating(false);
    }
  }, [loadPlaylists]);

  const deletePlaylist = useCallback(async () => {
    if (!actionPlaylist) return;
    setDeleting(true);
    try {
      await playlistApi.delete(actionPlaylist._id);
      const refreshed = (await playlistApi.list()) as PlaylistSummary[];
      setPlaylists(refreshed);
      setConfirmDelete(false);
      setActionPlaylist(null);
      toast.success("Playlist deleted.");
    } catch {
      toast.error("Could not delete playlist.");
    } finally {
      setDeleting(false);
    }
  }, [actionPlaylist]);

  const currentType = item?.type ?? "music";
  const sortedPlaylists = useMemo(
    () =>
      [...playlists]
        .filter((playlist) => playlist.playlistType === currentType)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [currentType, playlists]
  );

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[72] transition-opacity duration-300",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/60"
          onClick={onClose}
          aria-label="Close add to playlist sheet"
        />
        <section
          className={cn(
            "absolute bottom-0 left-0 right-0 max-h-[78vh] rounded-t-3xl border-t border-border bg-card px-4 pb-5 pt-4 transition-transform duration-300 ease-out",
            open ? "translate-y-0" : "translate-y-full"
          )}
          aria-label="Add item to playlist"
        >
          <div className="mx-auto max-w-xl space-y-3">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-border" />
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Add To Playlist</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateDialog(true)}
                aria-label="Create new playlist"
              >
                <Plus className="mr-1 h-4 w-4" />
                Create
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading playlists...
              </div>
            ) : (
              <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                {sortedPlaylists.map((playlist) => (
                  <div
                    key={playlist._id}
                    className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => void addToPlaylist(playlist._id)}
                      className="min-w-0 flex-1 text-left"
                      disabled={addingPlaylistId === playlist._id}
                    >
                      <span className="block truncate text-sm font-medium">{playlist.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {playlist.items.filter((entry) => entry.mediaType === currentType).length}{" "}
                        {currentType === "music" ? "songs" : "videos"}
                      </span>
                    </button>
                    {addingPlaylistId === playlist._id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => setActionPlaylist(playlist)}
                      aria-label={`Open actions for ${playlist.name}`}
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {sortedPlaylists.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No playlists yet. Create one.</p>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>

      <CreatePlaylistDialog
        open={showCreateDialog}
        creating={creating}
        initialType={currentType}
        onClose={() => setShowCreateDialog(false)}
        onCreate={createPlaylist}
      />

      <div
        className={cn(
          "fixed inset-0 z-[74] transition-opacity duration-300",
          actionPlaylist ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/45"
          onClick={() => setActionPlaylist(null)}
          aria-label="Close playlist actions"
        />
        <section
          className={cn(
            "absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-card px-4 pb-5 pt-4 transition-transform duration-300 ease-out",
            actionPlaylist ? "translate-y-0" : "translate-y-full"
          )}
          aria-label="Playlist actions"
        >
          <div className="mx-auto max-w-xl space-y-2">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-border" />
            <div className="flex items-center justify-between">
              <p className="truncate text-sm font-medium">{actionPlaylist?.name}</p>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setActionPlaylist(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-sm transition hover:bg-muted"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete playlist</span>
            </button>
          </div>
        </section>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-[76] transition-opacity duration-200",
          confirmDelete ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/55"
          onClick={() => setConfirmDelete(false)}
          aria-label="Close delete confirmation"
        />
        <section
          className={cn(
            "absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card p-5 transition-all duration-200",
            confirmDelete ? "-translate-y-1/2 opacity-100" : "translate-y-6 opacity-0"
          )}
        >
          <h3 className="text-base font-semibold">Delete Playlist?</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {actionPlaylist?.name} will be deleted permanently.
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void deletePlaylist()}
              disabled={deleting}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
};
