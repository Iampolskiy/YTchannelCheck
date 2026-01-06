/**
 * server.js (ESM)
 * ==========================
 *
 * Dieses Backend hat jetzt ZWEI Prozesse:
 *
 * Prozess 1: SocialBlade HTML → YouTube /about + /videos → MongoDB "vorgefiltert"
 *   - Route: POST /process/sb-html-to-db
 *
 * Prozess 2: MongoDB "vorgefiltert" → Regeln prüfen → MongoDB "vorgefiltertCode"
 *   - Route: POST /process/vorgefiltert-to-vorgefiltertCode
 *
 * Warum Prozess 2?
 * - Du willst nach dem Sammeln der Daten eine zweite, reine "Code-Prüfung"
 *   (ohne neue YouTube-Requests), um nur "deutsche Kanäle" weiterzuleiten.
 *
 * Regeln für Prozess 2 (aktuell):
 * 1) channelInfo.country muss "Deutschland" sein (case-insensitive)
 * 2) Textprüfung: In channelInfo.title, channelInfo.description und videos[].title
 *    müssen mindestens 5 verschiedene Wörter aus deutschArray vorkommen.
 *
 * Hinweis:
 * - Später kannst du weitere Regeln hinzufügen.
 * - Wir speichern Metadaten unter doc.codeCheck, damit du siehst: warum drin / warum raus.
 */

import express from "express";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";

import { createSafeFetcher, CaptchaDetectedError } from "./lib/safeFetch.js";
import {
  extractYtInitialData,
  extractChannelInfoFromYtInitialData,
  extractVideosFromYtVideosInitialData,
} from "./lib/youtubeInitialData.js";

import { connectDb } from "./lib/db.js";
import { Vorgefiltert } from "./lib/models/Vorgefiltert.js";
import { VorgefiltertCode } from "./lib/models/VorgefiltertCode.js";

import { DEUTSCH_WORDS_ARRAY } from "./lib/config/deutschArray.js";
import { NON_GERMAN_UNICODE_CHARS } from "./lib/config/charArray.js";

// ---------------------------------------------------------------------------
// __dirname Ersatz (weil ESM)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------
const DEFAULT_INPUT_DIR = path.join(__dirname, "input");

// Standard-Optionen für Internet-Anfragen (Fetch).
const DEFAULT_FETCH_OPTIONS = {
  minIntervalMs: 1500,
  jitterMs: 600,
  maxRetries: 6,
  timeoutMs: 25_000,
  concurrency: 1,
};

// Wartezeit zwischen Tabs (/about -> /videos).
const SWITCH_TAB_MIN_MS_DEFAULT = 15_000;
const SWITCH_TAB_MAX_MS_DEFAULT = 25_000;

// Wartezeit zwischen Kanälen
const BETWEEN_CH_MIN_MS_DEFAULT = 15_000;
const BETWEEN_CH_MAX_MS_DEFAULT = 25_000;

// Optionale künstliche "KI Simulation" (macht nur Pause)
const AI_SIM_MIN_MS_DEFAULT = 35_000;
const AI_SIM_MAX_MS_DEFAULT = 75_000;

// Wie viele Videos pro Kanal speichern
const VIDEOS_LIMIT_DEFAULT = 30;

/**
 * Default Schwelle:
 * Wenn mehr als 5 Treffer → raus
 */
const DEFAULT_MAX_BAD_CHAR_HITS = 5;

// Deutsch-Wortliste (Default). Du kannst sie per Request überschreiben.

// ---------------------------------------------------------------------------
// Express Setup
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------------
// Hilfsfunktionen (Zeit, Schlafen, Zufall)
// ---------------------------------------------------------------------------
function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function debug(jobId, label, obj) {
  console.log(`[DEBUG][job=${jobId}] ${label}:`, JSON.stringify(obj, null, 2));
}

function pickRandomInt(min, max) {
  const a = Math.max(0, Math.floor(min));
  const b = Math.max(a, Math.floor(max));
  return a + Math.floor(Math.random() * (b - a + 1));
}

function normalizeYoutubeUrl(url) {
  // Entfernt am Ende überflüssige "/" damit URLs vergleichbar werden
  const u = String(url || "").trim();
  if (!u) return null;
  return u.replace(/\/+$/, "");
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Wenn Ordner existiert: kein Fehler.
  }
}
await ensureDir(DEFAULT_INPUT_DIR);

// ---------------------------------------------------------------------------
// Deutsch-Check Helfer (Prozess 2)
// ---------------------------------------------------------------------------

/**
 * Tokenizer: Wandelt Text in ein Set einzelner "Wörter" um.
 * - lowercase
 * - trennt an allem, was kein Buchstabe/Zahl ist
 *
 * Hinweis:
 * - Das ist eine einfache, robuste Methode.
 * - Für mehr Genauigkeit könnte man später Stemming/Stopwords machen.
 */
function tokenizeText(text) {
  const t = String(text || "").toLowerCase();

  // Unicode-freundlich: Buchstaben/Zahlen bleiben, Rest trennt.
  const parts = t.split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
  return new Set(parts);
}

/**
 * Baut aus einem vorgefiltert-Dokument den gesamten "Text-Content":
 * - channelInfo.title
 * - channelInfo.description
 * - alle videos[].title
 */
function buildChannelContentText(doc) {
  const title = doc?.channelInfo?.title || "";
  const desc = doc?.channelInfo?.description || "";

  const videoTitles = Array.isArray(doc?.videos)
    ? doc.videos.map((v) => v?.title || "").join(" ")
    : "";

  return `${title}\n${desc}\n${videoTitles}`.trim();
}

/**
 * Regel 2: Wortlisten-Check:
 * "Mindestens X verschiedene Wörter aus deutschArray müssen vorkommen"
 *
 * Rückgabe:
 * - ok: true/false
 * - hitsCount: Anzahl verschiedener Treffer
 * - hitsWords: welche Wörter gefunden wurden (für Debug/Transparenz)
 */
