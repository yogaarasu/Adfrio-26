import { Schema, model } from "mongoose";

const otpCodeSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    purpose: { type: String, enum: ["signup", "login"], default: "login" },
    codeHash: { type: String, required: true },
    pendingName: { type: String, default: null },
    pendingPasswordHash: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpCodeModel = model("OtpCode", otpCodeSchema);

