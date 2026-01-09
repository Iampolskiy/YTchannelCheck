// lib/codeChecks/addictionHardPhrasesCheck.js
// Identisch zur Kids-Logik, nur anderer Name.
// Zweck:
// - Scannt Titel/Beschreibung/Video-Titel nach ADDICTION_HARD_PHRASES
// - Entscheidet ok / not ok anhand distinctThreshold

import { getTextsToCheck } from "./_textFields.js";

function normalizeText(s) {
  return String(s || "").toLowerCase();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSamples(text, re, maxSamples = 3, window = 40) {
  const samples = [];
  const s = String(text || "");
  if (!s) return samples;

  let m;
  re.lastIndex = 0;

  while ((m = re.exec(s)) && samples.length < maxSamples) {
    const idx = m.index ?? 0;
    const start = Math.max(0, idx - window);
    const end = Math.min(s.length, idx + String(m[0]).length + window);
    samples.push(s.slice(start, end));
    if (re.lastIndex === idx) re.lastIndex++;
  }

  return samples;
}

export function addictionHardPhrasesCheck(
  doc,
  phrasesArray,
  distinctThreshold = 2,
  opts = {}
) {
  const phrases = Array.isArray(phrasesArray)
    ? phrasesArray.map((p) => String(p || "").trim()).filter(Boolean)
    : [];

  const threshold = Math.max(0, Math.floor(distinctThreshold));

  const maxSamplesPerField =
    typeof opts.maxSamplesPerField === "number"
      ? Math.max(0, Math.floor(opts.maxSamplesPerField))
      : 3;

  const { channelTitle, channelDescription, videoTitles } =
    getTextsToCheck(doc);

  const fields = [
    { field: "channelInfo.title", text: channelTitle },
    { field: "channelInfo.description", text: channelDescription },
    ...videoTitles.map((t, i) => ({ field: `videos[${i}].title`, text: t })),
  ];

  const matchesMap = new Map();
  let hitsTotal = 0;

  for (const phrase of phrases) {
    const phraseNorm = normalizeText(phrase);
    if (!phraseNorm) continue;

    const re = new RegExp(escapeRegex(phraseNorm), "gi");

    let phraseHitsTotal = 0;
    const perField = [];

    for (const f of fields) {
      const original = String(f.text || "");
      if (!original) continue;

      const hay = normalizeText(original);
      if (!hay.includes(phraseNorm)) continue;

      let count = 0;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(hay))) {
        count++;
        if (re.lastIndex === m.index) re.lastIndex++;
      }

      if (count > 0) {
        phraseHitsTotal += count;

        const reOriginal = new RegExp(escapeRegex(phrase), "gi");
        const samples = buildSamples(original, reOriginal, maxSamplesPerField);

        perField.push({ field: f.field, count, samples });
      }
    }

    if (phraseHitsTotal > 0) {
      hitsTotal += phraseHitsTotal;
      matchesMap.set(phrase, {
        phrase,
        hitsTotalInChannel: phraseHitsTotal,
        fields: perField,
      });
    }
  }

  const matches = Array.from(matchesMap.values()).sort(
    (a, b) => b.hitsTotalInChannel - a.hitsTotalInChannel
  );

  const hitsDistinct = matches.length;

  // Regel: ab X verschiedenen Phrasen => nicht ok
  const ok = hitsDistinct < threshold;

  return { ok, distinctThreshold: threshold, hitsDistinct, hitsTotal, matches };
}