function germanWordListCheck(doc, deutschArray, minDistinctHits = 5) {
  const content = buildChannelContentText(doc);
  const tokens = tokenizeText(content);

  const list = Array.isArray(deutschArray) ? deutschArray : [];
  const deutschSet = new Set(
    list.map((w) => String(w || "").toLowerCase()).filter(Boolean)
  );

  const found = [];
  for (const w of deutschSet) {
    if (tokens.has(w)) found.push(w);
  }

  return {
    ok: found.length >= minDistinctHits,
    hitsCount: found.length,
    hitsWords: found.slice(0, 50), // cap fürs Logging/DB
  };
}
/**
 * Regel 3: Bad-Character-Check
 * ----------------------------
 * Zählt, wie oft Zeichen aus badCharArray im gesamten Content vorkommen.
 * Wenn Treffer > maxHits → ok=false (also Kanal verwerfen).
 *
 * Rückgabe:
 * - ok: boolean
 * - hitsCount: Anzahl Treffer (Occurrences)
 * - foundCharsDistinct: welche "verschiedenen" Zeichen gefunden wurden (nur Debug)
 */
function badCharCheck(doc, badCharArray, maxHits = 5) {
  const list = Array.isArray(badCharArray) ? badCharArray : [];
  const badSet = new Set(list.map((c) => String(c || "")).filter(Boolean));

  // Wenn keine Bad-Chars definiert: Regel ist automatisch bestanden
  if (badSet.size === 0) {
    return { ok: true, hitsCount: 0, foundCharsDistinct: [] };
  }

  const content = buildChannelContentText(doc);
  let hits = 0;
  const foundDistinct = new Set();

  // for..of läuft unicode-sicher über Zeichen (Codepoints)
  for (const ch of content) {
    if (badSet.has(ch)) {
      hits++;
      foundDistinct.add(ch);

      // Früh abbrechen, wenn ohnehin schon zu viele Treffer
      if (hits > maxHits) {
        return {
          ok: false,
          hitsCount: hits,
          foundCharsDistinct: Array.from(foundDistinct).slice(0, 50),
        };
      }
    }
  }

  return {
    ok: true,
    hitsCount: hits,
    foundCharsDistinct: Array.from(foundDistinct).slice(0, 50),
  };
}

/**
 * Regel 1: Country muss "Deutschland" sein.
 * - trim
 * - case-insensitive
 */
function isCountryDeutschland(doc) {
  const c = String(doc?.channelInfo?.country || "")
    .trim()
    .toLowerCase();
  const allowed = new Set(["deutschland", "germany", "de", "deutsch"]);
  if (allowed.has(c)) return true;

  // falls sowas wie "Deutschland (DE)" kommt
  if (c.includes("deutschland")) return true;
  if (c.includes("germany")) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Upload Route (speichert HTML nach ./input)
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DEFAULT_INPUT_DIR),
  filename: (req, file, cb) => {
    const safeName = String(file.originalname || "upload.html")
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 120);
    cb(null, `${Date.now()}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    if (name.endsWith(".html") || name.endsWith(".htm")) return cb(null, true);
    cb(new Error("Nur .html oder .htm erlaubt"));
  },
});

app.post("/upload/option1", upload.array("files", 200), async (req, res) => {
  try {
    const files = req.files || [];
    res.json({
      ok: true,
      savedCount: files.length,
      files: files.map((f) => ({
        original: f.originalname,
        savedAs: f.filename,
        size: f.size,
      })),
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// ---------------------------------------------------------------------------
// Job Speicher im Arbeitsspeicher
// - Wir nutzen für beide Prozesse die gleiche Job-Struktur + SSE
// ---------------------------------------------------------------------------
const jobs = new Map();
const jobEventClients = new Map();

function createJob({ options }) {
  const jobId = randomUUID();

  const job = {
    jobId,
    status: "running", // running | done | failed | captcha
    createdAt: nowIso(),
    finishedAt: null,
    options: options || {},

    // progress wird von beiden Prozessen genutzt.
    // Prozess 1 nutzt channelsTotal/channelsDone
    // Prozess 2 nutzt die gleichen Felder ebenfalls (scanned als channelsDone)
    progress: {
      // Prozess 1
      htmlFilesFound: 0,
      htmlFilesParsed: 0,
      channelsTotal: 0,
      channelsDone: 0,
      channelsSkippedDuplicate: 0,
      ytAboutOk: 0,
      ytAboutFailed: 0,
      ytVideosOk: 0,
      ytVideosFailed: 0,
      aiDone: 0,

      // Prozess 2 (werden dynamisch ergänzt)
      scanned: 0,
      passedCountry: 0,
      passedLanguage: 0,
      saved: 0,
      skippedNotDeutschland: 0,
      skippedNotGerman: 0,
      errors: 0,
    },

    seenChannelKeys: new Set(),
    seenFinalYoutubeIds: new Set(),

    channels: [],
    enriched: [],

    captcha: null,
    error: null,

    logs: [],
    lastSnapshot: null,
  };

  jobs.set(jobId, job);
  return job;
}

// ---------------------------------------------------------------------------
// Server-Sent Events Hilfen
// ---------------------------------------------------------------------------
function sseSend(res, eventName, dataObj) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
}

function emitLog(jobId, level, message, extra = null) {
  const job = jobs.get(jobId);
  if (!job) return;

  const lvl = level === "error" ? "err" : level === "warning" ? "warn" : level;

  const log = {
    t: nowIso(),
    level: lvl,
    message,
    extra: extra ?? undefined,
  };

  job.logs.push(log);
  if (job.logs.length > 5000) job.logs.shift();

  const clients = jobEventClients.get(jobId);
  if (clients && clients.size) {
    for (const res of clients) {
      try {
        sseSend(res, "log", log);
      } catch {
        clients.delete(res);
      }
    }
  }
}

/**
 * Snapshot ist die "Statusanzeige" im Frontend.
 * Dein index.html nutzt:
 * - snap.status
 * - snap.step
 * - snap.progress.current / total
 * - snap.stats (optional)
 */
function emitSnapshot(jobId, patch = {}) {
  const job = jobs.get(jobId);
  if (!job) return;

  const frontendStatus =
    job.status === "failed" || job.status === "captcha" ? "error" : job.status;

  const snap = {
    status: frontendStatus,
    step: patch.step ?? job.lastSnapshot?.step ?? "—",
    progress: patch.progress ?? {
      current: job.progress.channelsDone,
      total: job.progress.channelsTotal,
    },
    error: job.error ?? null,
    stats: patch.stats ?? job.lastSnapshot?.stats ?? null,
  };

  job.lastSnapshot = snap;

  const clients = jobEventClients.get(jobId);
  if (clients && clients.size) {
    for (const res of clients) {
      try {
        sseSend(res, "snapshot", snap);
      } catch {
        clients.delete(res);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 1) HTML Dateien finden (.html und .htm)
// ---------------------------------------------------------------------------
async function findHtmlFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const ent of entries) {
    const full = path.join(dirPath, ent.name);

    if (ent.isDirectory()) {
      files.push(...(await findHtmlFiles(full)));
      continue;
    }

    if (!ent.isFile()) continue;

    const lower = ent.name.toLowerCase();
    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      files.push(full);
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// 2) YouTube Kanäle aus SocialBlade-HTML extrahieren
// ---------------------------------------------------------------------------
function extractYoutubeChannelsFromHtml(html) {
  const results = [];
  if (!html) return results;

  let m;

  // A) Vollständige Links mit /channel/UC...
  const reChannelId =
    /https?:\/\/(?:www\.)?youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})/g;

  while ((m = reChannelId.exec(html))) {
    const youtubeId = m[1];
    results.push({
      youtubeId,
      youtubeUrl: `https://www.youtube.com/channel/${youtubeId}`,
    });
  }

  // B) Escaped Links
  const reChannelIdEscaped =
    /https?:\\\/\\\/(?:www\.)?youtube\.com\\\/channel\\\/(UC[a-zA-Z0-9_-]{20,})/g;

  while ((m = reChannelIdEscaped.exec(html))) {
    const youtubeId = m[1];
    results.push({
      youtubeId,
      youtubeUrl: `https://www.youtube.com/channel/${youtubeId}`,
    });
  }

  // C) Relative Links /channel/UC...
  const reRelative = /\/channel\/(UC[a-zA-Z0-9_-]{20,})/g;

  while ((m = reRelative.exec(html))) {
    const youtubeId = m[1];
    results.push({
      youtubeId,
      youtubeUrl: `https://www.youtube.com/channel/${youtubeId}`,
    });
  }

  // D) Handle Links /@handle
  const reHandle = /https?:\/\/(?:www\.)?youtube\.com\/@([a-zA-Z0-9._-]{3,})/g;

  while ((m = reHandle.exec(html))) {
    const handleName = m[1];
    results.push({
      youtubeId: null, // kommt später aus ytInitialData (id)
      youtubeUrl: `https://www.youtube.com/@${handleName}`,
      youtubeHandle: `@${handleName}`,
    });
  }

  // Duplikate innerhalb einer Datei entfernen
  const seen = new Set();
  const uniq = [];

  for (const r of results) {
    const key = r.youtubeId || r.youtubeUrl || r.youtubeHandle;
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    uniq.push({
      ...r,
      youtubeUrl: normalizeYoutubeUrl(r.youtubeUrl),
    });
  }

  return uniq;
}

