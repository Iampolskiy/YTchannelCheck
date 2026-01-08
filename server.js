/**
 * server.js (ESM)
 * ==========================
 *
 * Dieses Backend hat zwei Prozesse:
 *
 * Prozess 1: SocialBlade → YouTube /about + /videos → MongoDB "vorgefiltert"
 *   - Route: POST /process/sb-html-to-db
 *
 * Prozess 2: MongoDB "vorgefiltert" → Regeln prüfen → MongoDB "vorgefiltertCode"
 *   - Route: POST /process/vorgefiltert-to-vorgefiltertCode
 *
 * ------------------------------------------------------------
 * NEU (dein Wunsch #1):
 * ------------------------------------------------------------
 * Zusätzlich speichern wir ALLE Kanäle, die in Prozess 2 "rausfliegen",
 * in einer neuen MongoDB Collection: "deletedChannels".
 *
 * Das bedeutet:
 * - Kanäle, die NICHT nach vorgefiltertCode übernommen werden,
 *   landen automatisch in "deletedChannels" inkl. Grund + Details.
 *
 * Vorteil:
 * - Du verlierst keine Daten mehr.
 * - Du kannst später genau sehen, WARUM ein Kanal rausgefiltert wurde.
 *
 * Hinweis:
 * - Wir machen das "idempotent" per youtubeId (Upsert).
 * - Das heißt: wenn du Prozess 2 nochmal startest, wird der Eintrag aktualisiert
 *   und ein Zähler "timesSkipped" erhöht.
 *
 * ------------------------------------------------------------
 * NEU (dein Wunsch #2 - Country==null Regel):
 * ------------------------------------------------------------
 * Problem vorher:
 * - Wenn country fehlt (null), ist isCountryDeutschland(doc) = false
 * - => Kanal wurde sofort rausgeworfen, ohne BadChars/DeutschWords-Checks.
 *
 * Lösung jetzt:
 * - Wenn country gesetzt ist UND eindeutig NICHT deutsch => raus (wie vorher)
 * - Wenn country fehlt (null/leer):
 *     => wir entscheiden über INHALT:
 *        1) NON_GERMAN_UNICODE_CHARS Check
 *        2) DEUTSCH_WORDS_ARRAY Check
 *     => nur wenn einer failt, wird der Kanal rausgeworfen.
 *     => wenn beide ok, bleibt der Kanal drin und zählt als "deutsch via Inhalt".
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
import { DeletedChannel } from "./lib/models/DeletedChannel.js";

import { DEUTSCH_WORDS_ARRAY } from "./lib/config/deutschArray.js";
import { NON_GERMAN_UNICODE_CHARS } from "./lib/config/charArray.js";

// ✅ Kids-Phrasen-Array
import { KIDS_HARD_PHRASES } from "./lib/config/blockedPhrasesArrayKids.js";

// ✅ Kids-Check Logik
import { kidsHardPhrasesCheck } from "./lib/codeChecks/kidsHardPhrasesCheck.js";

import { loadChannelsFromSbLinkFolder } from "./lib/sbSpecialInput.js";

// ---------------------------------------------------------------------------
// __dirname Ersatz (weil ESM)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------
const DEFAULT_INPUT_DIR = path.join(__dirname, "input");
const DEFAULT_INPUT_YT_DIR = path.join(__dirname, "inputYT");

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
 * Prozess 2:
 * - Wenn EIN Feld (channel title, channel description oder irgendein video title)
 *   mehr als X VERSCHIEDENE (unique) BadChars hat => raus.
 */
const DEFAULT_MAX_BAD_CHARS_DISTINCT_PER_FIELD = 3;

/**
 * Prozess 2:
 * - Wenn im gesamten Kanaltext (title+desc+videos titles) weniger als X
 *   VERSCHIEDENE (unique) Wörter aus DEUTSCH_WORDS_ARRAY vorkommen => raus.
 */
const DEFAULT_MIN_GERMAN_WORDS_DISTINCT_TOTAL = 3;

