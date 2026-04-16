import { Router } from "express";
import {
  changePassword,
  deleteAccount,
  googleAuth,
  googleAuthCallback,
  googleAuthCode,
  googleAuthStart,
  me,
  requestOtp,
  signInWithPassword,
  signupRequestOtp,
  signupVerifyOtp,
  verifyOtp
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const authRouter = Router();

authRouter.post("/google", asyncHandler(googleAuth));
authRouter.post("/google/code", asyncHandler(googleAuthCode));
authRouter.get("/google/start", asyncHandler(googleAuthStart));
authRouter.get("/google/callback", asyncHandler(googleAuthCallback));
authRouter.post("/signup/request", asyncHandler(signupRequestOtp));
authRouter.post("/signup/verify", asyncHandler(signupVerifyOtp));
authRouter.post("/signin", asyncHandler(signInWithPassword));
authRouter.post("/otp/request", asyncHandler(requestOtp));
authRouter.post("/otp/verify", asyncHandler(verifyOtp));
authRouter.get("/me", requireAuth, asyncHandler(me));
authRouter.patch("/password", requireAuth, asyncHandler(changePassword));
authRouter.delete("/me", requireAuth, asyncHandler(deleteAccount));
