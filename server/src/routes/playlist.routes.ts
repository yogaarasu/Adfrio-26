import { Router } from "express";
import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  removePlaylistItem
} from "../controllers/playlist.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const playlistRouter = Router();

playlistRouter.use(requireAuth);
playlistRouter.get("/", asyncHandler(listPlaylists));
playlistRouter.post("/", asyncHandler(createPlaylist));
playlistRouter.post("/:id/items", asyncHandler(addPlaylistItem));
playlistRouter.delete("/:id/items/:mediaId", asyncHandler(removePlaylistItem));
playlistRouter.delete("/:id", asyncHandler(deletePlaylist));