// Schlüssel für Deduplizierung (vor YouTube-Aufruf)
function channelKey(ch) {
  return ch.youtubeId || ch.youtubeUrl || ch.youtubeHandle;
}

// URL Builder
function makeYoutubeMainUrl(ch) {
  // "main" ist nur noch die Basis-URL (ohne Fetch!)
  if (ch?.youtubeUrl) return normalizeYoutubeUrl(ch.youtubeUrl);
  return `https://www.youtube.com/channel/${encodeURIComponent(ch.youtubeId)}`;
}

function makeYoutubeAboutUrl(ch) {
  const base = makeYoutubeMainUrl(ch);
  if (!base) return null;
  return `${base}/about`;
}

function makeYoutubeVideosUrl(ch) {
  const base = makeYoutubeMainUrl(ch);
  if (!base) return null;
  return `${base}/videos`;
}

// ---------------------------------------------------------------------------
// 3) KI Simulation: nur warten (optional)
// ---------------------------------------------------------------------------
async function simulateAiCheck({ jobId, channel, minMs, maxMs }) {
  const simulateMs = pickRandomInt(minMs, maxMs);

  emitLog(
    jobId,
    "info",
    `KI Simulation startet (${Math.round(simulateMs / 1000)} Sekunden)`,
    { youtubeKey: channelKey(channel) }
  );

  await sleep(simulateMs);

  emitLog(jobId, "info", "KI Simulation fertig", {
    youtubeKey: channelKey(channel),
    simulateMs,
  });

  return { simulateMs };
}

// ---------------------------------------------------------------------------
// 4) YouTube JSON sicher parsen (defensiv)
// ---------------------------------------------------------------------------
function parseChannelInfoSafe(jobId, youtubeKey, ytData, label) {
  if (!ytData) {
    return {
      ok: false,
      channelInfo: null,
      error: `${label}: ytInitialData fehlt`,
    };
  }

  try {
    const info = extractChannelInfoFromYtInitialData(ytData);
    return { ok: true, channelInfo: info, error: null };
  } catch (e) {
    emitLog(jobId, "warn", `${label}: Parsen fehlgeschlagen`, {
      youtubeKey,
      error: String(e?.message || e),
    });
    return {
      ok: false,
      channelInfo: null,
      error: `${label}: Parsen fehlgeschlagen`,
    };
  }
}

