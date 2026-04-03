import { Schema, model, Types } from "mongoose";

const playlistItemSchema = new Schema(
  {
    mediaId: { type: String, required: true },
    mediaType: { type: String, enum: ["music", "video"], required: true },
    title: { type: String, required: true },
    artwork: { type: String, default: null },
    creator: { type: String, default: null },
    duration: { type: Number, default: null }
  },
  { _id: false }
);

const playlistSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    items: { type: [playlistItemSchema], default: [] }
  },
  { timestamps: true }
);

playlistSchema.index({ userId: 1, name: 1 }, { unique: true });

export const PlaylistModel = model("Playlist", playlistSchema);
export type PlaylistDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  description: string;
  items: Array<{
    mediaId: string;
    mediaType: "music" | "video";
    title: string;
    artwork: string | null;
    creator: string | null;
    duration: number | null;
  }>;
};
