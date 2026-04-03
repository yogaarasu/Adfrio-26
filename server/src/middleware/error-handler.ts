import type { NextFunction, Request, Response } from "express";

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  const message = error instanceof Error ? error.message : "Internal server error";
  const status = (error as { status?: number })?.status ?? 500;

  if (status >= 500) {
    console.error(error);
  }

  return res.status(status).json({ message });
};