async function recordDeletedChannel({ jobId, doc, reason, details }) {
  try {
    const youtubeId = String(doc?.youtubeId || "").trim();
    if (!youtubeId) return;

    const payload = {
      youtubeId,
      youtubeUrl: doc?.youtubeUrl ?? null,
      sourceFile: doc?.sourceFile ?? null,

      mainUrl: doc?.mainUrl ?? null,
      aboutUrl: doc?.aboutUrl ?? null,
      videosUrl: doc?.videosUrl ?? null,

      channelInfo: doc?.channelInfo ?? null,
      extractedAt: doc?.extractedAt ?? null,

      // ✅ NEU: Videos mit speichern
      videos: Array.isArray(doc?.videos) ? doc.videos : [],

      lastReason: String(reason || ""),
      lastDetails: details ?? null,

      lastJobId: jobId ?? null,
    };

    await DeletedChannel.findOneAndUpdate(
      { youtubeId },
      {
        $set: payload,
        $inc: { timesSkipped: 1 },
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
        new: false,
      }
    );
  } catch (e) {
    // Wichtig: deletedChannels ist "nice to have".
    // Der Job soll NICHT sterben, nur weil dieses Logging nicht klappt.
    console.warn(
      "[WARN] recordDeletedChannel failed:",
      String(e?.message || e)
    );
  }
}

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

// Wir stellen sicher, dass beide Ordner existieren.
await ensureDir(DEFAULT_INPUT_DIR);
await ensureDir(DEFAULT_INPUT_YT_DIR);

// ---------------------------------------------------------------------------
// Deutsch-Check Helfer (Prozess 2)
// ---------------------------------------------------------------------------

function tokenizeText(text) {
  const t = String(text || "").toLowerCase();
  const parts = t.split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
  return new Set(parts);
}

function buildChannelContentText(doc) {
  const title = doc?.channelInfo?.title || "";
  const desc = doc?.channelInfo?.description || "";

  const videoTitles = Array.isArray(doc?.videos)
    ? doc.videos.map((v) => v?.title || "").join(" ")
    : "";

  return `${title}\n${desc}\n${videoTitles}`.trim();
}

function getTextsToCheck(doc) {
  const channelTitle = String(doc?.channelInfo?.title || "");
  const channelDescription = String(doc?.channelInfo?.description || "");
  const videoTitles = Array.isArray(doc?.videos)
    ? doc.videos.map((v) => String(v?.title || ""))
    : [];
  return { channelTitle, channelDescription, videoTitles };
}

function scanDistinctBadCharsInText(text, badSet) {
  const found = new Set();
  for (const ch of String(text || "")) {
    if (badSet.has(ch)) found.add(ch);
  }
  return { distinctCount: found.size, chars: Array.from(found) };
}

function nonGermanCharsDistinctPerFieldCheck(
  doc,
  badCharArray,
  maxDistinctPerField = 3
) {
  const list = Array.isArray(badCharArray) ? badCharArray : [];
  const badSet = new Set(list.map((c) => String(c || "")).filter(Boolean));

  if (badSet.size === 0) {
    return { ok: true, maxDistinctPerField, matches: [] };
  }

  const { channelTitle, channelDescription, videoTitles } =
    getTextsToCheck(doc);

  const matches = [];
  let ok = true;

  {
    const r = scanDistinctBadCharsInText(channelTitle, badSet);
    if (r.distinctCount > 0) {
      matches.push({
        field: "channelInfo.title",
        distinctCount: r.distinctCount,
        chars: r.chars.slice(0, 50),
        textSample: channelTitle.slice(0, 140),
      });
    }
    if (r.distinctCount > maxDistinctPerField) ok = false;
  }

  {
    const r = scanDistinctBadCharsInText(channelDescription, badSet);
    if (r.distinctCount > 0) {
      matches.push({
        field: "channelInfo.description",
        distinctCount: r.distinctCount,
        chars: r.chars.slice(0, 50),
        textSample: channelDescription.slice(0, 140),
      });
    }
    if (r.distinctCount > maxDistinctPerField) ok = false;
  }

  for (let i = 0; i < videoTitles.length; i++) {
    const title = videoTitles[i];
    const r = scanDistinctBadCharsInText(title, badSet);

    if (r.distinctCount > 0) {
      matches.push({
        field: `videos[${i}].title`,
        distinctCount: r.distinctCount,
        chars: r.chars.slice(0, 50),
        textSample: title.slice(0, 140),
      });
    }

    if (r.distinctCount > maxDistinctPerField) ok = false;
  }

  return { ok, maxDistinctPerField, matches };
}

