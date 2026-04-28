import type { NextFunction, Request, Response } from "express";
import { UserModel } from "../models/User.js";
import { sendError } from "../utils/http.js";
import { verifyJwt } from "../utils/jwt.js";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return sendError(res, 401, "Unauthorized");
  }

  try {
    const payload = verifyJwt(header.replace("Bearer ", ""));
    const userExists = await UserModel.exists({ _id: payload.userId });
    if (!userExists) {
      return sendError(res, 404, "User not found");
    }
    req.user = payload;
    next();
  } catch {
    return sendError(res, 401, "Invalid token");
  }
};

