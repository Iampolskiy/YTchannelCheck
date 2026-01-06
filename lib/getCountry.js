// lib/getCountry.js (ESM)
// Zweck: Country aus /about HTML extrahieren
// Strategie:
// 1) ytInitialData -> metadata.channelMetadataRenderer.country (falls vorhanden)
// 2) fallback: HTML-Scrape um yt-icon[icon="privacy_public"] herum (tr-Text)

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

function deepFindFirstTextByKey(obj, keyName) {
  const target = String(keyName).toLowerCase();
  const stack = [obj];
  const seen = new Set();

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    if (Array.isArray(cur)) {
      for (const it of cur) stack.push(it);
      continue;
    }

    for (const [k, v] of Object.entries(cur)) {
      if (String(k).toLowerCase() === target) {
        const txt = extractTextMaybe(v);
        if (txt) return txt;
      }
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

function normalizeCountryText(txt) {
  if (!txt) return null;
  return (
    String(txt)
      .replace(/\s*\(.*?\)\s*/g, "")
      .trim() || null
  );
}

function stripHtmlTags(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 1) Versuch: aus ytInitialData
export function extractCountryFromYtInitialData(ytData) {
  const metaCountry = ytData?.metadata?.channelMetadataRenderer?.country;
  const raw1 = extractTextMaybe(metaCountry);
  if (raw1) return normalizeCountryText(raw1);

  // Fallback: irgendwo "country"
  const found = deepFindFirstTextByKey(ytData, "country");
  if (found) return normalizeCountryText(found);

  // optional: irgendwo "location"
  const foundLoc = deepFindFirstTextByKey(ytData, "location");
  if (foundLoc) return normalizeCountryText(foundLoc);

  return null;
}

// 2) Versuch: aus HTML um privacy_public icon herum
export function scrapeCountryFromAboutHtml(html) {
  const marker = 'icon="privacy_public"';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  // suche nächstes <tr ...> davor
  const trStart = html.lastIndexOf("<tr", idx);
  if (trStart === -1) return null;

  const trEnd = html.indexOf("</tr>", idx);
  if (trEnd === -1) return null;

  const trHtml = html.slice(trStart, trEnd + 5);
  const text = stripHtmlTags(trHtml);

  // häufig steht da wirklich nur das Land, manchmal aber mehr -> nimm den letzten "Token"
  // (konservativ: wenn Text sehr lang ist, lieber null zurück als Müll speichern)
  if (!text) return null;
  if (text.length > 80) return null;

  return normalizeCountryText(text);
}

// High-level: gib Country + Quelle zurück
export function extractCountryFromAbout({ aboutHtml, aboutYtData }) {
  const fromJson = aboutYtData
    ? extractCountryFromYtInitialData(aboutYtData)
    : null;
  if (fromJson) return { country: fromJson, source: "ytInitialData" };

  const fromHtml = aboutHtml ? scrapeCountryFromAboutHtml(aboutHtml) : null;
  if (fromHtml) return { country: fromHtml, source: "htmlScrape" };

  return { country: null, source: null };
}
