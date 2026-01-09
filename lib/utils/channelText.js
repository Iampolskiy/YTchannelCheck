// lib/utils/channelText.js
//
// Zweck:
// - buildChannelContentText(doc): baut den gesamten Kanaltext aus title/description/videoTitles
// - tokenizeText(text): macht daraus ein Set von DISTINCT Tokens (lowercased, Unicode-sicher)
//
// Hinweis:
// - tokenizeText nutzt Unicode Property Escapes (\p{L}\p{N}) -> braucht Node mit Unicode-RegExp Support (Node 14+ ist ok)

export function buildChannelContentText(doc) {
  const title = doc?.channelInfo?.title || "";
  const desc = doc?.channelInfo?.description || "";

  const videoTitles = Array.isArray(doc?.videos)
    ? doc.videos.map((v) => v?.title || "").join(" ")
    : "";

  return `${title}\n${desc}\n${videoTitles}`.trim();
}

/**
 * tokenizeText(text)
 * - lowercased
 * - split bei allem, was kein Buchstabe/Zahl ist (Unicode-sicher)
 * - liefert Set => "distinct tokens"
 */
export function tokenizeText(text) {
  const t = String(text || "").toLowerCase();
  const parts = t.split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
  return new Set(parts);
}
