// lib/models/Ungefiltert.js
import mongoose from "mongoose";

/**
 * Collection: "ungefiltert"
 *
 * Bedeutung:
 * - Hier landen die Kanäle nach Prozess 1 (HTML → YouTube → DB)
 * - Das sind "Rohdaten / Ungefiltert" (noch nicht final bewertet)
 *
 * Hinweis:
 * - Schema ist bewusst identisch zu früher "vorgefiltert"
 */
const UngefiltertSchema = new mongoose.Schema(
  {
    youtubeId: { type: String, required: true, index: true, unique: true },
    youtubeUrl: { type: String, required: true },
    sourceFile: { type: String },

    // URLs, die für Debugging hilfreich sind
    mainUrl: { type: String },
    aboutUrl: { type: String },
    videosUrl: { type: String },

    ytAboutOk: { type: Boolean, default: false },
    ytVideosOk: { type: Boolean, default: false },

    channelInfo: {
      id: String,
      title: String,
      handle: String,
      url: String,
      description: String,
      country: String,
      keywords: [String],
      subscriberCountText: String,
    },

    videos: [
      {
        id: String,
        title: String,
        url: String,
        publishedText: String,
        viewsText: String,
        durationText: String,
        description: String,
      },
    ],

    extractedAt: { type: Date, default: Date.now },

    status: { type: String, enum: ["done", "error"], default: "done" },

    error: {
      message: String,
      when: Date,
    },
  },
  { timestamps: true }
);

export const Ungefiltert =
  mongoose.models.Ungefiltert ||
  mongoose.model("Ungefiltert", UngefiltertSchema, "ungefiltert");


