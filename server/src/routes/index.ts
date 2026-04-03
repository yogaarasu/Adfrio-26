import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { mediaRouter } from "./media.routes.js";
import { playlistRouter } from "./playlist.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/media", mediaRouter);
apiRouter.use("/playlists", playlistRouter);
