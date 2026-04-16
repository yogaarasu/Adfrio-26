import axios from "axios";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { PlaylistModel } from "../models/Playlist.js";
import { UserModel } from "../models/User.js";
import { sendOtpEmail } from "../services/mailer.js";
import {
  OTP_MAX_ATTEMPTS,
  checkOtpRequestPolicy,
  deleteOtpSession,
  getOtpSession,
  incrementOtpAttempts,
  markOtpDispatch,
  storeOtpSession,
} from "../services/otp-store.js";
import { sendError } from "../utils/http.js";
import { signJwt } from "../utils/jwt.js";

const googleVerifierClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const otpRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50)
});

const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().trim().regex(/^\d{6}$/)
});

const googleCredentialSchema = z.object({
  credential: z.string().min(1)
});

const googleCodeSchema = z.object({
  code: z.string().min(1)
});

const NAME_REGEX = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/;

const signupRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .refine((value) => NAME_REGEX.test(value), "Name must contain letters only"),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(64)
    .refine(
      (value) => STRONG_PASSWORD_REGEX.test(value),
      "Password must include upper, lower, number and special character"
    ),
});

const signupVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().trim().regex(/^\d{6}$/),
});

const signinSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(64)
    .refine(
      (value) => STRONG_PASSWORD_REGEX.test(value),
      "Password must include upper, lower, number and special character"
    ),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(64),
  newPassword: z
    .string()
    .min(8)
    .max(64)
    .refine(
      (value) => STRONG_PASSWORD_REGEX.test(value),
      "Password must include upper, lower, number and special character"
    ),
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

const normalizeName = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");

const isOtpMatch = (stored: string, entered: string): boolean => {
  const storedBuffer = Buffer.from(stored, "utf-8");
  const enteredBuffer = Buffer.from(entered, "utf-8");
  if (storedBuffer.length !== enteredBuffer.length) return false;
  return timingSafeEqual(storedBuffer, enteredBuffer);
};

const resolveSmtpErrorMessage = (error: unknown): string => {
  const code = (error as { code?: string })?.code;
  if (code === "EAUTH") {
    return "SMTP authentication failed. Check SMTP_USER and SMTP_PASS.";
  }
  if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "EDNS") {
    return "Unable to reach SMTP server. Check SMTP_HOST, SMTP_PORT, and network access.";
  }
  return "Unable to send OTP email. Please try again.";
};

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
      emailVerified: true,
      lastLoginAt: new Date()
    });
    return user;
  }

  user.avatar = identity.picture ?? user.avatar;
  user.name = identity.name ?? user.name;
  user.googleSub = identity.sub ?? user.googleSub;
  user.emailVerified = true;
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
  const policy = await checkOtpRequestPolicy("login", email);
  if (!policy.allowed) {
    return sendError(res, 429, policy.message);
  }

  const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
  let mailDeliveryFailed = false;
  await storeOtpSession("login", email, otp);

  try {
    await sendOtpEmail(email, otp, {
      title: "Your Sign-In Verification Code",
      subtitle: "Use this one-time code to sign in to Adfrio.",
    });
  } catch (error) {
    console.error("[SIGNIN OTP EMAIL ERROR]", error);
    if (env.NODE_ENV === "production") {
      await deleteOtpSession("login", email);
      return sendError(res, 502, resolveSmtpErrorMessage(error));
    }
    mailDeliveryFailed = true;
    console.log(`[DEV OTP][LOGIN] ${email}: ${otp}`);
  }

  await markOtpDispatch("login", email);

  return res.json(
    mailDeliveryFailed
      ? { message: "OTP generated for local development.", devOtp: otp }
      : { message: "OTP sent" }
  );
};

export const verifyOtp = async (req: Request, res: Response): Promise<Response> => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid request payload");
  }

  const email = parsed.data.email.toLowerCase();
  const otpSession = await getOtpSession("login", email);

  if (!otpSession) {
    return sendError(res, 400, "OTP expired or not found");
  }

  if (otpSession.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtpSession("login", email);
    return sendError(res, 429, "Too many attempts, request a new OTP");
  }

  const isValid = isOtpMatch(otpSession.code, parsed.data.otp);
  if (!isValid) {
    const attempts = await incrementOtpAttempts("login", email);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await deleteOtpSession("login", email);
      return sendError(res, 429, "Too many attempts, request a new OTP");
    }
    return sendError(res, 400, "Incorrect OTP");
  }

  await deleteOtpSession("login", email);

  let user = await UserModel.findOne({ email });
  if (user?.passwordHash) {
    return sendError(res, 400, "This account uses password sign-in");
  }

  if (!user) {
    user = await UserModel.create({
      email,
      name: normalizeName(email.split("@")[0] ?? "User"),
      authProvider: "otp",
      passwordHash: null,
      emailVerified: true,
    });
  }

  user.emailVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  const token = signJwt({ userId: String(user._id), email: user.email, name: user.name });

  return res.json({ token, user: sanitizeUser(user) });
};

