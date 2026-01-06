// lib/models/VorgefiltertCode.js
import mongoose from "mongoose";

/**
 * Collection: "vorgefiltertCode"
 *
 * Bedeutung:
 * - Hier landen NUR die Kanäle, die deine Code-Regeln bestehen.
 * - Prozess 2 schreibt hier rein.
 *
 * Warum extra Collection?
 * - Du willst eine "saubere" Menge an Kanälen, die inhaltlich deutsch sind.
 * - Später kannst du weitere Regeln hinzufügen (z.B. Themenfilter, Qualität, etc.)
 *
 * Extra-Feld: codeCheck
 * - Damit du nachvollziehen kannst, welche Regeln angewendet wurden
 * - Und warum ein Dokument gespeichert wurde
 */
const VorgefiltertCodeSchema = new mongoose.Schema(
  {
    youtubeId: { type: String, required: true, index: true, unique: true },
    youtubeUrl: { type: String, required: true },
    sourceFile: { type: String },

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

    extractedAt: { type: Date },

    // ✅ Neu: Ergebnis der Code-Prüfung
    codeCheck: {
      checkedAt: { type: Date, default: Date.now },
      passedRules: [String],
      failedReason: String,

      // Für deine Deutsch-Wortlisten-Regel:
      germanHits: { type: Number, default: 0 },
      germanWordsFound: [String],
      // ✅ NEU: BadChar-Regel
      badCharHits: { type: Number, default: 0 },
      badCharsFound: [String],
    },
  },
  { timestamps: true }
);

export const VorgefiltertCode =
  mongoose.models.VorgefiltertCode ||
  mongoose.model(
    "VorgefiltertCode",
    VorgefiltertCodeSchema,
    "vorgefiltertCode"
  );
