// lib/countryFromAboutHtml.js (ESM)
//
// Ziel: Im serverseitig geholten /about HTML prüfen,
// ob "privacy_public" + das Land als Text schon im HTML steckt.
//
// Rückgabe ist bewusst Debug-lastig, damit du sofort siehst,
// ob der HTML-Weg überhaupt möglich ist.

function stripTags(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickLikelyCountry(text) {
  if (!text) return null;

  // Oft sieht das so aus: "Land Kolumbien" oder "Country Colombia"
  // Wir nehmen die letzte sinnvolle "Wortgruppe" als Kandidat.
  const t = text
    .replace(/\s+/g, " ")
    .replace(/\b(Land|Country)\b/gi, "")
    .trim();

  // Heuristik: letztes Wort/letzte Phrase nach Doppelpunkt
  const parts = t
    .split(":")
    .map((x) => x.trim())
    .filter(Boolean);
  const candidate = parts.length ? parts[parts.length - 1] : t;

  // Noch etwas säubern
  const c = candidate.replace(/^[\-\–\—\|]+/, "").trim();
  if (!c) return null;

  // Zu kurze Dinge wegwerfen
  if (c.length < 3) return null;

  return c;
}

export function probeCountryFromAboutHtml(aboutHtml) {
  const html = String(aboutHtml || "");
  const len = html.length;

  // Marker, der im DOM vorkommt (dein Selector basiert darauf)
  const marker1 = 'icon="privacy_public"';
  const marker2 = "privacy_public";

  const hasIconAttr = html.includes(marker1);
  const hasMarker = hasIconAttr || html.includes(marker2);

  if (!hasMarker) {
    return {
      ok: false,
      reason:
        "Marker privacy_public nicht im HTML → vermutlich client-side gerendert",
      htmlLength: len,
      hasIconAttr,
      hasMarker,
      raw: null,
      method: null,
    };
  }

  // Wir suchen rund um den Marker einen <tr>...</tr> Block
  const idx = hasIconAttr ? html.indexOf(marker1) : html.indexOf(marker2);
  const windowStart = Math.max(0, idx - 5000);
  const windowEnd = Math.min(len, idx + 15000);
  const chunk = html.slice(windowStart, windowEnd);

  // Versuch 1: TR-Block um privacy_public
  const trMatch = chunk.match(
    /<tr\b[^>]*>[\s\S]*?privacy_public[\s\S]*?<\/tr>/i
  );
  if (trMatch) {
    const trText = stripTags(trMatch[0]);
    const raw = pickLikelyCountry(trText);
    return {
      ok: Boolean(raw),
      reason: raw
        ? null
        : "TR gefunden, aber Land nicht eindeutig extrahierbar",
      htmlLength: len,
      hasIconAttr,
      hasMarker,
      raw,
      method: "tr-regex",
      debugText: trText.slice(0, 300), // nur ein Preview
    };
  }

  // Versuch 2: einfach Text-Umfeld um Marker
  const plain = stripTags(chunk);
  const raw2 = pickLikelyCountry(plain);
  return {
    ok: Boolean(raw2),
    reason: raw2
      ? null
      : "Marker im HTML, aber weder TR-Block noch Kandidat gefunden",
    htmlLength: len,
    hasIconAttr,
    hasMarker,
    raw: raw2,
    method: "text-window",
    debugText: plain.slice(0, 300),
  };
}
