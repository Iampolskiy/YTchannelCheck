import { getTextsToCheck } from "./_textFields.js";

function scanDistinctBadCharsInText(text, badSet) {
  const found = new Set();
  for (const ch of String(text || "")) {
    if (badSet.has(ch)) found.add(ch);
  }
  return { distinctCount: found.size, chars: Array.from(found) };
}

export function nonGermanCharsDistinctPerFieldCheck(
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
