import { Redis } from "@upstash/redis";
import { env } from "../config/env.js";

export type OtpPurpose = "signup" | "login";

export type OtpSessionRecord = {
  code: string;
  attempts: number;
};

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_DAILY_LIMIT = 10;
export const OTP_MAX_ATTEMPTS = 5;

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const otpKey = (purpose: OtpPurpose, email: string): string =>
  `otp:session:${purpose}:${normalizeEmail(email)}`;

const cooldownKey = (purpose: OtpPurpose, email: string): string =>
  `otp:cooldown:${purpose}:${normalizeEmail(email)}`;

const dailyBucket = (): string => new Date().toISOString().slice(0, 10);

const dailyLimitKey = (purpose: OtpPurpose, email: string): string =>
  `otp:daily:${dailyBucket()}:${purpose}:${normalizeEmail(email)}`;

const secondsUntilTomorrowUtc = (): number => {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1, Math.ceil((tomorrow.getTime() - now.getTime()) / 1000));
};

export const checkOtpRequestPolicy = async (
  purpose: OtpPurpose,
  email: string
): Promise<{ allowed: true } | { allowed: false; message: string }> => {
  const inCooldown = await redis.exists(cooldownKey(purpose, email));
  if (inCooldown) {
    return {
      allowed: false,
      message: "Please wait 1 minute before requesting another OTP.",
    };
  }

  const dailyCountRaw = await redis.get<number | string | null>(dailyLimitKey(purpose, email));
  const dailyCount = Number(dailyCountRaw ?? 0);
  if (dailyCount >= OTP_DAILY_LIMIT) {
    return {
      allowed: false,
      message: "Daily OTP limit reached (10/day). Please try again tomorrow.",
    };
  }

  return { allowed: true };
};

export const storeOtpSession = async (
  purpose: OtpPurpose,
  email: string,
  code: string
): Promise<void> => {
  const key = otpKey(purpose, email);
  await redis.hset(key, {
    code,
    attempts: 0
  });
  await redis.expire(key, OTP_TTL_SECONDS);
};

export const getOtpSession = async (
  purpose: OtpPurpose,
  email: string
): Promise<OtpSessionRecord | null> => {
  const key = otpKey(purpose, email);
  const session = await redis.hgetall<{ code?: string | number; attempts?: number | string }>(key);
  if (session?.code === undefined || session.code === null) return null;

  return {
    code: String(session.code),
    attempts: Number(session.attempts ?? 0),
  };
};

export const deleteOtpSession = async (purpose: OtpPurpose, email: string): Promise<void> => {
  await redis.del(otpKey(purpose, email));
};

export const incrementOtpAttempts = async (
  purpose: OtpPurpose,
  email: string,
): Promise<number> => {
  const key = otpKey(purpose, email);
  const ttl = await redis.ttl(key);
  if (ttl <= 0) {
    await redis.del(key);
    return OTP_MAX_ATTEMPTS;
  }
  const nextAttempts = await redis.hincrby(key, "attempts", 1);
  return Number(nextAttempts);
};

export const markOtpDispatch = async (purpose: OtpPurpose, email: string): Promise<void> => {
  await redis.set(cooldownKey(purpose, email), "1", { ex: OTP_COOLDOWN_SECONDS });

  const dailyKey = dailyLimitKey(purpose, email);
  const current = await redis.incr(dailyKey);
  if (current === 1) {
    await redis.expire(dailyKey, secondsUntilTomorrowUtc());
  }
};
