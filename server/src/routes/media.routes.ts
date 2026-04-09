import { Router } from "express";
import {
  getHomeFeed,
  getMediaStreams,
  proxyMediaById,
  proxyMediaStream,
  searchMedia,
} from "../controllers/media.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const mediaRouter = Router();

mediaRouter.get("/home", asyncHandler(getHomeFeed));
mediaRouter.get("/search", asyncHandler(searchMedia));
mediaRouter.get("/streams/:id", asyncHandler(getMediaStreams));
mediaRouter.get("/proxy", asyncHandler(proxyMediaStream));
mediaRouter.get("/proxy/:id", asyncHandler(proxyMediaById));