// ---------------------------------------------------------------------------
// 5) YouTube Seiten laden: NUR /about und /videos
// ---------------------------------------------------------------------------
async function fetchYoutubeAboutAndVideos({
  jobId,
  fetcher,
  ch,
  switchTabMinMs,
  switchTabMaxMs,
  videosLimit,
}) {
  const youtubeKey = channelKey(ch);

  const baseUrl = makeYoutubeMainUrl(ch); // nur Basis
  const aboutUrl = makeYoutubeAboutUrl(ch);
  const videosUrl = makeYoutubeVideosUrl(ch);

  // (1) /about laden
  emitLog(jobId, "info", "YouTube /about laden", { youtubeKey, url: aboutUrl });

  const aboutHtml = await fetcher.fetchText(aboutUrl);
  const aboutData = extractYtInitialData(aboutHtml);
  const aboutParsed = parseChannelInfoSafe(
    jobId,
    youtubeKey,
    aboutData,
    "/about"
  );

  // DEBUG NUR TERMINAL
  debug(jobId, "about markers", {
    youtubeKey,
    aboutUrl,
    hasYtInitialData: aboutHtml.includes("ytInitialData"),
    hasCountryWord:
      aboutHtml.toLowerCase().includes("country") ||
      aboutHtml.toLowerCase().includes("land"),
    aboutDataHasMeta: Boolean(aboutData?.metadata?.channelMetadataRenderer),
    parsedCountry: aboutParsed?.channelInfo?.country ?? null,
  });

  // Pause zwischen Tabs (/about -> /videos)
  const pause = pickRandomInt(switchTabMinMs, switchTabMaxMs);
  emitLog(
    jobId,
    "info",
    `Pause vor /videos (${Math.round(pause / 1000)} Sekunden)`,
    { youtubeKey }
  );
  await sleep(pause);

  // (2) /videos laden
  emitLog(jobId, "info", "YouTube /videos laden", {
    youtubeKey,
    url: videosUrl,
  });

  const videosHtml = await fetcher.fetchText(videosUrl);
  const videosData = extractYtInitialData(videosHtml);

  // Videos extrahieren (defensiv)
  let videos = [];
  let videosOk = false;
  let videosError = null;

  if (!videosData) {
    videosOk = false;
    videosError = "/videos: ytInitialData fehlt";
  } else {
    try {
      videos = extractVideosFromYtVideosInitialData(videosData, videosLimit);
      videosOk = true;
    } catch (e) {
      videosOk = false;
      videosError = `/videos: Video-Parsing fehlgeschlagen: ${String(
        e?.message || e
      )}`;
    }
  }

  // Fallback: Wenn /about kaputt ist, versuche ChannelInfo aus /videos
  const videosInfoParsed = parseChannelInfoSafe(
    jobId,
    youtubeKey,
    videosData,
    "/videos (ChannelInfo Fallback)"
  );

  const channelInfo = aboutParsed.ok
    ? aboutParsed.channelInfo
    : videosInfoParsed.ok
    ? videosInfoParsed.channelInfo
    : null;

  const ok = Boolean(channelInfo?.id);

  return {
    baseUrl,
    aboutUrl,
    videosUrl,
    about: { ok: aboutParsed.ok, error: aboutParsed.error },
    videos: { ok: videosOk, error: videosError },
    channelInfo,
    videosList: videos,
    ok,
  };
}

