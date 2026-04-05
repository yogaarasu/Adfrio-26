import axios from "axios";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { OtpCodeModel } from "../models/OtpCode.js";
import { UserModel } from "../models/User.js";
import { sendOtpEmail } from "../services/mailer.js";
import { sendError } from "../utils/http.js";
import { signJwt } from "../utils/jwt.js";

const googleVerifierClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const otpRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50)
});

const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6)
});

const googleCredentialSchema = z.object({
  credential: z.string().min(1)
});

const googleCodeSchema = z.object({
  code: z.string().min(1)
});

type GoogleIdentity = {
  email: string;
  name?: string | null;
  picture?: string | null;
  sub?: string | null;
};

const sanitizeUser = (user: { _id: unknown; email: string; name: string; avatar?: string | null }) => ({
  id: String(user._id),
  email: user.email,
  name: user.name,
  avatar: user.avatar ?? null
});

const buildApiBaseUrl = (req: Request): string => {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol ?? "http";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ??
    req.headers.host ??
    `localhost:${env.PORT}`;
  return `${proto}://${host}/api`;
};

const buildClientRedirect = (params?: Record<string, string>): string => {
  const url = new URL("/profile", env.CLIENT_URL);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (!value) return;
    url.searchParams.set(key, value);
  });
  return url.toString();
};

const resolveGoogleRedirectUri = (req: Request): string => {
  if (env.GOOGLE_REDIRECT_URI && env.GOOGLE_REDIRECT_URI.startsWith("http")) {
    return env.GOOGLE_REDIRECT_URI;
  }
  return `${buildApiBaseUrl(req)}/auth/google/callback`;
};

const upsertGoogleUser = async (identity: GoogleIdentity) => {
  const email = identity.email.toLowerCase();
  let user = await UserModel.findOne({ email });

  if (!user) {
    user = await UserModel.create({
      email,
      name: identity.name ?? email.split("@")[0],
      avatar: identity.picture ?? null,
      authProvider: "google",
      googleSub: identity.sub ?? null,
      lastLoginAt: new Date()
    });
    return user;
  }

  user.avatar = identity.picture ?? user.avatar;
  user.name = identity.name ?? user.name;
  user.googleSub = identity.sub ?? user.googleSub;
  user.lastLoginAt = new Date();
  await user.save();
  return user;
};

export const requestOtp = async (req: Request, res: Response): Promise<Response> => {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid request payload");
  }

  const email = parsed.data.email.toLowerCase();
  const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
  const codeHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OtpCodeModel.findOneAndUpdate(
    { email },
    { codeHash, expiresAt, attempts: 0 },
    { upsert: true, new: true }
  );

  await sendOtpEmail(email, otp);

  return res.json({ message: "OTP sent" });
};

export const verifyOtp = async (req: Request, res: Response): Promise<Response> => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid request payload");
  }

  const email = parsed.data.email.toLowerCase();
  const otpDoc = await OtpCodeModel.findOne({ email });

  if (!otpDoc || otpDoc.expiresAt.getTime() < Date.now()) {
    return sendError(res, 400, "OTP expired or not found");
  }

  if (otpDoc.attempts >= 5) {
    return sendError(res, 429, "Too many attempts, request a new OTP");
  }

  const isValid = await bcrypt.compare(parsed.data.otp, otpDoc.codeHash);
  if (!isValid) {
    otpDoc.attempts += 1;
    await otpDoc.save();
    return sendError(res, 400, "Incorrect OTP");
  }

  await OtpCodeModel.deleteOne({ email });

  let user = await UserModel.findOne({ email });
  if (!user) {
    user = await UserModel.create({
      email,
      name: email.split("@")[0],
      authProvider: "otp"
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signJwt({ userId: String(user._id), email: user.email, name: user.name });

  return res.json({ token, user: sanitizeUser(user) });
};

export const googleAuth = async (req: Request, res: Response): Promise<Response> => {
  const parsed = googleCredentialSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid request payload");
  }

  try {
    const ticket = await googleVerifierClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      return sendError(res, 400, "Invalid Google token");
    }

    const user = await upsertGoogleUser({
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      sub: payload.sub
    });

    const token = signJwt({ userId: String(user._id), email: user.email, name: user.name });
    return res.json({ token, user: sanitizeUser(user) });
  } catch {
    return sendError(res, 400, "Google sign-in verification failed");
  }
};