function germanWordsDistinctTotalCheck(doc, deutschArray, minDistinct = 5) {
  const list = Array.isArray(deutschArray) ? deutschArray : [];
  const deutschSet = new Set(
    list.map((w) => String(w || "").toLowerCase()).filter(Boolean)
  );

  const content = buildChannelContentText(doc);
  const tokens = tokenizeText(content);

  const found = [];
  for (const w of deutschSet) {
    if (tokens.has(w)) found.push(w);
  }

  return {
    ok: found.length >= minDistinct,
    minDistinct,
    hitsDistinct: found.length,
    wordsFoundSample: found.slice(0, 50),
  };
}

/**
 * ✅ NEU: Country-Handling (anfängerfreundlich)
 *
 * Warum brauchen wir das?
 * - YouTube liefert manchmal KEIN Country (country fehlt => null)
 * - Du willst dann NICHT sofort wegwerfen,
 *   sondern zuerst über Inhalt (BadChars + DeutschWords) entscheiden.
 */
function getNormalizedCountry(doc) {
  // Falls field nicht existiert -> null
  const raw = doc?.channelInfo?.country;

  if (raw === null || raw === undefined) return null;

  // Manche Daten landen als String "null" in der DB -> behandeln wir wie null
  const s = String(raw).trim();
  if (!s) return null;
  if (s.toLowerCase() === "null") return null;

  return s;
}

/**
 * ✅ NEU: Erlaubte "deutsche" Länder (Country ist eindeutig deutsch)
 *
 * Hier steht also (wie du gefragt hast): "wo steht im Code, dass Deutsch erlaubt ist?"
 * -> Genau HIER in allowedExact / allowedContains.
 *
 * Du hattest bereits Deutschland/Österreich/Schweiz drin — ich mache es robuster,
 * indem ich auch englische Varianten zulasse (austria/switzerland) sowie Kürzel.
 */
