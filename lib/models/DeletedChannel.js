// lib/models/DeletedChannel.js (ESM)
// Collection: deletedChannels

import mongoose from "mongoose";

const DeletedChannelSchema = new mongoose.Schema(
  {
    youtubeId: { type: String, required: true, unique: true, index: true },

    youtubeUrl: { type: String, default: null },
    sourceFile: { type: String, default: null },

    mainUrl: { type: String, default: null },
    aboutUrl: { type: String, default: null },
    videosUrl: { type: String, default: null },

    channelInfo: { type: mongoose.Schema.Types.Mixed, default: null },

    // ✅ NEU: Videos speichern
    videos: { type: [mongoose.Schema.Types.Mixed], default: [] },

    extractedAt: { type: Date, default: null },

    // Warum wurde er rausgefiltert?
    lastReason: { type: String, default: "" },

    // Details zur Regel (BadChars, DeutschWords, Kids etc.)
    lastDetails: { type: mongoose.Schema.Types.Mixed, default: null },

    // wie oft rausgeflogen
    timesSkipped: { type: Number, default: 0 },

    // welcher Job zuletzt
    lastJobId: { type: String, default: null },
  },
  {
    collection: "deletedChannels",
    timestamps: true,
  }
);

export const DeletedChannel =
  mongoose.models.DeletedChannel ||
  mongoose.model("DeletedChannel", DeletedChannelSchema);