export const googleAuthCode = async (req: Request, res: Response): Promise<Response> => {
  const parsed = googleCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid request payload");
  }

  if (!env.GOOGLE_CLIENT_SECRET) {
    return sendError(res, 500, "GOOGLE_CLIENT_SECRET is not configured");
  }

  const oauthClient = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );

  let tokens: {
    access_token?: string | null;
    id_token?: string | null;
  };

  try {
    const tokenResponse = await oauthClient.getToken({
      code: parsed.data.code,
      redirect_uri: env.GOOGLE_REDIRECT_URI
    });
    tokens = tokenResponse.tokens;
  } catch {
    return sendError(res, 400, "Invalid or expired Google authorization code");
  }

  let identity: GoogleIdentity | null = null;

  if (tokens.id_token) {
    try {
      const idTicket = await googleVerifierClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: env.GOOGLE_CLIENT_ID
      });

      const payload = idTicket.getPayload();
      if (payload?.email) {
        identity = {
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
          sub: payload.sub
        };
      }
    } catch {
      identity = null;
    }
  }

  if (!identity && tokens.access_token) {
    try {
      const { data } = await axios.get<{
        email?: string;
        name?: string;
        picture?: string;
        sub?: string;
      }>("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });

      if (data.email) {
        identity = {
          email: data.email,
          name: data.name,
          picture: data.picture,
          sub: data.sub
        };
      }
    } catch {
      identity = null;
    }
  }

  if (!identity?.email) {
    return sendError(res, 400, "Unable to read Google user profile");
  }

  const user = await upsertGoogleUser(identity);
  const token = signJwt({ userId: String(user._id), email: user.email, name: user.name });

  return res.json({ token, user: sanitizeUser(user) });
};

export const googleAuthStart = async (req: Request, res: Response): Promise<Response | void> => {
  if (!env.GOOGLE_CLIENT_SECRET) {
    return sendError(res, 500, "GOOGLE_CLIENT_SECRET is not configured");
  }

  const redirectUri = resolveGoogleRedirectUri(req);
  const oauthClient = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);

  const returnToRaw = typeof req.query.returnTo === "string" ? req.query.returnTo : "/profile";
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/profile";
  const state = Buffer.from(JSON.stringify({ returnTo }), "utf-8").toString("base64url");

  const authUrl = oauthClient.generateAuthUrl({
    access_type: "online",
    include_granted_scopes: true,
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state
  });

  res.redirect(authUrl);
  return;
};

export const googleAuthCallback = async (req: Request, res: Response): Promise<Response | void> => {
  if (!env.GOOGLE_CLIENT_SECRET) {
    res.redirect(buildClientRedirect({ auth_error: "Google OAuth is not configured" }));
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    res.redirect(buildClientRedirect({ auth_error: "Missing Google authorization code" }));
    return;
  }

  const redirectUri = resolveGoogleRedirectUri(req);
  const oauthClient = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);

  let tokens: {
    access_token?: string | null;
    id_token?: string | null;
  };

  try {
    const tokenResponse = await oauthClient.getToken({ code, redirect_uri: redirectUri });
    tokens = tokenResponse.tokens;
  } catch {
    res.redirect(buildClientRedirect({ auth_error: "Invalid or expired Google authorization code" }));
    return;
  }

  let identity: GoogleIdentity | null = null;

  if (tokens.id_token) {
    try {
      const idTicket = await googleVerifierClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: env.GOOGLE_CLIENT_ID
      });

      const payload = idTicket.getPayload();
      if (payload?.email) {
        identity = {
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
          sub: payload.sub
        };
      }
    } catch {
      identity = null;
    }
  }

  if (!identity && tokens.access_token) {
    try {
      const { data } = await axios.get<{
        email?: string;
        name?: string;
        picture?: string;
        sub?: string;
      }>("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });

      if (data.email) {
        identity = {
          email: data.email,
          name: data.name,
          picture: data.picture,
          sub: data.sub
        };
      }
    } catch {
      identity = null;
    }
  }

  if (!identity?.email) {
    res.redirect(buildClientRedirect({ auth_error: "Unable to read Google user profile" }));
    return;
  }

  const user = await upsertGoogleUser(identity);
  const token = signJwt({ userId: String(user._id), email: user.email, name: user.name });

  const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
  let returnTo = "/profile";
  if (stateRaw) {
    try {
      const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8")) as { returnTo?: string };
      if (parsed.returnTo && parsed.returnTo.startsWith("/")) {
        returnTo = parsed.returnTo;
      }
    } catch {
      returnTo = "/profile";
    }
  }

  const redirectUrl = new URL(returnTo, env.CLIENT_URL);
  redirectUrl.searchParams.set("token", token);
  redirectUrl.searchParams.set("oauth", "google");

  res.redirect(redirectUrl.toString());
  return;
};

export const me = async (req: Request, res: Response): Promise<Response> => {
  if (!req.user?.userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const user = await UserModel.findById(req.user.userId).lean();
  if (!user) {
    return sendError(res, 404, "User not found");
  }

  return res.json({ user: sanitizeUser(user as { _id: unknown; email: string; name: string; avatar: string | null }) });
};
