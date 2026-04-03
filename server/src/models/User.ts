import { Schema, model, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true },
    avatar: { type: String, default: null },
    authProvider: { type: String, enum: ["google", "otp"], required: true },
    googleSub: { type: String, default: null },
    lastLoginAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type User = InferSchemaType<typeof userSchema> & { _id: string };
export const UserModel = model("User", userSchema);
