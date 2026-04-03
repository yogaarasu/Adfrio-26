import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export type JwtPayload = {
  userId: string;
  email: string;
  name: string;
};

export const signJwt = (payload: JwtPayload): string => {
  const expiresIn = env.JWT_EXPIRES_IN as SignOptions["expiresIn"];
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
};

export const verifyJwt = (token: string): JwtPayload => jwt.verify(token, env.JWT_SECRET) as JwtPayload;

