/* import { buildChannelContentText } from "./_textFields.js"; */
import { buildChannelContentText, tokenizeText } from "../utils/channelText.js";

export function germanWordsDistinctTotalCheck(
  doc,
  deutschArray,
  minDistinct = 3
) {
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