// ---------------------------------------------------------------------------
// 6) Einen Kanal verarbeiten (YouTube laden, extrahieren, speichern)
// ---------------------------------------------------------------------------
async function processOneChannel({
  jobId,
  job,
  fetcher,
  ch,
  sourceFile,
  switchTabMinMs,
  switchTabMaxMs,
  aiMinMs,
  aiMaxMs,
  betweenChMinMs,
  betweenChMaxMs,
  videosLimit,
}) {
  const key = channelKey(ch);
  if (!key) return;

  // Duplikat vermeiden (vor YouTube-Aufruf)
  if (job.seenChannelKeys.has(key)) {
    job.progress.channelsSkippedDuplicate++;
    emitLog(jobId, "info", "Duplikat übersprungen (Vor-Schlüssel)", {
      youtubeKey: key,
      sourceFile,
    });
    return;
  }
  job.seenChannelKeys.add(key);

  job.progress.channelsTotal++;
  job.channels.push({ ...ch, sourceFile });

  emitSnapshot(jobId, {
    step: `Neuer Kanal (${job.progress.channelsDone}/${job.progress.channelsTotal})`,
  });

  // YouTube laden: /about und /videos
  let ytResult = null;

  try {
    ytResult = await fetchYoutubeAboutAndVideos({
      jobId,
      fetcher,
      ch,
      switchTabMinMs,
      switchTabMaxMs,
      videosLimit,
    });

    if (ytResult.about.ok) job.progress.ytAboutOk++;
    else job.progress.ytAboutFailed++;

    if (ytResult.videos.ok) job.progress.ytVideosOk++;
    else job.progress.ytVideosFailed++;
  } catch (err) {
    // Captcha: YouTube blockiert automatisches Laden.
    if (
      err instanceof CaptchaDetectedError ||
      err?.name === "CaptchaDetectedError"
    ) {
      job.captcha = {
        detected: true,
        url: err.url,
        host: err.host,
        status: err.status,
        marker: err.marker,
      };

      job.status = "captcha";
      job.finishedAt = nowIso();
      job.error = `YouTube blockiert (Captcha). Öffne im Browser: ${err.url}`;

      emitLog(jobId, "err", "Captcha erkannt, Job stoppt", job.captcha);
      emitSnapshot(jobId, { step: "Captcha erkannt (Job gestoppt)" });
      return;
    }

    emitLog(jobId, "err", "Fehler beim Laden von YouTube", {
      youtubeKey: key,
      error: String(err?.message || err),
    });

    job.progress.ytAboutFailed++;
    job.progress.ytVideosFailed++;

    ytResult = {
      ok: false,
      baseUrl: makeYoutubeMainUrl(ch),
      aboutUrl: makeYoutubeAboutUrl(ch),
      videosUrl: makeYoutubeVideosUrl(ch),
      about: { ok: false, error: String(err?.message || err) },
      videos: { ok: false, error: String(err?.message || err) },
      channelInfo: null,
      videosList: [],
    };
  }

  if (job.status === "captcha") return;

  // Optionale "KI Simulation"
  emitSnapshot(jobId, { step: "KI Simulation läuft..." });
  try {
    await simulateAiCheck({
      jobId,
      channel: ch,
      minMs: aiMinMs,
      maxMs: aiMaxMs,
    });
    job.progress.aiDone++;
  } catch (e) {
    emitLog(jobId, "warn", "Fehler bei KI Simulation", {
      youtubeKey: key,
      error: String(e?.message || e),
    });
  }

  // Daten vorbereiten für Speicherung
  const info = ytResult?.channelInfo ?? null;

  // stabile Kanal-ID (UC...)
  const finalYoutubeId = info?.id ?? ch.youtubeId ?? null;

  // Kanal-URL (aus channelInfo oder fallback)
  const finalYoutubeUrl = info?.url ?? ch.youtubeUrl ?? makeYoutubeMainUrl(ch);

  if (!finalYoutubeId) {
    emitLog(
      jobId,
      "warn",
      "Keine stabile youtubeId gefunden → nicht gespeichert",
      { youtubeKey: key, youtubeUrl: finalYoutubeUrl }
    );
  } else {
    // Duplikate nach echter Kanal-ID vermeiden
    if (job.seenFinalYoutubeIds.has(finalYoutubeId)) {
      job.progress.channelsSkippedDuplicate++;
      emitLog(jobId, "info", "Duplikat nach youtubeId übersprungen", {
        youtubeId: finalYoutubeId,
        sourceFile,
      });
      return;
    }
    job.seenFinalYoutubeIds.add(finalYoutubeId);

    const videosList = Array.isArray(ytResult?.videosList)
      ? ytResult.videosList
      : [];

    const countryValue = String(info?.country ?? "").trim() || null;

    const doc = {
      youtubeId: finalYoutubeId,
      youtubeUrl: finalYoutubeUrl,
      sourceFile,

      mainUrl: ytResult?.baseUrl ?? makeYoutubeMainUrl(ch), // Basis-URL (kein Fetch)
      aboutUrl: ytResult?.aboutUrl ?? null,
      videosUrl: ytResult?.videosUrl ?? null,

      ytAboutOk: Boolean(ytResult?.about?.ok),
      ytVideosOk: Boolean(ytResult?.videos?.ok),

      channelInfo: {
        id: info?.id ?? null,
        title: info?.title ?? null,
        handle: info?.handle ?? null,
        url: info?.url ?? null,
        description: info?.description ?? null,
        ...(countryValue ? { country: countryValue } : {}),
        keywords: info?.keywords ?? [],
        subscriberCountText: info?.subscriberCountText ?? null,
      },

      videos: videosList,

      extractedAt: new Date(),
      status: ytResult?.ok ? "done" : "error",

      error: ytResult?.ok
        ? undefined
        : {
            message:
              ytResult?.about?.error ||
              ytResult?.videos?.error ||
              "YouTube nicht ok",
            when: new Date(),
          },
    };

    try {
      await Vorgefiltert.findOneAndUpdate(
        { youtubeId: finalYoutubeId },
        { $set: doc },
        { upsert: true }
      );

      emitLog(jobId, "info", "In MongoDB gespeichert (vorgefiltert)", {
        youtubeId: finalYoutubeId,
        videosSaved: videosList.length,
      });
    } catch (e) {
      emitLog(jobId, "err", "MongoDB Fehler beim Speichern", {
        youtubeId: finalYoutubeId,
        error: String(e?.message || e),
      });
    }
  }

  // Preview fürs Frontend (Jobs UI)
  const result = {
    youtubeId: finalYoutubeId,
    youtubeUrl: finalYoutubeUrl,
    sourceFile,

    aboutUrl: ytResult?.aboutUrl ?? makeYoutubeAboutUrl(ch),
    videosUrl: ytResult?.videosUrl ?? makeYoutubeVideosUrl(ch),

    ytAboutOk: Boolean(ytResult?.about?.ok),
    ytVideosOk: Boolean(ytResult?.videos?.ok),

    channelInfo: ytResult?.channelInfo ?? null,

    videosPreview: (ytResult?.videosList ?? []).slice(0, 5),

    ok: Boolean(ytResult?.ok),

    error: ytResult?.ok
      ? null
      : ytResult?.about?.error || ytResult?.videos?.error || "YouTube nicht ok",
  };

  job.enriched.push(result);

  job.progress.channelsDone++;
  emitSnapshot(jobId, {
    step: `Kanal fertig (${job.progress.channelsDone}/${job.progress.channelsTotal})`,
  });

  // Pause zwischen Kanälen
  if (job.status !== "captcha" && job.status !== "failed") {
    const pauseMs = pickRandomInt(betweenChMinMs, betweenChMaxMs);
    emitLog(
      jobId,
      "info",
      `Pause zwischen Kanälen (${Math.round(pauseMs / 1000)} Sekunden)`,
      { youtubeKey: key }
    );
    await sleep(pauseMs);
  }
}