export const signupRequestOtp = async (req: Request, res: Response): Promise<Response> => {
  const parsed = signupRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? "Invalid request payload");
  }

  const email = parsed.data.email.toLowerCase();
  const name = normalizeName(parsed.data.name);
  const policy = await checkOtpRequestPolicy("signup", email);
  if (!policy.allowed) {
    return sendError(res, 429, policy.message);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const existing = await UserModel.findOne({ email }).lean();
  if (existing?.passwordHash && existing.emailVerified !== false) {
    return sendError(res, 409, "Account already exists. Please sign in.");
  }
  if (existing?.authProvider === "google" && !existing.passwordHash) {
    return sendError(res, 409, "Account already exists with Google sign-in.");
  }

  await UserModel.findOneAndUpdate(
    { email },
    {
      email,
      name,
      passwordHash,
      authProvider: "local",
      avatar: existing?.avatar ?? null,
      googleSub: existing?.googleSub ?? null,
      emailVerified: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
  let mailDeliveryFailed = false;
  await storeOtpSession("signup", email, otp);

  try {
    await sendOtpEmail(email, otp, {
      title: "Verify Your Sign-Up",
      subtitle: "Confirm your Adfrio account with this one-time verification code.",
    });
  } catch (error) {
    console.error("[SIGNUP OTP EMAIL ERROR]", error);
    if (env.NODE_ENV === "production") {
      await deleteOtpSession("signup", email);
      await UserModel.deleteOne({ email, emailVerified: false });
      return sendError(res, 502, resolveSmtpErrorMessage(error));
    }
    mailDeliveryFailed = true;
    console.log(`[DEV OTP][SIGNUP] ${email}: ${otp}`);
  }

  await markOtpDispatch("signup", email);

  return res.json(
    mailDeliveryFailed
      ? { message: "Verification OTP generated for local development.", devOtp: otp }
      : { message: "Verification OTP sent" }
  );
};

export const signupVerifyOtp = async (req: Request, res: Response): Promise<Response> => {
  const parsed = signupVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid request payload");
  }

  const email = parsed.data.email.toLowerCase();
  const otpSession = await getOtpSession("signup", email);

  if (!otpSession) {
    return sendError(res, 400, "OTP expired or not found");
  }

  if (otpSession.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtpSession("signup", email);
    return sendError(res, 429, "Too many attempts, request a new OTP");
  }

  const isValid = isOtpMatch(otpSession.code, parsed.data.otp);
  if (!isValid) {
    const attempts = await incrementOtpAttempts("signup", email);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await deleteOtpSession("signup", email);
      return sendError(res, 429, "Too many attempts, request a new OTP");
    }
    return sendError(res, 400, "Incorrect OTP");
  }

  let user = await UserModel.findOne({ email });
  if (!user) {
    await deleteOtpSession("signup", email);
    return sendError(res, 400, "Sign-up session expired. Please request a new code.");
  }
  if (!user.passwordHash) {
    await deleteOtpSession("signup", email);
    return sendError(res, 400, "Password setup missing. Please sign up again.");
  }
  if (user.emailVerified === true) {
    await deleteOtpSession("signup", email);
    return sendError(res, 409, "Account already exists. Please sign in.");
  }

  user.authProvider = "local";
  user.emailVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  await deleteOtpSession("signup", email);

  const token = signJwt({ userId: String(user._id), email: user.email, name: user.name });
  return res.json({ token, user: sanitizeUser(user) });
};

export const signInWithPassword = async (req: Request, res: Response): Promise<Response> => {
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Invalid request payload");
  }

  const email = parsed.data.email.toLowerCase();
  const user = await UserModel.findOne({ email });
  const passwordHash = user?.passwordHash ?? null;
  if (!user || !passwordHash) {
    return sendError(res, 401, "Invalid email or password");
  }
  if (!user.emailVerified) {
    return sendError(res, 403, "Please verify your email OTP before signing in.");
  }

  const isValid = await bcrypt.compare(parsed.data.password, passwordHash);
  if (!isValid) {
    return sendError(res, 401, "Invalid email or password");
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

export const changePassword = async (req: Request, res: Response): Promise<Response> => {
  if (!req.user?.userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, parsed.error.issues[0]?.message ?? "Invalid request payload");
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return sendError(res, 400, "New password must be different from current password");
  }

  const user = await UserModel.findById(req.user.userId);
  if (!user) {
    return sendError(res, 404, "User not found");
  }

  if (!user.passwordHash) {
    return sendError(res, 400, "Password change is available only for password accounts");
  }

  const validCurrentPassword = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!validCurrentPassword) {
    return sendError(res, 401, "Current password is incorrect");
  }

  user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await user.save();

  return res.json({ message: "Password updated successfully" });
};

export const deleteAccount = async (req: Request, res: Response): Promise<Response> => {
  if (!req.user?.userId) {
    return sendError(res, 401, "Unauthorized");
  }

  const existingUser = await UserModel.exists({ _id: req.user.userId });
  if (!existingUser) {
    return sendError(res, 404, "User not found");
  }

  await Promise.all([
    PlaylistModel.deleteMany({ userId: req.user.userId }),
    UserModel.deleteOne({ _id: req.user.userId })
  ]);

  return res.json({ message: "Account deleted successfully" });
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
