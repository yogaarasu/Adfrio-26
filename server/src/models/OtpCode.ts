import { Schema, model } from "mongoose";

const otpCodeSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpCodeModel = model("OtpCode", otpCodeSchema);