// ---------------------------------------------------------------------------
// Job runner Prozess 1 (HTML → DB)
// ---------------------------------------------------------------------------
async function runJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    await connectDb();
  } catch (e) {
    job.status = "failed";
    job.finishedAt = nowIso();
    job.error = "MongoDB Verbindung fehlgeschlagen. Läuft MongoDB?";
    emitLog(jobId, "err", job.error, { error: String(e?.message || e) });
    emitSnapshot(jobId, { step: "MongoDB Fehler" });
    return;
  }

  const inputDir = job.options?.inputDir
    ? path.resolve(job.options.inputDir)
    : DEFAULT_INPUT_DIR;

  const fetchOptions = {
    ...DEFAULT_FETCH_OPTIONS,
    ...(job.options?.fetchOptions || {}),
  };

  const switchTabMinMs =
    typeof job.options?.switchTabMinMs === "number"
      ? Math.max(1_000, job.options.switchTabMinMs)
      : SWITCH_TAB_MIN_MS_DEFAULT;

  const switchTabMaxMs =
    typeof job.options?.switchTabMaxMs === "number"
      ? Math.max(switchTabMinMs, job.options.switchTabMaxMs)
      : SWITCH_TAB_MAX_MS_DEFAULT;

  const betweenChMinMs =
    typeof job.options?.betweenChMinMs === "number"
      ? Math.max(1_000, job.options.betweenChMinMs)
      : BETWEEN_CH_MIN_MS_DEFAULT;

  const betweenChMaxMs =
    typeof job.options?.betweenChMaxMs === "number"
      ? Math.max(betweenChMinMs, job.options.betweenChMaxMs)
      : BETWEEN_CH_MAX_MS_DEFAULT;

  const aiMinMs =
    typeof job.options?.aiSimMinMs === "number"
      ? Math.max(1_000, job.options.aiSimMinMs)
      : AI_SIM_MIN_MS_DEFAULT;

  const aiMaxMs =
    typeof job.options?.aiSimMaxMs === "number"
      ? Math.max(aiMinMs, job.options.aiSimMaxMs)
      : AI_SIM_MAX_MS_DEFAULT;

  const videosLimit =
    typeof job.options?.videosLimit === "number"
      ? Math.max(1, Math.floor(job.options.videosLimit))
      : VIDEOS_LIMIT_DEFAULT;

  emitLog(jobId, "info", "Job gestartet (HTML → DB)", {
    inputDir,
    fetchOptions,
    switchTabMinMs,
    switchTabMaxMs,
    betweenChMinMs,
    betweenChMaxMs,
    aiMinMs,
    aiMaxMs,
    videosLimit,
  });

  emitSnapshot(jobId, { step: "Starte Job" });

  try {
    emitSnapshot(jobId, { step: "Suche HTML Dateien" });

    const htmlFiles = await findHtmlFiles(inputDir);
    job.progress.htmlFilesFound = htmlFiles.length;

    emitLog(jobId, "info", `Gefunden: ${htmlFiles.length} Datei(en)`, {});
    emitSnapshot(jobId, { step: "HTML Dateien gefunden" });

    if (htmlFiles.length === 0) {
      job.status = "done";
      job.finishedAt = nowIso();
      emitSnapshot(jobId, {
        step: "Fertig (0 Dateien)",
        stats: { ...job.progress },
      });
      return;
    }

    const fetcher = createSafeFetcher({
      ...fetchOptions,
      stopOnCaptcha: true,
      hostRules: {
        "www.youtube.com": { minIntervalMs: 4500, jitterMs: 1200 },
        "youtube.com": { minIntervalMs: 4500, jitterMs: 1200 },
      },
      onEvent: (ev) => emitLog(jobId, "info", `Fetch Ereignis: ${ev.type}`, ev),
    });

    emitSnapshot(jobId, { step: "Verarbeitung gestartet" });

    for (let i = 0; i < htmlFiles.length; i++) {
      const filePath = htmlFiles[i];
      const filename = path.basename(filePath);

      emitLog(jobId, "info", `Datei lesen ${i + 1}/${htmlFiles.length}`, {
        filename,
      });

      const html = await fs.readFile(filePath, "utf-8");
      const channels = extractYoutubeChannelsFromHtml(html);

      job.progress.htmlFilesParsed = i + 1;

      if (!channels.length) {
        emitLog(jobId, "info", "Keine Kanäle gefunden", { filename });
        continue;
      }

      emitLog(jobId, "info", `Kanäle gefunden: ${channels.length}`, {
        filename,
      });

      for (const ch of channels) {
        if (job.status === "captcha") break;

        await processOneChannel({
          jobId,
          job,
          fetcher,
          ch,
          sourceFile: filename,
          switchTabMinMs,
          switchTabMaxMs,
          aiMinMs,
          aiMaxMs,
          betweenChMinMs,
          betweenChMaxMs,
          videosLimit,
        });
      }

      if (job.status === "captcha") break;
    }

    if (job.status !== "captcha") {
      job.status = "done";
      job.finishedAt = nowIso();

      const stats = { ...job.progress };
      emitLog(jobId, "info", "Job fertig (HTML → DB)", stats);
      emitSnapshot(jobId, { step: "Job fertig", stats });
    }
  } catch (err) {
    job.status = "failed";
    job.finishedAt = nowIso();
    job.error = String(err?.message || err);

    emitLog(jobId, "err", "Job fehlgeschlagen", { error: job.error });
    emitSnapshot(jobId, { step: "Job Fehler" });
  }
}

