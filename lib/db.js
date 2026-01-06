// lib/db.js (ESM)
// Verbindung zu MongoDB über mongoose

import mongoose from "mongoose";

// Merker: nicht jedes Mal neu verbinden
let connected = false;

export async function connectDb() {
  if (connected) return;

  // Standard: lokale MongoDB
  // Du kannst das über eine Umgebungsvariable überschreiben (MONGO_URI).
  const uri =
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/youtubeChannelCheck";

  // Optional: kleine Einstellungen (nicht super wichtig)
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // wenn Mongo nicht läuft -> nach 5s Fehler
    });

    connected = true;

    console.log("✅ MongoDB verbunden:", uri);
  } catch (err) {
    connected = false;
    console.error("❌ MongoDB Verbindung fehlgeschlagen:", err.message);
    throw err;
  }
}

export { mongoose };
