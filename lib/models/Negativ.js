// lib/models/Negativ.js (ESM)
// Collection: negativ

import mongoose from "mongoose";

const NegativSchema = new mongoose.Schema(
  {
    youtubeId: { type: String, required: true, unique: true, index: true },

    youtubeUrl: { type: String, default: null },
    sourceFile: { type: String, default: null },

    // Kanal (Top-level, damit Mongo/Compass/Collections es sofort zeigt)
    channelTitle: { type: String, default: "" },

    // KI Ergebnis (Top-level, damit es in Collections schnell sichtbar ist)
    aiFinalDecision: { type: String, default: null }, // "positiv" | "negativ"
    aiFinalReason: { type: String, default: "" }, // kurzer Hauptgrund
    aiFinalEvidence: { type: [mongoose.Schema.Types.Mixed], default: [] }, // 1–5 Belegstellen

    // Top-level Felder (damit Collections-UI sie direkt anzeigen kann)
    ytAboutOk: { type: Boolean, default: null },
    ytVideosOk: { type: Boolean, default: null },
    status: { type: String, default: null },
    extractedAt: { type: Date, default: null },

    channelInfo: { type: mongoose.Schema.Types.Mixed, default: null },
    videos: { type: [mongoose.Schema.Types.Mixed], default: [] },
    codeCheck: { type: mongoose.Schema.Types.Mixed, default: null },

    // Snapshot der Kanal-Daten (inkl. channelInfo, videos, codeCheck, usw.)
    channelDoc: { type: mongoose.Schema.Types.Mixed, default: null },

    // KI-Entscheidung + Audit (flexibel, damit 1–3 Modell-Votes + Mehrheit reinpasst)
    aiCheck: { type: mongoose.Schema.Types.Mixed, default: null },

    timesChecked: { type: Number, default: 0 },
    lastJobId: { type: String, default: null },
  },
  {
    collection: "negativ",
    timestamps: true,
  }
);

export const Negativ =
  mongoose.models.Negativ || mongoose.model("Negativ", NegativSchema);
