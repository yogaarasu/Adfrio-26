import { useQuery } from "@tanstack/react-query";
import { playlistApi } from "@/services/api";
import { Card } from "@/components/ui/card";

export const LibraryPage = () => {
  const { data: playlists, isLoading } = useQuery({ queryKey: ["playlists"], queryFn: playlistApi.list });

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold uppercase tracking-[0.18em]">Your Library</h1>
      {isLoading ? <p className="text-white/60">Loading playlists...</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {playlists?.map((playlist) => (
          <Card key={playlist._id}>
            <h2 className="text-lg font-semibold">{playlist.name}</h2>
            <p className="text-sm text-white/70">{playlist.description || "No description"}</p>
            <p className="mt-3 text-xs text-white/60">{playlist.items.length} items</p>
          </Card>
        ))}
      </div>
      {playlists?.length === 0 ? <p className="text-white/60">No playlists yet. Add media from Music or Video hubs.</p> : null}
    </section>
  );
};
