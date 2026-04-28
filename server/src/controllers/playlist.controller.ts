import type { Request, Response } from "express";
import { z } from "zod";
import { PlaylistModel } from "../models/Playlist.js";
import { sendError } from "../utils/http.js";

const playlistItemSchema = z.object({
  mediaId: z.string().trim().min(1),
  mediaType: z.enum(["music", "video"]),
  title: z.string().trim().min(1),
  artwork: z.string().trim().optional().nullable(),
  creator: z.string().trim().optional().nullable(),
  duration: z.number().optional().nullable(),
});

const createPlaylistSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  playlistType: z.enum(["music", "video"]).default("music"),
  initialItem: playlistItemSchema.optional(),
});

const updatePlaylistSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
});

const reorderItemsSchema = z.object({
  mediaIds: z.array(z.string().trim().min(1)).min(1).max(200),
});

const normalizePlaylistName = (name: string): string => name.trim().toLowerCase();
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findDuplicatePlaylist = async (
  userId: string,
  rawName: string,
  excludePlaylistId?: string
): Promise<boolean> => {
  const normalizedName = normalizePlaylistName(rawName);
  const exactNamePattern = new RegExp(`^${escapeRegExp(rawName.trim())}$`, "i");
  const query: Record<string, unknown> = {
    userId,
    $or: [{ normalizedName }, { name: exactNamePattern }],
  };
  if (excludePlaylistId) {
    query._id = { $ne: excludePlaylistId };
  }
  const duplicate = await PlaylistModel.exists(query);
  return Boolean(duplicate);
};

const isDuplicateKeyError = (error: unknown): boolean =>
  Boolean(
    typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: number }).code === 11000
  );

const sanitizePlaylist = <T extends { normalizedName?: string }>(playlist: T): Omit<T, "normalizedName"> => {
  const { normalizedName: _omit, ...rest } = playlist;
  return rest;
};

const resolveUserId = (req: Request): string | null => {
  const rawUserId = req.user?.userId;
  if (typeof rawUserId === "string") return rawUserId;
  if (Array.isArray(rawUserId)) return rawUserId[0] ?? null;
  return null;
};

const ensurePlaylistAccess = async (playlistId: string, userId: string) => {
  const playlist = await PlaylistModel.findOne({ _id: playlistId, userId });
  if (!playlist) return null;
  return playlist;
};

export const listPlaylists = async (req: Request, res: Response): Promise<Response> => {
  const userId = resolveUserId(req);
  if (!userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const playlists = await PlaylistModel.find({ userId }).sort({ updatedAt: -1 }).lean();
  const normalized = playlists.map((playlist) =>
    sanitizePlaylist({
      ...playlist,
      playlistType: playlist.playlistType ?? playlist.items?.[0]?.mediaType ?? "music",
    })
  );

  return res.json({ playlists: normalized });
};

export const createPlaylist = async (req: Request, res: Response): Promise<Response> => {
  const userId = resolveUserId(req);
  if (!userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const parsed = createPlaylistSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid payload");
  }

  const normalizedName = normalizePlaylistName(parsed.data.name);
  const duplicate = await findDuplicatePlaylist(userId, parsed.data.name);
  if (duplicate) {
    return sendError(res, 409, "Playlist name already exists");
  }

  const initialItem = parsed.data.initialItem ?? null;
  if (initialItem && initialItem.mediaType !== parsed.data.playlistType) {
    return sendError(
      res,
      400,
      `Cannot add ${initialItem.mediaType === "music" ? "song" : "video"} to a ${
        parsed.data.playlistType === "music" ? "songs" : "videos"
      } playlist`
    );
  }

  try {
    const playlist = await PlaylistModel.create({
      userId,
      name: parsed.data.name,
      normalizedName,
      description: parsed.data.description,
      playlistType: parsed.data.playlistType,
      items: initialItem ? [initialItem] : [],
    });

    return res.status(201).json({ playlist: sanitizePlaylist(playlist.toObject()) });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendError(res, 409, "Playlist name already exists");
    }
    throw error;
  }
};

