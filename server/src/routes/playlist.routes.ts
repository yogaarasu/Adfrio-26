import { Router } from "express";
import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  reorderPlaylistItems,
  removePlaylistItem,
  updatePlaylist
} from "../controllers/playlist.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const playlistRouter = Router();

playlistRouter.use(requireAuth);
playlistRouter.get("/", asyncHandler(listPlaylists));
playlistRouter.post("/", asyncHandler(createPlaylist));
playlistRouter.patch("/:id", asyncHandler(updatePlaylist));
playlistRouter.post("/:id/items", asyncHandler(addPlaylistItem));
playlistRouter.patch("/:id/items/reorder", asyncHandler(reorderPlaylistItems));
playlistRouter.delete("/:id/items/:mediaId", asyncHandler(removePlaylistItem));
playlistRouter.delete("/:id", asyncHandler(deletePlaylist));
