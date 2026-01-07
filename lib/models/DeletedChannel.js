// lib/models/DeletedChannel.js (ESM)
//
// Collection: deletedChannels
// Zweck:
// - Speichert Kanäle, die in Prozess 2 (vorgefiltert -> vorgefiltertCode)
//   rausgefiltert wurden.
// - Damit du später nachvollziehen kannst: WARUM wurde er rausgeworfen?
//
// Design-Entscheidungen:
// - youtubeId ist unser "stabiler Schlüssel" (wenn vorhanden).
// - Upsert: pro youtubeId ein Dokument (keine Duplikate).
// - rejectedCount zählt, wie oft der Kanal bereits rausgeflogen ist.
// - lastRejectedAt / lastJobId helfen beim Debugging.
// - checks enthält strukturierte Details der Checks (Matches, Thresholds etc.)
//
// Hinweis:
// - timestamps: true erzeugt createdAt / updatedAt automatisch.

import mongoose from "mongoose";

const DeletedChannelSchema = new mongoose.Schema(
  {
    youtubeId: { type: String, index: true },
    youtubeUrl: { type: String, default: null },
    sourceFile: { type: String, default: null },

    // Woher kommt dieser Reject?
    stage: { type: String, default: "vorgefiltert->vorgefiltertCode" },

    // Welche Regel hat abgelehnt?
    // Beispiele: "country", "badChars", "germanWords", "kidsHard", "unknown"
    failedRule: { type: String, default: "unknown", index: true },

    // Menschlich lesbare Begründung
    reason: { type: String, default: "" },

    // Strukturierte Infos zu den Checks (damit du später UI/Debug machen kannst)
    checks: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Ein bisschen Kanal-Daten, damit man nicht immer zurück in vorgefiltert muss
    channelInfo: { type: mongoose.Schema.Types.Mixed, default: null },

    // Optional: Videos (kann groß werden, aber bei dir sind es max 30)
    videos: { type: [mongoose.Schema.Types.Mixed], default: [] },

    // Metadaten
    firstRejectedAt: { type: Date, default: null },
    lastRejectedAt: { type: Date, default: null },
    lastJobId: { type: String, default: null },
    rejectedCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "deletedChannels" }
);

// Optional: unique index auf youtubeId, falls du streng erzwingen willst.
// Achtung: youtubeId kann bei manchen Docs null sein – dann würde unique Probleme machen.
// Wenn du sicher bist, dass youtubeId immer existiert in vorgefiltert, kannst du es aktivieren.
// DeletedChannelSchema.index({ youtubeId: 1 }, { unique: true, sparse: true });

export const DeletedChannel =
  mongoose.models.DeletedChannel ||
  mongoose.model("DeletedChannel", DeletedChannelSchema);