export const updatePlaylist = async (req: Request, res: Response): Promise<Response> => {
  const userId = resolveUserId(req);
  if (!userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const parsed = updatePlaylistSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid payload");
  }

  if (!parsed.data.name && parsed.data.description === undefined) {
    return sendError(res, 400, "Nothing to update");
  }

  const playlist = await ensurePlaylistAccess(String(req.params.id), userId);
  if (!playlist) {
    return sendError(res, 404, "Playlist not found");
  }

  if (parsed.data.name) {
    const normalizedName = normalizePlaylistName(parsed.data.name);
    const duplicate = await findDuplicatePlaylist(
      userId,
      parsed.data.name,
      String(playlist._id)
    );
    if (duplicate) {
      return sendError(res, 409, "Playlist name already exists");
    }
    playlist.name = parsed.data.name;
    playlist.normalizedName = normalizedName;
  }
  if (parsed.data.description !== undefined) {
    playlist.description = parsed.data.description;
  }

  try {
    await playlist.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendError(res, 409, "Playlist name already exists");
    }
    throw error;
  }

  return res.json({ playlist: sanitizePlaylist(playlist.toObject()) });
};

export const addPlaylistItem = async (req: Request, res: Response): Promise<Response> => {
  const userId = resolveUserId(req);
  if (!userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const parsed = playlistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid payload");
  }

  const playlist = await ensurePlaylistAccess(String(req.params.id), userId);
  if (!playlist) {
    return sendError(res, 404, "Playlist not found");
  }

  const playlistType = playlist.playlistType ?? playlist.items?.[0]?.mediaType;
  if (playlistType && playlistType !== parsed.data.mediaType) {
    return sendError(
      res,
      400,
      `Cannot add ${parsed.data.mediaType === "music" ? "song" : "video"} to a ${
        playlistType === "music" ? "songs" : "videos"
      } playlist`
    );
  }

  const exists = playlist.items.some((item) => item.mediaId === parsed.data.mediaId);
  if (!exists) {
    if (!playlist.playlistType) {
      playlist.set("playlistType", parsed.data.mediaType);
    }
    playlist.items.push(parsed.data);
    await playlist.save();
  }

  return res.json({ playlist: sanitizePlaylist(playlist.toObject()) });
};

export const removePlaylistItem = async (req: Request, res: Response): Promise<Response> => {
  const userId = resolveUserId(req);
  if (!userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const playlist = await ensurePlaylistAccess(String(req.params.id), userId);
  if (!playlist) {
    return sendError(res, 404, "Playlist not found");
  }

  const mediaId = String(req.params.mediaId);
  playlist.set("items", playlist.items.filter((item) => item.mediaId !== mediaId));
  await playlist.save();

  return res.json({ playlist: sanitizePlaylist(playlist.toObject()) });
};

export const reorderPlaylistItems = async (req: Request, res: Response): Promise<Response> => {
  const userId = resolveUserId(req);
  if (!userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const parsed = reorderItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid payload");
  }

  const playlist = await ensurePlaylistAccess(String(req.params.id), userId);
  if (!playlist) {
    return sendError(res, 404, "Playlist not found");
  }

  const currentById = new Map(playlist.items.map((item) => [item.mediaId, item]));
  const nextItems = parsed.data.mediaIds
    .map((mediaId) => currentById.get(mediaId))
    .filter((item): item is (typeof playlist.items)[number] => Boolean(item));

  if (nextItems.length !== playlist.items.length) {
    return sendError(res, 400, "Reorder payload does not match playlist items");
  }

  playlist.set("items", nextItems);
  await playlist.save();

  return res.json({ playlist: sanitizePlaylist(playlist.toObject()) });
};

export const deletePlaylist = async (req: Request, res: Response): Promise<Response> => {
  const userId = resolveUserId(req);
  if (!userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const result = await PlaylistModel.deleteOne({ _id: String(req.params.id), userId });
  if (!result.deletedCount) {
    return sendError(res, 404, "Playlist not found");
  }
  return res.status(204).send();
};