function isGermanCountryValue(countryString) {
  const c = String(countryString || "")
    .trim()
    .toLowerCase();
  if (!c) return false;

  // Exakte Treffer
  const allowedExact = new Set([
    "deutschland",
    "germany",
    "de",
    "deutsch",

    "österreich",
    "oesterreich",
    "austria",
    "at",

    "schweiz",
    "switzerland",
    "ch",
  ]);
  if (allowedExact.has(c)) return true;

  // "Enthält" Treffer (z.B. "Deutschland (DE)")
  const allowedContains = [
    "deutschland",
    "germany",
    "deutsch",
    "österreich",
    "oesterreich",
    "schweiz",
  ];
  if (allowedContains.some((k) => c.includes(k))) return true;

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
// Job Speicher im Arbeitsspeicher + SSE
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

    progress: {
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

      scanned: 0,
      passedCountry: 0,
      passedLanguage: 0,
      saved: 0,

      skippedNotDeutschland: 0,
      skippedNotGerman: 0,
      skippedBadChars: 0,
      skippedKidsHard: 0,

      // ✅ NEU: wie viele wurden in deletedChannels geschrieben
      deletedSaved: 0,

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
// SSE helpers
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
// Prozess 1: HTML Dateien finden
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
// Prozess 1: YouTube Kanäle aus SocialBlade-HTML extrahieren
// ---------------------------------------------------------------------------
function extractYoutubeChannelsFromHtml(html) {
  const results = [];
  if (!html) return results;

  let m;

  const reChannelId =
    /https?:\/\/(?:www\.)?youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})/g;

  while ((m = reChannelId.exec(html))) {
    const youtubeId = m[1];
    results.push({
      youtubeId,
      youtubeUrl: `https://www.youtube.com/channel/${youtubeId}`,
    });
  }

  const reChannelIdEscaped =
    /https?:\\\/\\\/(?:www\.)?youtube\.com\\\/channel\\\/(UC[a-zA-Z0-9_-]{20,})/g;

  while ((m = reChannelIdEscaped.exec(html))) {
    const youtubeId = m[1];
    results.push({
      youtubeId,
      youtubeUrl: `https://www.youtube.com/channel/${youtubeId}`,
    });
  }

  const reRelative = /\/channel\/(UC[a-zA-Z0-9_-]{20,})/g;

  while ((m = reRelative.exec(html))) {
    const youtubeId = m[1];
    results.push({
      youtubeId,
      youtubeUrl: `https://www.youtube.com/channel/${youtubeId}`,
    });
  }

  const reHandle = /https?:\/\/(?:www\.)?youtube\.com\/@([a-zA-Z0-9._-]{3,})/g;

  while ((m = reHandle.exec(html))) {
    const handleName = m[1];
    results.push({
      youtubeId: null,
      youtubeUrl: `https://www.youtube.com/@${handleName}`,
      youtubeHandle: `@${handleName}`,
    });
  }

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

function makeYoutubeMainUrl(ch) {
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
// KI Simulation: nur warten (optional)
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
// YouTube JSON defensiv parsen
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
// YouTube Seiten laden: NUR /about und /videos
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

  const baseUrl = makeYoutubeMainUrl(ch);
  const aboutUrl = makeYoutubeAboutUrl(ch);
  const videosUrl = makeYoutubeVideosUrl(ch);

  emitLog(jobId, "info", "YouTube /about laden", { youtubeKey, url: aboutUrl });

  const aboutHtml = await fetcher.fetchText(aboutUrl);
  const aboutData = extractYtInitialData(aboutHtml);
  const aboutParsed = parseChannelInfoSafe(
    jobId,
    youtubeKey,
    aboutData,
    "/about"
  );

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

  const pause = pickRandomInt(switchTabMinMs, switchTabMaxMs);
  emitLog(
    jobId,
    "info",
    `Pause vor /videos (${Math.round(pause / 1000)} Sekunden)`,
    {
      youtubeKey,
    }
  );
  await sleep(pause);

  emitLog(jobId, "info", "YouTube /videos laden", {
    youtubeKey,
    url: videosUrl,
  });

  const videosHtml = await fetcher.fetchText(videosUrl);
  const videosData = extractYtInitialData(videosHtml);

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
// Prozess 1: Einen Kanal verarbeiten (YouTube laden, extrahieren, speichern)
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
  totalIsPreset = false,
}) {
  const key = channelKey(ch);
  if (!key) return;

  if (job.seenChannelKeys.has(key)) {
    job.progress.channelsSkippedDuplicate++;
    emitLog(jobId, "info", "Duplikat übersprungen (Vor-Schlüssel)", {
      youtubeKey: key,
      sourceFile,
    });
    return;
  }
  job.seenChannelKeys.add(key);

  if (!totalIsPreset) {
    job.progress.channelsTotal++;
  }

  job.channels.push({ ...ch, sourceFile });

  emitSnapshot(jobId, {
    step: `Neuer Kanal (${job.progress.channelsDone + 1}/${
      job.progress.channelsTotal || "?"
    })`,
  });

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

  const info = ytResult?.channelInfo ?? null;
  const finalYoutubeId = info?.id ?? ch.youtubeId ?? null;
  const finalYoutubeUrl = info?.url ?? ch.youtubeUrl ?? makeYoutubeMainUrl(ch);

  if (!finalYoutubeId) {
    emitLog(
      jobId,
      "warn",
      "Keine stabile youtubeId gefunden → nicht gespeichert",
      {
        youtubeKey: key,
        youtubeUrl: finalYoutubeUrl,
      }
    );
  } else {
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

      mainUrl: ytResult?.baseUrl ?? makeYoutubeMainUrl(ch),
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
    step: `Kanal fertig (${job.progress.channelsDone}/${
      job.progress.channelsTotal || "?"
    })`,
  });

  if (job.status !== "captcha" && job.status !== "failed") {
    const pauseMs = pickRandomInt(betweenChMinMs, betweenChMaxMs);
    emitLog(
      jobId,
      "info",
      `Pause zwischen Kanälen (${Math.round(pauseMs / 1000)} Sekunden)`,
      {
        youtubeKey: key,
      }
    );
    await sleep(pauseMs);
  }
}

