import type { Response } from "express";

export const sendError = (res: Response, status: number, message: string): Response =>
  res.status(status).json({ message });