// ---------------------------------------------------------------------------
// Job runner Prozess 2 (vorgefiltert → vorgefiltertCode)
// ---------------------------------------------------------------------------
async function runJobVorgefiltertToCode(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    await connectDb();
  } catch (e) {
    job.status = "failed";
    job.finishedAt = nowIso();
    job.error = "MongoDB Verbindung fehlgeschlagen. Läuft MongoDB?";
    emitLog(jobId, "err", job.error, { error: String(e?.message || e) });
    emitSnapshot(jobId, { step: "MongoDB Fehler" });
    return;
  }

  const options = job.options || {};

  const minDistinctGermanWords =
    typeof options.minDistinctGermanWords === "number"
      ? Math.max(1, Math.floor(options.minDistinctGermanWords))
      : 5;

  const deutschArray =
    Array.isArray(options.deutschArray) && options.deutschArray.length
      ? options.deutschArray
      : DEUTSCH_WORDS_ARRAY;

  // ✅ NEU: BadChar-Regel Optionen
  const badCharArray =
    Array.isArray(options.badCharArray) && options.badCharArray.length
      ? options.badCharArray
      : NON_GERMAN_UNICODE_CHARS;

  const maxBadCharHits =
    typeof options.maxBadCharHits === "number"
      ? Math.max(0, Math.floor(options.maxBadCharHits))
      : DEFAULT_MAX_BAD_CHAR_HITS;
  const dryRun = Boolean(options.dryRun);

  // limit=0 bedeutet: alle
  const limit =
    typeof options.limit === "number"
      ? Math.max(0, Math.floor(options.limit))
      : 0;

  emitLog(jobId, "info", "Job gestartet (vorgefiltert → vorgefiltertCode)", {
    minDistinctGermanWords,
    deutschArraySize: deutschArray.length,
    badCharArraySize: badCharArray.length,
    maxBadCharHits,
    dryRun,
    limit: limit || "ALL",
  });

  emitSnapshot(jobId, { step: "Starte Scan in vorgefiltert" });

  try {
    const totalDocs = await Vorgefiltert.countDocuments();
    const totalPlanned = limit ? Math.min(limit, totalDocs) : totalDocs;

    // Damit dein Frontend (progress current/total) sauber funktioniert,
    // verwenden wir wieder channelsDone/channelsTotal:
    job.progress.channelsTotal = totalPlanned;
    job.progress.channelsDone = 0;

    // Zusätzliche Counter
    job.progress.scanned = 0;
    job.progress.passedCountry = 0;
    job.progress.passedLanguage = 0;
    job.progress.saved = 0;
    job.progress.skippedNotDeutschland = 0;
    job.progress.skippedNotGerman = 0;

    // ✅ NEU: wie viele wegen BadChars verworfen
    job.progress.skippedBadChars = 0;

    job.progress.errors = 0;

    // Cursor: speicherschonend (lädt nicht alles in RAM)
    const cursor = Vorgefiltert.find({}).sort({ _id: 1 }).cursor();

    for await (const doc of cursor) {
      job.progress.scanned++;

      if (limit && job.progress.scanned > limit) break;

      // Fortschritt fürs UI
      job.progress.channelsDone = job.progress.scanned;

      // Regel 1: Country = Deutschland?
      if (!isCountryDeutschland(doc)) {
        job.progress.skippedNotDeutschland++;
        continue;
      }
      job.progress.passedCountry++;

      // Regel 2: mind. X Wörter aus deutschArray?
      const langRes = germanWordListCheck(
        doc,
        deutschArray,
        minDistinctGermanWords
      );

      if (!langRes.ok) {
        job.progress.skippedNotGerman++;
        continue;
      }
      job.progress.passedLanguage++;

      // ✅ Regel 3: BadChars zählen
      const badRes = badCharCheck(doc, badCharArray, maxBadCharHits);
      if (!badRes.ok) {
        job.progress.skippedBadChars++;
        continue;
      }

      // Wenn Regeln bestanden: in neue Collection schreiben
      if (!dryRun) {
        const outDoc = {
          youtubeId: doc.youtubeId,
          youtubeUrl: doc.youtubeUrl,
          sourceFile: doc.sourceFile,

          mainUrl: doc.mainUrl,
          aboutUrl: doc.aboutUrl,
          videosUrl: doc.videosUrl,

          ytAboutOk: doc.ytAboutOk,
          ytVideosOk: doc.ytVideosOk,

          channelInfo: doc.channelInfo,
          videos: doc.videos,

          extractedAt: doc.extractedAt,

          codeCheck: {
            checkedAt: new Date(),
            passedRules: [
              "country=Deutschland",
              `deutschArray>=${minDistinctGermanWords}`,
            ],
            failedReason: "",
            germanHits: langRes.hitsCount,
            germanWordsFound: langRes.hitsWords,
            // ✅ Neu: BadChar-Auswertung speichern (super fürs Debuggen)
            badCharHits: badRes.hitsCount,
            badCharsFound: badRes.foundCharsDistinct,
          },
        };

        await VorgefiltertCode.findOneAndUpdate(
          { youtubeId: doc.youtubeId },
          { $set: outDoc },
          { upsert: true }
        );
      }

      job.progress.saved++;

      // Nicht zu oft spammen: alle 25 docs einen Snapshot
      if (job.progress.scanned % 25 === 0) {
        emitSnapshot(jobId, {
          step: `Scanne & filtere (${job.progress.scanned}/${totalPlanned})`,
          stats: { ...job.progress },
        });
      }
    }

    job.status = "done";
    job.finishedAt = nowIso();

    emitLog(jobId, "info", "Job fertig (vorgefiltert → vorgefiltertCode)", {
      ...job.progress,
    });

    emitSnapshot(jobId, { step: "Job fertig", stats: { ...job.progress } });
  } catch (err) {
    job.status = "failed";
    job.finishedAt = nowIso();
    job.error = String(err?.message || err);
    job.progress.errors++;

    emitLog(jobId, "err", "Job fehlgeschlagen", { error: job.error });
    emitSnapshot(jobId, { step: "Job Fehler", stats: { ...job.progress } });
  }
}

// ---------------------------------------------------------------------------
// Start Job Prozess 1
// ---------------------------------------------------------------------------
app.post("/process/sb-html-to-db", async (req, res) => {
  const options = req.body || {};
  const job = createJob({ options });

  res.json({
    ok: true,
    jobId: job.jobId,
    statusUrl: `/api/jobs/${job.jobId}`,
    eventsUrl: `/api/jobs/${job.jobId}/stream`,
  });

  runJob(job.jobId);
});

// Optionaler Alias
app.post("/api/jobs/start", async (req, res) => {
  const options = req.body || {};
  const job = createJob({ options });

  res.json({
    ok: true,
    jobId: job.jobId,
    statusUrl: `/api/jobs/${job.jobId}`,
    eventsUrl: `/api/jobs/${job.jobId}/stream`,
  });

  runJob(job.jobId);
});

// ---------------------------------------------------------------------------
// Start Job Prozess 2
// ---------------------------------------------------------------------------
app.post("/process/vorgefiltert-to-vorgefiltertCode", async (req, res) => {
  const options = req.body || {};
  const job = createJob({ options });

  res.json({
    ok: true,
    jobId: job.jobId,
    statusUrl: `/api/jobs/${job.jobId}`,
    eventsUrl: `/api/jobs/${job.jobId}/stream`,
  });

  runJobVorgefiltertToCode(job.jobId);
});

