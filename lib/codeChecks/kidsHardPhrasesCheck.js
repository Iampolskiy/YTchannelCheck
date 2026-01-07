// lib/codeChecks/kidsHardPhrases.js
//
// Zweck:
// - Scannt den Kanaltext (Titel, Beschreibung, Videotitel)
//   nach Phrasen aus KIDS_HARD_PHRASES (case-insensitive).
// - Liefert einen Report zurück:
//   - welche Phrase
//   - wo (in welchem Feld)
//   - wie oft (count)
//   - kurze Ausschnitte (samples)
// - Entscheidet ok / not ok anhand distinctThreshold.
//
// Hinweis:
// - Wir unterscheiden NICHT strikt "Wort" vs "Phrase" über Boundaries,
//   weil deine Liste viele zusammengesetzte Begriffe und feste Phrasen enthält.
//   Wir machen robustes "Substring match" case-insensitive.
// - Wenn du später "kids" nur als ganzes Wort matchen willst, kann man das
//   mit Unicode-Wortgrenzen erweitern.

function normalizeText(s) {
  return String(s || "").toLowerCase();
}

// Regex-escape, damit Sonderzeichen aus Phrasen nicht Regex kaputt machen
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Liefert alle Textfelder, die geprüft werden sollen
function getTextsToCheck(doc) {
  const channelTitle = String(doc?.channelInfo?.title || "");
  const channelDescription = String(doc?.channelInfo?.description || "");
  const videoTitles = Array.isArray(doc?.videos)
    ? doc.videos.map((v) => String(v?.title || ""))
    : [];
  return { channelTitle, channelDescription, videoTitles };
}

// Kleine Helper: Samples aus Text holen (um zu sehen "wie" es vorkam)
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
    // Schutz gegen Zero-length matches (sollte hier nicht passieren)
    if (re.lastIndex === idx) re.lastIndex++;
  }

  return samples;
}

/**
 * kidsHardPhrasesCheck(doc, phrasesArray, distinctThreshold, opts)
 *
 * distinctThreshold:
 * - Wenn >= distinctThreshold verschiedene Phrasen gefunden wurden => ok=false
 */
export function kidsHardPhrasesCheck(
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

  // matchesMap: phrase -> aggregiertes Ergebnis
  const matchesMap = new Map();

  let hitsTotal = 0;

  for (const phrase of phrases) {
    const phraseNorm = normalizeText(phrase);
    if (!phraseNorm) continue;

    // Case-insensitive, global
    // Wir matchen auf Originaltext, aber Regex ist /gi
    const re = new RegExp(escapeRegex(phraseNorm), "gi");

    let phraseHitsTotal = 0;
    const perField = [];

    for (const f of fields) {
      const original = String(f.text || "");
      if (!original) continue;

      const hay = normalizeText(original);
      if (!hay.includes(phraseNorm)) continue; // schneller Vorfilter

      // Count: wie oft im Feld?
      let count = 0;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(hay))) {
        count++;
        if (re.lastIndex === m.index) re.lastIndex++; // safety
      }

      if (count > 0) {
        phraseHitsTotal += count;

        // Samples: aus dem ORIGINALTEXT, damit du es in echt lesen kannst
        // Dazu brauchen wir einen Regex auf Originaltext (case-insensitive)
        const reOriginal = new RegExp(escapeRegex(phrase), "gi");
        const samples = buildSamples(original, reOriginal, maxSamplesPerField);

        perField.push({
          field: f.field,
          count,
          samples,
        });
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

  // Regel: ab X verschiedenen Kids-Phrasen => nicht ok
  const ok = hitsDistinct < threshold;

  return {
    ok,
    distinctThreshold: threshold,
    hitsDistinct,
    hitsTotal,
    matches,
  };
}
