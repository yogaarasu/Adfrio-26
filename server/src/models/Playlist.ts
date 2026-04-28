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
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, default: "" },
    playlistType: { type: String, enum: ["music", "video"], default: "music" },
    items: { type: [playlistItemSchema], default: [] }
  },
  { timestamps: true }
);

playlistSchema.pre("validate", function normalizePlaylistName(next) {
  const currentName = typeof this.name === "string" ? this.name.trim() : "";
  this.name = currentName;
  this.normalizedName = currentName.toLowerCase();
  next();
});

playlistSchema.index({ userId: 1, normalizedName: 1 }, { unique: true });

export const PlaylistModel = model("Playlist", playlistSchema, "playlists");
export type PlaylistDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  normalizedName: string;
  description: string;
  playlistType: "music" | "video";
  items: Array<{
    mediaId: string;
    mediaType: "music" | "video";
    title: string;
    artwork: string | null;
    creator: string | null;
    duration: number | null;
  }>;
};
