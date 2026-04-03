import { Router } from "express";
import { googleAuth, googleAuthCode, me, requestOtp, verifyOtp } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const authRouter = Router();

authRouter.post("/google", asyncHandler(googleAuth));
authRouter.post("/google/code", asyncHandler(googleAuthCode));
authRouter.post("/otp/request", asyncHandler(requestOtp));
authRouter.post("/otp/verify", asyncHandler(verifyOtp));
authRouter.get("/me", requireAuth, asyncHandler(me));
