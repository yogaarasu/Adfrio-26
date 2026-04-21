import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, EllipsisVertical, ListPlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { mediaApi, playlistApi } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import { usePlayerStore } from "@/store/player-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreatePlaylistDialog } from "@/components/playlist/create-playlist-dialog";
import { cn } from "@/lib/utils";
import type { MediaItem, PlaylistItem, PlaylistSummary } from "@/types/media";

const toMediaItem = (item: PlaylistItem): MediaItem => ({
  id: item.mediaId,
  title: item.title,
  creator: item.creator ?? "Unknown creator",
  thumbnail: item.artwork ?? `https://i.ytimg.com/vi/${item.mediaId}/hqdefault.jpg`,
  duration: item.duration ?? null,
  type: item.mediaType,
});

export const LibraryPage = () => {
  const navigate = useNavigate();
  const { playlistId } = useParams<{ playlistId?: string }>();
  const user = useAuthStore((state) => state.user);
  const mode = usePreferencesStore((state) => state.mode);

  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [actionSheetItem, setActionSheetItem] = useState<{
    playlistId: string;
    playlistName: string;
    item: PlaylistItem;
  } | null>(null);
  const [playlistAction, setPlaylistAction] = useState<PlaylistSummary | null>(null);
  const [confirmDeletePlaylist, setConfirmDeletePlaylist] = useState(false);
  const [deletingPlaylist, setDeletingPlaylist] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const queue = usePlayerStore((state) => state.queue);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const playAudio = usePlayerStore((state) => state.playAudio);
  const playVideo = usePlayerStore((state) => state.playVideo);
  const updateVideoSession = usePlayerStore((state) => state.updateVideoSession);
  const openVideoOverlay = usePlayerStore((state) => state.openVideoOverlay);
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);

  const playlistsQuery = useQuery({
    queryKey: ["library-playlists", user?.id],
    enabled: Boolean(user),
    queryFn: playlistApi.list,
  });

  const playlists = (playlistsQuery.data ?? []) as PlaylistSummary[];
  const visiblePlaylists = useMemo(
    () => playlists.filter((playlist) => playlist.playlistType === mode),
    [mode, playlists]
  );

  const selectedPlaylist = useMemo(() => {
    if (!playlistId) return null;
    return visiblePlaylists.find((entry) => entry._id === playlistId) ?? null;
  }, [playlistId, visiblePlaylists]);

  useEffect(() => {
    if (!playlistId) return;
    if (playlistsQuery.isLoading) return;
    if (selectedPlaylist) return;
    navigate("/library", { replace: true });
  }, [navigate, playlistId, playlistsQuery.isLoading, selectedPlaylist]);

  const selectedModeItems = useMemo(
    () => (selectedPlaylist?.items ?? []).filter((item) => item.mediaType === mode),
    [mode, selectedPlaylist?.items]
  );

  const selectedModeMediaItems = useMemo(
    () => selectedModeItems.map(toMediaItem),
    [selectedModeItems]
  );

  const openPlaylist = useCallback(
    (id: string) => {
      navigate(`/library/${id}`);
    },
    [navigate]
  );

  const playMedia = useCallback(
    async (item: MediaItem, playlistQueue: MediaItem[]) => {
      setLoadingItemId(item.id);

      try {
        if (item.type === "music") {
          playAudio(
            item,
            { url: `https://www.youtube.com/watch?v=${item.id}`, mimeType: "audio/mpeg" },
            playlistQueue
          );
        } else {
          const started = playVideo(item, [], []);
          if (!started) return;
          mediaApi
            .streams(item.id)
            .then((stream) => {
              updateVideoSession(item.id, {
                related: stream.related ?? [],
                description: stream.description,
                uploader: stream.uploader,
                uploaderAvatarUrl: stream.uploaderAvatarUrl ?? null,
                likes: stream.likes ?? null,
              });
            })
            .catch(() => undefined);
        }
      } catch {
        toast.error(`Playback failed. Please try another ${item.type === "music" ? "song" : "video"}.`);
      } finally {
        setLoadingItemId(null);
      }
    },
    [playAudio, playVideo, updateVideoSession]
  );

  const removeFromPlaylist = useCallback(async () => {
    if (!actionSheetItem) return;
    setRemoving(true);
    try {
      await playlistApi.removeItem(actionSheetItem.playlistId, actionSheetItem.item.mediaId);
      await playlistsQuery.refetch();
      toast.success(`Removed from ${actionSheetItem.playlistName}.`);
      setActionSheetItem(null);
    } catch {
      toast.error(`Could not remove this ${actionSheetItem.item.mediaType === "music" ? "song" : "video"}.`);
    } finally {
      setRemoving(false);
    }
  }, [actionSheetItem, playlistsQuery]);

  const addToQueue = useCallback(() => {
    if (!actionSheetItem) return;
    const media = toMediaItem(actionSheetItem.item);
    setQueue([...queue, media]);
    toast.success("Added to queue.");
    setActionSheetItem(null);
  }, [actionSheetItem, queue, setQueue]);

  const goToQueue = useCallback(() => {
    setActionSheetItem(null);
    if (current?.type === "video") {
      openVideoOverlay();
    }
    navigate("/now-playing");
  }, [current?.type, navigate, openVideoOverlay]);

  const deletePlaylist = useCallback(async () => {
    if (!playlistAction) return;
    setDeletingPlaylist(true);
    try {
      await playlistApi.delete(playlistAction._id);
      await playlistsQuery.refetch();
      toast.success("Playlist deleted.");
      if (playlistId === playlistAction._id) {
        navigate("/library", { replace: true });
      }
      setConfirmDeletePlaylist(false);
      setPlaylistAction(null);
    } catch {
      toast.error("Could not delete playlist.");
    } finally {
      setDeletingPlaylist(false);
    }
  }, [navigate, playlistAction, playlistId, playlistsQuery]);

  const createPlaylist = useCallback(
    async (name: string, playlistType: "music" | "video") => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setCreatingPlaylist(true);
      try {
        await playlistApi.create(trimmed, "Created from Library", playlistType);
        await playlistsQuery.refetch();
        toast.success("Playlist created.");
        setShowCreateDialog(false);
      } catch {
        toast.error("Could not create playlist.");
      } finally {
        setCreatingPlaylist(false);
      }
    },
    [playlistsQuery]
  );

  if (!user) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Library</h1>
        <Card>
          <p className="text-sm text-muted-foreground">
            Sign in from Profile to create playlists and view saved items.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <>
      {!playlistId ? (
        <section className="space-y-4">
          <header className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Library</h1>
              <p className="text-sm text-muted-foreground">Your playlists</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Create Playlist
            </Button>
          </header>

          {playlistsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading playlists...
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePlaylists.map((playlist) => {
              const modeCount = playlist.items.filter((entry) => entry.mediaType === mode).length;
              return (
                <div key={playlist._id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => openPlaylist(playlist._id)}
                      className="min-w-0 flex-1 text-left transition hover:text-primary"
                    >
                      <p className="line-clamp-1 text-base font-semibold">{playlist.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {modeCount} {mode === "music" ? "songs" : "videos"}
                      </p>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => setPlaylistAction(playlist)}
                      aria-label={`Open playlist options for ${playlist.name}`}
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {!playlistsQuery.isLoading && visiblePlaylists.length === 0 ? (
              <Card className="sm:col-span-2 lg:col-span-3">
                <p className="text-sm text-muted-foreground">
                  No {mode === "music" ? "songs" : "videos"} playlists yet. Create your first playlist.
                </p>
              </Card>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <header className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/library")} className="w-fit">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="line-clamp-1 text-2xl font-bold">{selectedPlaylist?.name ?? "Playlist"}</h1>
              <p className="text-sm text-muted-foreground">Playlist</p>
            </div>
          </header>

          <Card className="overflow-hidden p-0">
            {selectedModeMediaItems.map((item) => {
              const raw = selectedModeItems.find((entry) => entry.mediaId === item.id);
              if (!raw) return null;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-border/70 px-4 py-3 text-left transition hover:bg-muted/45 last:border-b-0",
                    loadingItemId === item.id ? "pointer-events-none opacity-70" : ""
                  )}
                  onClick={() => void playMedia(item, selectedModeMediaItems)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void playMedia(item, selectedModeMediaItems);
                    }
                  }}
                  aria-disabled={loadingItemId === item.id}
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md">
                    <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                    {loadingItemId === item.id ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </div>
                    ) : null}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.creator}</span>
                  </span>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-muted",
                      current?.id === item.id && playing ? "text-primary" : "text-muted-foreground"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActionSheetItem({
                        playlistId: selectedPlaylist?._id ?? "",
                        playlistName: selectedPlaylist?.name ?? "Playlist",
                        item: raw,
                      });
                    }}
                    aria-label="Open item options"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </button>
                </div>
              );
            })}

            {!playlistsQuery.isLoading && selectedModeMediaItems.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">
                No {mode === "music" ? "songs" : "videos"} in this playlist yet.
              </p>
            ) : null}
          </Card>
        </section>
      )}

      <CreatePlaylistDialog
        open={showCreateDialog}
        creating={creatingPlaylist}
        initialType={mode}
        onClose={() => setShowCreateDialog(false)}
        onCreate={createPlaylist}
      />

      <div
        className={cn(
          "fixed inset-0 z-[70] transition-opacity duration-300",
          actionSheetItem ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/60"
          onClick={() => setActionSheetItem(null)}
          aria-label="Close item actions"
        />
        <section
          className={cn(
            "absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-card px-4 pb-5 pt-4 transition-transform duration-300 ease-out",
            actionSheetItem ? "translate-y-0" : "translate-y-full"
          )}
          aria-label="Playlist item actions"
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
          <div className="mx-auto max-w-xl space-y-2">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-sm transition hover:bg-muted"
              onClick={() => void removeFromPlaylist()}
              disabled={removing}
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span>Remove from this playlist</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-sm transition hover:bg-muted"
              onClick={addToQueue}
            >
              <ListPlus className="h-4 w-4" />
              <span>Add to queue</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-sm transition hover:bg-muted"
              onClick={goToQueue}
            >
              <ChevronLeft className="h-4 w-4 rotate-180" />
              <span>Go to queue</span>
            </button>
          </div>
        </section>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-[72] transition-opacity duration-300",
          playlistAction ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/45"
          onClick={() => setPlaylistAction(null)}
          aria-label="Close playlist actions"
        />
        <section
          className={cn(
            "absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-card px-4 pb-5 pt-4 transition-transform duration-300 ease-out",
            playlistAction ? "translate-y-0" : "translate-y-full"
          )}
        >
          <div className="mx-auto max-w-xl space-y-2">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-border" />
            <div className="flex items-center justify-between">
              <p className="truncate text-sm font-medium">{playlistAction?.name}</p>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPlaylistAction(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-sm transition hover:bg-muted"
              onClick={() => setConfirmDeletePlaylist(true)}
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete playlist</span>
            </button>
          </div>
        </section>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-[74] transition-opacity duration-200",
          confirmDeletePlaylist ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/55"
          onClick={() => setConfirmDeletePlaylist(false)}
          aria-label="Close delete confirmation"
        />
        <section
          className={cn(
            "absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card p-5 transition-all duration-200",
            confirmDeletePlaylist ? "-translate-y-1/2 opacity-100" : "translate-y-6 opacity-0"
          )}
        >
          <h3 className="text-base font-semibold">Delete Playlist?</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {playlistAction?.name} will be deleted permanently.
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDeletePlaylist(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void deletePlaylist()}
              disabled={deletingPlaylist}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {deletingPlaylist ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
};