// ---------------------------------------------------------------------------
// Job runner Prozess 1 (SB Input → DB)
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

  const inputMode = String(job.options?.inputMode || "sb-html").toLowerCase();

  const inputDir = job.options?.inputDir
    ? path.resolve(job.options.inputDir)
    : inputMode === "sb-special"
    ? DEFAULT_INPUT_YT_DIR
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

  emitLog(jobId, "info", "Job gestartet (Input → DB)", {
    inputMode,
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
    // --------------------------------------------------------------------
    // FALL 1: Spezial-Modus (inputYT: SocialBlade-Linklisten)
    // --------------------------------------------------------------------
    if (inputMode === "sb-special") {
      emitSnapshot(jobId, {
        step: "Spezial: Lese SocialBlade Linklisten (inputYT)",
      });

      const { channels, summary } = await loadChannelsFromSbLinkFolder({
        dirPath: inputDir,
        emitLog,
        jobId,
      });

      job.progress.htmlFilesFound = summary.filesCount;
      job.progress.htmlFilesParsed = summary.filesCount;

      emitLog(jobId, "info", "Spezial-Input geladen", summary);

      if (!channels.length) {
        job.status = "done";
        job.finishedAt = nowIso();
        emitSnapshot(jobId, {
          step: "Fertig (0 Channels aus inputYT)",
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
        onEvent: (ev) =>
          emitLog(jobId, "info", `Fetch Ereignis: ${ev.type}`, ev),
      });

      emitSnapshot(jobId, { step: "Spezial: Starte Verarbeitung (inputYT)" });

      job.progress.channelsTotal = channels.length;
      job.progress.channelsDone = 0;

      for (const ch of channels) {
        if (job.status === "captcha") break;

        await processOneChannel({
          jobId,
          job,
          fetcher,
          ch,
          sourceFile: "inputYT",
          switchTabMinMs,
          switchTabMaxMs,
          aiMinMs,
          aiMaxMs,
          betweenChMinMs,
          betweenChMaxMs,
          videosLimit,
          totalIsPreset: true,
        });
      }

      if (job.status !== "captcha") {
        job.status = "done";
        job.finishedAt = nowIso();
        const stats = { ...job.progress };
        emitLog(jobId, "info", "Job fertig (Spezial inputYT → DB)", stats);
        emitSnapshot(jobId, { step: "Job fertig (inputYT)", stats });
      }

      return;
    }

    // --------------------------------------------------------------------
    // FALL 2: Normal-Modus (input: SocialBlade HTML-Dateien)
    // --------------------------------------------------------------------
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

  const deutschArray =
    Array.isArray(options.deutschArray) && options.deutschArray.length
      ? options.deutschArray
      : DEUTSCH_WORDS_ARRAY;

  const badCharArray =
    Array.isArray(options.badCharArray) && options.badCharArray.length
      ? options.badCharArray
      : NON_GERMAN_UNICODE_CHARS;

  const maxBadCharsDistinctPerField =
    typeof options.maxBadCharsDistinctPerField === "number"
      ? Math.max(0, Math.floor(options.maxBadCharsDistinctPerField))
      : DEFAULT_MAX_BAD_CHARS_DISTINCT_PER_FIELD;

  const minDistinctGermanWordsTotal =
    typeof options.minDistinctGermanWordsTotal === "number"
      ? Math.max(0, Math.floor(options.minDistinctGermanWordsTotal))
      : DEFAULT_MIN_GERMAN_WORDS_DISTINCT_TOTAL;

  const dryRun = Boolean(options.dryRun);

  // limit: wie viele Docs maximal prüfen (0 oder nicht gesetzt => ALL)
  const limit =
    typeof options.limit === "number"
      ? Math.max(0, Math.floor(options.limit))
      : 0;

  /**
   * ✅ deletedChannels schreiben an/aus
   * Standard: true
   */
  const writeDeletedChannels =
    typeof options.writeDeletedChannels === "boolean"
      ? options.writeDeletedChannels
      : true;

  emitLog(jobId, "info", "Job gestartet (vorgefiltert → vorgefiltertCode)", {
    deutschArraySize: deutschArray.length,
    badCharArraySize: badCharArray.length,
    maxBadCharsDistinctPerField,
    minDistinctGermanWordsTotal,
    dryRun,
    limit: limit || "ALL",
    writeDeletedChannels,
  });

  emitSnapshot(jobId, { step: "Starte Scan in vorgefiltert" });

  try {
    const totalDocs = await Vorgefiltert.countDocuments();
    const totalPlanned = limit ? Math.min(limit, totalDocs) : totalDocs;

    job.progress.channelsTotal = totalPlanned;
    job.progress.channelsDone = 0;

    job.progress.scanned = 0;
    job.progress.passedCountry = 0;
    job.progress.passedLanguage = 0;
    job.progress.saved = 0;

    job.progress.skippedNotDeutschland = 0;
    job.progress.skippedNotGerman = 0;
    job.progress.skippedBadChars = 0;
    job.progress.skippedKidsHard = 0;

    job.progress.deletedSaved = 0;
    job.progress.errors = 0;

    // ✅ Performance: limit direkt in Query anwenden
    let q = Vorgefiltert.find({}).sort({ _id: 1 });
    if (limit) q = q.limit(limit);
    const cursor = q.cursor();

    /**
     * WICHTIG (Anfänger-Erklärung):
     * - Wir laufen jedes Dokument (jeden Kanal) durch.
     * - Sobald eine Regel "failt", machen wir:
     *   1) in deletedChannels schreiben (wenn aktiviert)
     *   2) continue -> zum nächsten Kanal
     */
    for await (const doc of cursor) {
      job.progress.scanned++;
      job.progress.channelsDone = job.progress.scanned;

      // Damit ein einzelner Kanal den Job NICHT killt:
      try {
        /**
         * ------------------------------------------------------------
         * ✅ NEU: Country-Logik mit Fallback
         * ------------------------------------------------------------
         *
         * Fälle:
         * A) country ist gesetzt UND deutsch (DE/AT/CH etc.) -> normal weiter
         * B) country ist gesetzt UND NICHT deutsch -> raus (wie vorher)
         * C) country fehlt (null/leer/"null") -> NICHT sofort raus:
         *      => erst BadChars + DeutschWords prüfen
         *      => nur wenn diese failen -> raus
         *      => wenn beide ok -> akzeptieren (german via content)
         */

        const countryNorm = getNormalizedCountry(doc); // null oder String
        const countryIsGerman = countryNorm
          ? isGermanCountryValue(countryNorm)
          : false;

        // Wir wollen später speichern, WIE der Kanal als deutsch gewertet wurde:
        // - via Country (A)
        // - via Content-Fallback (C)
        const germanDecision = {
          countryRaw: doc?.channelInfo?.country ?? null,
          countryNormalized: countryNorm,
          acceptedBy: null, // "country" | "content_fallback"
        };

        // B) country gesetzt aber NICHT deutsch -> raus
        if (countryNorm && !countryIsGerman) {
          job.progress.skippedNotDeutschland++;

          emitLog(
            jobId,
            "info",
            "Skip: country ist gesetzt, aber nicht deutsch",
            {
              youtubeId: doc.youtubeId,
              country: countryNorm,
            }
          );

          if (writeDeletedChannels) {
            await recordDeletedChannel({
              jobId,
              doc,
              reason: "country_not_german",
              details: {
                country: countryNorm,
                rule: "country must be one of DE/AT/CH (or germany/austria/switzerland variants)",
              },
            });
            job.progress.deletedSaved++;
          }

          continue;
        }

        // Ab hier: entweder A) country ist deutsch, oder C) country fehlt
        // Wichtig: nonGermanRes und germanRes brauchen wir später für codeCheck.
        let nonGermanRes = null;
        let germanRes = null;

        // 2) BadChars-Check (distinct pro Feld)
        nonGermanRes = nonGermanCharsDistinctPerFieldCheck(
          doc,
          badCharArray,
          maxBadCharsDistinctPerField
        );

        if (!nonGermanRes.ok) {
          job.progress.skippedBadChars++;

          emitLog(
            jobId,
            "info",
            "Skip: zu viele NON_GERMAN_UNICODE_CHARS (distinct) in einem Feld",
            {
              youtubeId: doc.youtubeId,
              maxDistinctPerField: nonGermanRes.maxDistinctPerField,
              matches: nonGermanRes.matches,
              country: countryNorm ?? null,
            }
          );

          if (writeDeletedChannels) {
            await recordDeletedChannel({
              jobId,
              doc,
              reason: countryNorm
                ? "too_many_non_german_chars_distinct_per_field"
                : "country_null_too_many_non_german_chars",
              details: {
                country: countryNorm ?? null,
                maxDistinctPerField: nonGermanRes.maxDistinctPerField,
                matches: nonGermanRes.matches,
              },
            });
            job.progress.deletedSaved++;
          }

          continue;
        }

        // 3) DeutschWords-Check
        germanRes = germanWordsDistinctTotalCheck(
          doc,
          deutschArray,
          minDistinctGermanWordsTotal
        );

        if (!germanRes.ok) {
          job.progress.skippedNotGerman++;

          emitLog(
            jobId,
            "info",
            "Skip: zu wenige deutsche Wörter (distinct) im gesamten Kanaltext",
            {
              youtubeId: doc.youtubeId,
              hitsDistinct: germanRes.hitsDistinct,
              minDistinct: germanRes.minDistinct,
              wordsFoundSample: germanRes.wordsFoundSample,
              country: countryNorm ?? null,
            }
          );

          if (writeDeletedChannels) {
            await recordDeletedChannel({
              jobId,
              doc,
              reason: countryNorm
                ? "too_few_german_words_distinct_total"
                : "country_null_too_few_german_words",
              details: {
                country: countryNorm ?? null,
                hitsDistinct: germanRes.hitsDistinct,
                minDistinct: germanRes.minDistinct,
                wordsFoundSample: germanRes.wordsFoundSample,
              },
            });
            job.progress.deletedSaved++;
          }

          continue;
        }

        /**
         * ✅ WICHTIG: Hier sind wir NUR, wenn:
         * - country deutsch war (A) ODER country null war (C)
         * - UND BadChars + DeutschWords OK sind
         *
         * => Der Kanal gilt jetzt als "deutsch akzeptiert"
         */
        job.progress.passedCountry++;

        if (countryNorm && countryIsGerman) {
          germanDecision.acceptedBy = "country";
        } else {
          // country fehlte -> wir haben über Inhalt entschieden
          germanDecision.acceptedBy = "content_fallback";

          emitLog(
            jobId,
            "info",
            "OK: country fehlt, aber Inhalt ist deutsch → akzeptiert",
            {
              youtubeId: doc.youtubeId,
            }
          );
        }

        // 4) Kids-Inhalt Check
        const kidsDistinctThreshold =
          typeof options.kidsHardDistinctThreshold === "number"
            ? Math.max(0, Math.floor(options.kidsHardDistinctThreshold))
            : 2;

        const kidsRes = kidsHardPhrasesCheck(
          doc,
          KIDS_HARD_PHRASES,
          kidsDistinctThreshold,
          { maxSamplesPerField: 3 }
        );

        if (!kidsRes.ok) {
          job.progress.skippedKidsHard++;

          emitLog(
            jobId,
            "info",
            "Skip: Kids-Inhalt (KIDS_HARD_PHRASES) – zu viele Treffer (distinct)",
            {
              youtubeId: doc.youtubeId,
              hitsDistinct: kidsRes.hitsDistinct,
              rejectIfDistinctGte: kidsDistinctThreshold,
              hitsTotal: kidsRes.hitsTotal,
              matches: kidsRes.matches.slice(0, 25),
              country: countryNorm ?? null,
            }
          );

          if (writeDeletedChannels) {
            await recordDeletedChannel({
              jobId,
              doc,
              reason: "kids_hard_phrases_distinct_threshold_reached",
              details: {
                country: countryNorm ?? null,
                rejectIfDistinctGte: kidsDistinctThreshold,
                hitsDistinct: kidsRes.hitsDistinct,
                hitsTotal: kidsRes.hitsTotal,
                matches: kidsRes.matches,
              },
            });
            job.progress.deletedSaved++;
          }

          continue;
        }

        // ✅ Wenn wir hier sind => Kanal ist "OK" und wird übernommen
        job.progress.passedLanguage++;

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

              // ✅ NEU: Für dich super hilfreich beim Debuggen:
              germanDecision,

              passedRules: [
                // Wichtig: jetzt darf country auch fehlen, solange Inhalt passt
                "country in DE/AT/CH OR (country=null AND contentLooksGerman=true)",
                `nonGermanDistinctPerField<=${maxBadCharsDistinctPerField}`,
                `deutschWordsDistinctTotal>=${minDistinctGermanWordsTotal}`,
                `kidsHardRejectIfDistinctGte=${kidsDistinctThreshold} (found=${kidsRes.hitsDistinct})`,
              ],

              failedReason: "",

              nonGermanCheck: {
                maxDistinctPerField: nonGermanRes.maxDistinctPerField,
                matches: nonGermanRes.matches,
              },

              germanCheck: {
                minDistinct: germanRes.minDistinct,
                hitsDistinct: germanRes.hitsDistinct,
                wordsFoundSample: germanRes.wordsFoundSample,
              },

              kidsHardCheck: {
                rule: {
                  rejectIfDistinctGte: kidsDistinctThreshold,
                  passIfDistinctLt: kidsDistinctThreshold,
                },
                distinctThreshold: kidsRes.distinctThreshold,
                hitsDistinct: kidsRes.hitsDistinct,
                hitsTotal: kidsRes.hitsTotal,
                matches: kidsRes.matches,
              },
            },
          };

          await VorgefiltertCode.findOneAndUpdate(
            { youtubeId: doc.youtubeId },
            { $set: outDoc },
            { upsert: true }
          );
        }

        job.progress.saved++;

        if (job.progress.scanned % 25 === 0) {
          emitSnapshot(jobId, {
            step: `Scanne & filtere (${job.progress.scanned}/${totalPlanned})`,
            stats: { ...job.progress },
          });
        }
      } catch (perDocErr) {
        job.progress.errors++;

        emitLog(jobId, "warn", "Fehler bei Dokument-Verarbeitung (skip)", {
          youtubeId: doc?.youtubeId ?? null,
          error: String(perDocErr?.message || perDocErr),
        });

        if (writeDeletedChannels) {
          await recordDeletedChannel({
            jobId,
            doc,
            reason: "processing_error",
            details: { error: String(perDocErr?.message || perDocErr) },
          });
          job.progress.deletedSaved++;
        }

        continue;
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
// Collections API (vorgefiltert + vorgefiltertCode + deletedChannels)
// ---------------------------------------------------------------------------
app.get("/api/collections", async (req, res) => {
  try {
    await connectDb();
    const countVorgefiltert = await Vorgefiltert.countDocuments();
    const countVorgefiltertCode = await VorgefiltertCode.countDocuments();
    const countDeleted = await DeletedChannel.countDocuments();

    return res.json({
      ok: true,
      collections: {
        vorgefiltert: countVorgefiltert,
        vorgefiltertCode: countVorgefiltertCode,
        deletedChannels: countDeleted,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

function getCollectionModelByName(name) {
  if (name === "vorgefiltert") return Vorgefiltert;
  if (name === "vorgefiltertCode") return VorgefiltertCode;
  if (name === "deletedChannels") return DeletedChannel;
  return null;
}

/**
 * GET /api/collection/:name?limit=100&skip=0&q=...
 * -> LISTE (schnell, ohne videos + ohne description)
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
        { lastReason: { $regex: q, $options: "i" } },
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

        codeCheck: 1,

        lastReason: 1,
        timesSkipped: 1,
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

        lastReason: 1,
        lastDetails: 1,
        timesSkipped: 1,
        updatedAt: 1,
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
// Statische Dateien
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
