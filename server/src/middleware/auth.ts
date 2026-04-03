import type { NextFunction, Request, Response } from "express";
import { sendError } from "../utils/http.js";
import { verifyJwt } from "../utils/jwt.js";

export const requireAuth = (req: Request, res: Response, next: NextFunction): void | Response => {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return sendError(res, 401, "Unauthorized");
  }

  try {
    req.user = verifyJwt(header.replace("Bearer ", ""));
    next();
  } catch {
    return sendError(res, 401, "Invalid token");
  }
};
