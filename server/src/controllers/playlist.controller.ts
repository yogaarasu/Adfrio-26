import type { Request, Response } from "express";
import { z } from "zod";
import { PlaylistModel } from "../models/Playlist.js";
import { sendError } from "../utils/http.js";

const createPlaylistSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).default("")
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
  return res.json({ playlists });
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

  const exists = playlist.items.some((item) => item.mediaId === parsed.data.mediaId);
  if (!exists) {
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

