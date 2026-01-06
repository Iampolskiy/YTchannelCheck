// lib/youtubeInitialData.js
//
// Aufgaben:
// 1) ytInitialData aus HTML extrahieren
// 2) Channel-Infos extrahieren (Titel, Beschreibung, Land, …)
// 3) AUS DEM /videos-TAB: Video-Liste extrahieren
//
// WICHTIG:
// - YouTube ändert Strukturen. Darum defensiv.
// - Country ist manchmal NICHT in metadata.channelMetadataRenderer.country,
//   sondern irgendwo in Panels, häufig unter aboutChannelViewModel.country.
//
// Diese Datei ist ESM (type: module).

export function extractYtInitialData(html) {
  const markerVariants = [
    "var ytInitialData =",
    'window["ytInitialData"] =',
    "window['ytInitialData'] =",
    "ytInitialData =",
  ];

  let idx = -1;
  for (const marker of markerVariants) {
    idx = html.indexOf(marker);
    if (idx !== -1) break;
  }
  if (idx === -1) return null;

  // Wir suchen ab dem Marker das erste "{"
  const start = html.indexOf("{", idx);
  if (start === -1) return null;

  // Danach laufen wir Zeichen für Zeichen und zählen Klammern,
  // damit wir genau das passende JSON-Objekt finden.
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const jsonText = html.slice(start, i + 1);
        try {
          return JSON.parse(jsonText);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

// YouTube-Textobjekte (simpleText / runs) zu String machen
function extractTextMaybe(v) {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;

  if (typeof v?.simpleText === "string") {
    const t = v.simpleText.trim();
    return t || null;
  }

  if (Array.isArray(v?.runs)) {
    const t = v.runs
      .map((r) => r?.text || "")
      .join("")
      .trim();
    return t || null;
  }

  return null;
}

/**
 * Robuster Country-Extractor
 *
 * 1) Erst die einfache Stelle: metadata.channelMetadataRenderer.country
 * 2) Wenn leer: Deep-Search nach aboutChannelViewModel.country
 *
 * Vorteil:
 * - Du codierst NICHT den Monster-Pfad fix,
 * - sondern findest das Feld, egal wo im Panel es gerade hängt.
 */
function extractCountryFromYtInitialData(ytData) {
  const metaCountry = extractTextMaybe(
    ytData?.metadata?.channelMetadataRenderer?.country
  );
  if (metaCountry) return metaCountry;

  const root = ytData;
  if (!root || typeof root !== "object") return null;

  const stack = [root];
  const seen = new Set();

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    if (seen.has(cur)) continue;
    seen.add(cur);

    const acvm = cur?.aboutChannelViewModel;
    if (acvm && typeof acvm === "object") {
      const c = extractTextMaybe(acvm.country);
      if (c) return c;
    }

    if (Array.isArray(cur)) {
      for (const v of cur) {
        if (v && typeof v === "object") stack.push(v);
      }
    } else {
      for (const v of Object.values(cur)) {
        if (v && typeof v === "object") stack.push(v);
      }
    }
  }

  return null;
}

// Extrahiert allgemeine Kanal-Infos aus ytInitialData
export function extractChannelInfoFromYtInitialData(ytData) {
  const meta = ytData?.metadata?.channelMetadataRenderer;
  if (!meta) {
    throw new Error(
      "channelMetadataRenderer nicht gefunden. YouTube hat die Struktur geändert oder die Seite ist nicht vollständig geladen."
    );
  }

  const header =
    ytData?.header?.c4TabbedHeaderRenderer ||
    ytData?.header?.pageHeaderRenderer ||
    null;

  const description =
    typeof meta.description === "string"
      ? meta.description
      : extractTextMaybe(meta.description);

  const subscriberCountText = extractTextMaybe(header?.subscriberCountText);

  const avatarThumbs = meta.avatar?.thumbnails ?? [];
  const avatarUrl =
    avatarThumbs.length > 0 ? avatarThumbs[avatarThumbs.length - 1].url : null;

  const channelUrl = meta.channelUrl ?? null;
  const vanityUrl = meta.vanityChannelUrl ?? null;

  // Handle aus vanityChannelUrl ableiten (wenn vorhanden)
  let handle = null;
  if (typeof vanityUrl === "string" && vanityUrl.includes("@")) {
    const parts = vanityUrl.split("@");
    const namePart = parts[1];
    if (namePart) handle = `@${namePart}`;
  }

  const country = extractCountryFromYtInitialData(ytData);

  return {
    id: meta.externalId ?? null,
    title: meta.title ?? null,
    handle,
    url: channelUrl,
    description: description ?? null,
    avatar: avatarUrl,
    keywords: Array.isArray(meta.keywords) ? meta.keywords : [],
    subscriberCountText: subscriberCountText ?? null,
    country: country ?? null,
    isFamilySafe: meta.isFamilySafe ?? null,
  };
}

// Videos aus dem /videos-Tab extrahieren
export function extractVideosFromYtVideosInitialData(ytData, limit = 30) {
  const tabs = ytData?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  if (!Array.isArray(tabs) || tabs.length === 0) return [];

  const videosTab =
    tabs.find((tab) => {
      const titleLower = tab?.tabRenderer?.title?.toLowerCase?.();
      const selected = tab?.tabRenderer?.selected;

      return (
        selected === true ||
        (typeof titleLower === "string" &&
          (titleLower.includes("videos") ||
            titleLower.includes("uploads") ||
            titleLower.includes("alle videos")))
      );
    }) || tabs[0];

  let contents =
    videosTab?.tabRenderer?.content?.richGridRenderer?.contents ?? [];

  // Fallback: Manche Layouts nutzen sectionListRenderer
  if (!Array.isArray(contents) || contents.length === 0) {
    const sections =
      videosTab?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];

    for (const section of sections) {
      const items = section?.itemSectionRenderer?.contents ?? [];
      for (const it of items) {
        const grid = it?.richGridRenderer?.contents ?? [];
        if (Array.isArray(grid) && grid.length) {
          contents = grid;
          break;
        }
      }
      if (contents.length) break;
    }
  }

  if (!Array.isArray(contents) || contents.length === 0) return [];

  const videos = [];

  for (const item of contents) {
    const v = item?.richItemRenderer?.content?.videoRenderer;
    if (!v) continue;

    const videoId = v.videoId ?? null;
    const title = extractTextMaybe(v.title);

    const descriptionParts = [];
    const ds1 = extractTextMaybe(v.descriptionSnippet);
    if (ds1) descriptionParts.push(ds1);

    if (Array.isArray(v.detailedMetadataSnippets)) {
      for (const snip of v.detailedMetadataSnippets) {
        const t = extractTextMaybe(snip?.snippetText);
        if (t) descriptionParts.push(t);
      }
    }

    const descriptionText =
      descriptionParts.filter(Boolean).join(" | ").trim() || null;

    videos.push({
      id: videoId,
      title: title ?? null,
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
      publishedText: extractTextMaybe(v.publishedTimeText) ?? null,
      viewsText: extractTextMaybe(v.viewCountText) ?? null,
      durationText: extractTextMaybe(v.lengthText) ?? null,
      description: descriptionText,
    });

    if (videos.length >= limit) break;
  }

  return videos;
}