// ---------------------------------------------------------------------------
// Job Status abfragen
// ---------------------------------------------------------------------------
app.get("/api/jobs/:jobId", (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ ok: false, error: "Job nicht gefunden" });
  }

  res.json({
    ok: true,
    jobId: job.jobId,
    status: job.status,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    progress: job.progress,
    captcha: job.captcha,
    enrichPreview: job.enriched.slice(-30),
    error: job.error,
  });
});

// ---------------------------------------------------------------------------
// Live-Stream (Server-Sent Events)
// ---------------------------------------------------------------------------
app.get("/api/jobs/:jobId/stream", (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).end();

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  if (!jobEventClients.has(jobId)) jobEventClients.set(jobId, new Set());
  jobEventClients.get(jobId).add(res);

  sseSend(
    res,
    "snapshot",
    job.lastSnapshot ?? {
      status: "running",
      step: "—",
      progress: {
        current: job.progress.channelsDone,
        total: job.progress.channelsTotal,
      },
      error: job.error ?? null,
      stats: null,
    }
  );

  for (const l of job.logs.slice(-200)) sseSend(res, "log", l);

  const heartbeat = setInterval(() => {
    try {
      sseSend(res, "ping", { t: Date.now() });
    } catch {}
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    const set = jobEventClients.get(jobId);
    if (set) set.delete(res);
  });
});

// ---------------------------------------------------------------------------
// Frontend Dateien ausliefern
// ---------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, "public");

app.get("/collections", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "collections.html"));
});

// ---------------------------------------------------------------------------
// Collections API (vorgefiltert + vorgefiltertCode)
// ---------------------------------------------------------------------------
app.get("/api/collections", async (req, res) => {
  try {
    await connectDb();
    const countVorgefiltert = await Vorgefiltert.countDocuments();
    const countVorgefiltertCode = await VorgefiltertCode.countDocuments();

    return res.json({
      ok: true,
      collections: {
        vorgefiltert: countVorgefiltert,
        vorgefiltertCode: countVorgefiltertCode,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ---------------------------------------------------------------------------
// Collection-Liste / Details (für beide Collections)
// ---------------------------------------------------------------------------

function getCollectionModelByName(name) {
  if (name === "vorgefiltert") return Vorgefiltert;
  if (name === "vorgefiltertCode") return VorgefiltertCode;
  return null;
}

/**
 * GET /api/collection/:name?limit=100&skip=0&q=...
 * -> LISTE (schnell, ohne videos + ohne description)
 *
 * Wir selektieren bewusst nur kleine channelInfo-Felder.
 */
app.get("/api/collection/:name", async (req, res) => {
  try {
    await connectDb();

    const name = req.params.name;
    const Model = getCollectionModelByName(name);
    if (!Model) {
      return res
        .status(404)
        .json({ ok: false, error: "Collection nicht gefunden" });
    }

    const limitRaw = Number(req.query.limit);
    const skipRaw = Number(req.query.skip);
    const q = String(req.query.q || "").trim();

    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 500)
      : 100;
    const skip = Number.isFinite(skipRaw) ? Math.max(skipRaw, 0) : 0;

    const filter = {};
    if (q) {
      filter.$or = [
        { youtubeId: { $regex: q, $options: "i" } },
        { youtubeUrl: { $regex: q, $options: "i" } },
        { "channelInfo.title": { $regex: q, $options: "i" } },
        { "channelInfo.handle": { $regex: q, $options: "i" } },
      ];
    }

    const total = await Model.countDocuments(filter);

    const items = await Model.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select({
        youtubeId: 1,
        youtubeUrl: 1,
        sourceFile: 1,

        // kleine channelInfo Felder (ohne description)
        "channelInfo.id": 1,
        "channelInfo.title": 1,
        "channelInfo.handle": 1,
        "channelInfo.url": 1,
        "channelInfo.country": 1,
        "channelInfo.subscriberCountText": 1,

        ytAboutOk: 1,
        ytVideosOk: 1,
        status: 1,
        extractedAt: 1,
        createdAt: 1,

        // nur in vorgefiltertCode interessant
        codeCheck: 1,
      })
      .lean();

    return res.json({ ok: true, total, items });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * GET /api/collection/:name/item/:youtubeId
 * -> DETAILS (inkl. description + videos)
 */
app.get("/api/collection/:name/item/:youtubeId", async (req, res) => {
  try {
    await connectDb();

    const name = req.params.name;
    const Model = getCollectionModelByName(name);
    if (!Model) {
      return res
        .status(404)
        .json({ ok: false, error: "Collection nicht gefunden" });
    }

    const youtubeId = String(req.params.youtubeId || "").trim();
    if (!youtubeId) {
      return res.status(400).json({ ok: false, error: "youtubeId fehlt" });
    }

    const doc = await Model.findOne({ youtubeId })
      .select({
        youtubeId: 1,
        youtubeUrl: 1,
        channelInfo: 1,
        videos: 1,
        aboutUrl: 1,
        videosUrl: 1,
        extractedAt: 1,
        createdAt: 1,
        status: 1,
        error: 1,
        sourceFile: 1,
        codeCheck: 1,
      })
      .lean();

    if (!doc) {
      return res
        .status(404)
        .json({ ok: false, error: "Dokument nicht gefunden" });
    }

    return res.json({ ok: true, item: doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ---------------------------------------------------------------------------
// Statische Dateien (CSS, JS, index.html, etc.)
// ---------------------------------------------------------------------------
app.use(express.static(PUBLIC_DIR));

// ---------------------------------------------------------------------------
// Server starten
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
  console.log(`Collections UI: http://localhost:${PORT}/collections`);
  console.log(
    `Start Prozess 1: POST http://localhost:${PORT}/process/sb-html-to-db`
  );
  console.log(
    `Start Prozess 2: POST http://localhost:${PORT}/process/vorgefiltert-to-vorgefiltertCode`
  );
  console.log(`Upload: POST http://localhost:${PORT}/upload/option1`);
});
