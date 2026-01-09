// lib/codeChecks/descriptionNotEmptyCheck.js
//
// Regel:
// - Wenn channelInfo.description leer/whitespace/"null"/null ist -> ok=false
// - Optional: Mindestlänge (minChars), damit " ." nicht reicht

function normalizeDescription(raw) {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  // whitespace normalisieren
  return s.replace(/\s+/g, " ").trim();
}

export function descriptionNotEmptyCheck(doc, opts = {}) {
  const minChars =
    typeof opts.minChars === "number"
      ? Math.max(1, Math.floor(opts.minChars))
      : 1;

  const normalized = normalizeDescription(doc?.channelInfo?.description);
  const length = normalized.length;

  const ok = length >= minChars;

  return {
    ok,
    minChars,
    length,
    sample: normalized.slice(0, 140),
  };
}
