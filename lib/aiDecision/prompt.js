// lib/aiDecision/prompt.js (ESM)

import fs from "fs/promises";
import path from "path";

export const DEFAULT_PROMPT_FILE = path.join(
  process.cwd(),
  "lib",
  "config",
  "aiPrompt.de.txt"
);

export async function loadPromptText(promptFile) {
  const p = String(promptFile || "").trim() || DEFAULT_PROMPT_FILE;
  const txt = await fs.readFile(p, "utf-8");
  return { promptFile: p, promptText: txt };
}

export function fillPromptTemplate(promptText, channelPayload) {
  const tpl = String(promptText || "");
  const json = JSON.stringify(channelPayload ?? null, null, 2);
  return tpl.replace("{{CHANNEL_JSON}}", json);
}

