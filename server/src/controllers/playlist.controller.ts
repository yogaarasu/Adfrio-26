import type { Request, Response } from "express";
import { z } from "zod";
import { PlaylistModel } from "../models/Playlist.js";
import { sendError } from "../utils/http.js";

const createPlaylistSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).default(""),
  playlistType: z.enum(["music", "video"]).default("music")
});

const playlistItemSchema = z.object({
  mediaId: z.string().min(1),
  mediaType: z.enum(["music", "video"]),
  title: z.string().min(1),
  artwork: z.string().optional().nullable(),
  creator: z.string().optional().nullable(),
  duration: z.number().optional().nullable()
});

export const listPlaylists = async (req: Request, res: Response): Promise<Response> => {
  if (!req.user?.userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const playlists = await PlaylistModel.find({ userId: req.user.userId }).sort({ updatedAt: -1 }).lean();
  const normalized = playlists.map((playlist) => ({
    ...playlist,
    playlistType: playlist.playlistType ?? playlist.items?.[0]?.mediaType ?? "music"
  }));

  return res.json({ playlists: normalized });
};

export const createPlaylist = async (req: Request, res: Response): Promise<Response> => {
  if (!req.user?.userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const parsed = createPlaylistSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid payload");
  }

  const playlist = await PlaylistModel.create({
    userId: req.user.userId,
    name: parsed.data.name,
    description: parsed.data.description,
    playlistType: parsed.data.playlistType,
    items: []
  });

  return res.status(201).json({ playlist });
};

export const addPlaylistItem = async (req: Request, res: Response): Promise<Response> => {
  if (!req.user?.userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const parsed = playlistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid payload");
  }

  const playlist = await PlaylistModel.findOne({ _id: req.params.id, userId: req.user.userId });
  if (!playlist) {
    return sendError(res, 404, "Playlist not found");
  }

  const playlistType = playlist.playlistType ?? playlist.items?.[0]?.mediaType;
  if (playlistType && playlistType !== parsed.data.mediaType) {
    return sendError(
      res,
      400,
      `Cannot add ${parsed.data.mediaType === "music" ? "song" : "video"} to a ${playlistType === "music" ? "songs" : "videos"} playlist`
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

  return res.json({ playlist });
};

export const removePlaylistItem = async (req: Request, res: Response): Promise<Response> => {
  if (!req.user?.userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const playlist = await PlaylistModel.findOne({ _id: req.params.id, userId: req.user.userId });
  if (!playlist) {
    return sendError(res, 404, "Playlist not found");
  }

  playlist.set("items", playlist.items.filter((item) => item.mediaId !== req.params.mediaId));
  await playlist.save();

  return res.json({ playlist });
};

export const deletePlaylist = async (req: Request, res: Response): Promise<Response> => {
  if (!req.user?.userId) {
    return sendError(res, 401, "Unauthorized");
  }

  await PlaylistModel.deleteOne({ _id: req.params.id, userId: req.user.userId });
  return res.status(204).send();
};

