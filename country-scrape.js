#!/usr/bin/env node
/**
 * country-scrape.mjs
 *
 * Usage:
 *   node country-scrape.mjs UCNb8Aq7jNrGd1z1c3RQzptw
 *   node country-scrape.mjs https://www.youtube.com/channel/UCNb8Aq7jNrGd1z1c3RQzptw/about
 *
 * Optional:
 *   node country-scrape.mjs UC... --out result.json
 *
 * Hinweis: YouTube kann Daten je nach Region/Consent/Logged-out Status unterschiedlich ausliefern.
 */

import fs from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "Usage: node country-scrape.mjs <channelId|url> [--out file.json]"
  );
  process.exit(1);
}

const outIdx = args.indexOf("--out");
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
const input = args[0];

function toAboutUrl(x) {
  if (/^https?:\/\//i.test(x)) {
    // Wenn URL ohne /about kommt: /about anhängen
    if (x.includes("/about")) return x;
    if (x.includes("/channel/")) return x.replace(/\/$/, "") + "/about";
    return x; // fallback
  }
  // Channel-ID
  return `https://www.youtube.com/channel/${x}/about`;
}

function extractTextMaybe(v) {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v?.simpleText === "string") return v.simpleText.trim() || null;
  if (Array.isArray(v?.runs)) {
    const t = v.runs
      .map((r) => r?.text || "")
      .join("")
      .trim();
    return t || null;
  }
  return null;
}

function normalizeCountryToIso2(txt) {
  const v = extractTextMaybe(txt);
  if (!v) return null;

  // Wenn es schon ISO2 ist
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();

  const map = {
    Germany: "DE",
    Deutschland: "DE",
    Austria: "AT",
    Österreich: "AT",
    Switzerland: "CH",
    Schweiz: "CH",
    France: "FR",
    Frankreich: "FR",
    Italy: "IT",
    Italien: "IT",
    Spain: "ES",
    Spanien: "ES",
    Poland: "PL",
    Polen: "PL",
    Turkey: "TR",
    Türkei: "TR",
    "United States": "US",
    USA: "US",
    "United Kingdom": "GB",
    UK: "GB",
  };
  return map[v] ?? null;
}

function isSuspiciousPath(pathStr) {
  // Wir wollen NICHT client.gl/context.gl (das ist oft nur Geo/Locale),
  // sondern wirklich das Kanal-Land.
  const p = (pathStr || "").toLowerCase();
  return (
    p.includes(".context.") ||
    p.includes(".client.") ||
    p.includes(".request.") ||
    p.includes("adsignals") ||
    p.includes("playback") ||
    p.includes("attestation") ||
    p.includes("serviceintegrity")
  );
}

function deepFindCountryLike(obj, keys = ["country", "location"]) {
  const stack = [{ v: obj, path: "$" }];
  const seen = new Set();
  const hits = [];

  while (stack.length) {
    const { v, path } = stack.pop();
    if (!v || typeof v !== "object") continue;

    if (seen.has(v)) continue;
    seen.add(v);

    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++)
        stack.push({ v: v[i], path: `${path}[${i}]` });
      continue;
    }

    for (const [k, val] of Object.entries(v)) {
      const nextPath = `${path}.${k}`;
      if (keys.includes(String(k).toLowerCase())) {
        const t = extractTextMaybe(val);
        if (t && !isSuspiciousPath(nextPath))
          hits.push({ raw: t, path: nextPath });
      }
      if (val && typeof val === "object")
        stack.push({ v: val, path: nextPath });
    }
  }

  hits.sort((a, b) => (b.raw?.length || 0) - (a.raw?.length || 0));
  return hits[0] ?? null;
}

function extractCountryFromYtInitialData(ytData) {
  if (!ytData) return { found: false, raw: null, iso2: null, source: null };

  const a = ytData?.metadata?.channelMetadataRenderer?.country;
  const tA = extractTextMaybe(a);
  if (tA)
    return {
      found: true,
      raw: tA,
      iso2: normalizeCountryToIso2(tA),
      source: "metadata.channelMetadataRenderer.country",
    };

  const b = ytData?.microformat?.microformatDataRenderer?.country;
  const tB = extractTextMaybe(b);
  if (tB)
    return {
      found: true,
      raw: tB,
      iso2: normalizeCountryToIso2(tB),
      source: "microformat.microformatDataRenderer.country",
    };

  const hit = deepFindCountryLike(ytData, ["country", "location"]);
  if (hit?.raw)
    return {
      found: true,
      raw: hit.raw,
      iso2: normalizeCountryToIso2(hit.raw),
      source: hit.path,
    };

  return { found: false, raw: null, iso2: null, source: null };
}

/**
 * ytInitialData aus HTML robust extrahieren:
 * - findet "var ytInitialData = { ... };" oder "window[\"ytInitialData\"] = {...};"
 * - extrahiert das Objekt via Brace-Matching (ohne eval)
 */
function findYtInitialDataJson(html) {
  const markers = [
    "var ytInitialData =",
    'window["ytInitialData"] =',
    "window['ytInitialData'] =",
    "ytInitialData =",
  ];

  let start = -1;
  let marker = null;

  for (const m of markers) {
    const idx = html.indexOf(m);
    if (idx !== -1) {
      start = idx + m.length;
      marker = m;
      break;
    }
  }
  if (start === -1)
    return {
      ok: false,
      reason: "ytInitialData marker not found",
      marker: null,
      jsonText: null,
    };

  // skip spaces
  while (start < html.length && /\s/.test(html[start])) start++;

  // must start with '{'
  if (html[start] !== "{") {
    return {
      ok: false,
      reason: "marker found but object does not start with {",
      marker,
      jsonText: null,
    };
  }

  let i = start;
  let depth = 0;
  let inStr = false;
  let strCh = null;
  let esc = false;

  for (; i < html.length; i++) {
    const ch = html[i];

    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === strCh) {
        inStr = false;
        strCh = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = true;
      strCh = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const jsonText = html.slice(start, i + 1);
        return { ok: true, reason: null, marker, jsonText };
      }
    }
  }

  return { ok: false, reason: "brace matching failed", marker, jsonText: null };
}

async function main() {
  const url = toAboutUrl(input);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  const html = await res.text();

  const found = findYtInitialDataJson(html);
  let ytData = null;
  let parseError = null;

  if (found.ok) {
    try {
      ytData = JSON.parse(found.jsonText);
    } catch (e) {
      parseError = String(e?.message || e);
    }
  }

  const country = extractCountryFromYtInitialData(ytData);

  const output = {
    input,
    url,
    httpStatus: res.status,
    ytInitialDataFound: found.ok,
    ytInitialDataMarker: found.marker,
    ytInitialDataParseError: parseError,
    country,
  };

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf8");
  }

  // ✅ Das ist die “Ausgabe”, die du willst: direkt, sauber, kein SSE.
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
