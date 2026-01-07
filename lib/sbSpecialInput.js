// lib/sbSpecialInput.js (ESM)
import fs from "fs/promises";
import path from "path";

function normalizeYoutubeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return null;
  return u.replace(/\/+$/, "");
}

function extractHandleFromLine(line) {
  const s = String(line || "").trim();
  if (!s) return null;

  // 1) socialblade handle url: .../youtube/handle/<name>
  {
    const m = s.match(
      /socialblade\.com\/youtube\/handle\/([a-zA-Z0-9._-]{3,})/i
    );
    if (m?.[1]) return m[1];
  }

  // 2) youtube handle url: youtube.com/@name
  {
    const m = s.match(/youtube\.com\/@([a-zA-Z0-9._-]{3,})/i);
    if (m?.[1]) return m[1];
  }

  // 3) CSV: "https://socialblade.../handle/name", "name", "-"
  // Wir nehmen als Fallback das 2. Feld, wenn es wie ein Handle aussieht
  {
    const parts = s.split(",").map((p) => p.trim().replace(/^"+|"+$/g, "")); // trims quotes

    if (parts.length >= 2) {
      const candidate = parts[1];
      if (/^[a-zA-Z0-9._-]{3,}$/.test(candidate)) return candidate;
    }
  }

  return null;
}

export async function loadChannelsFromSbLinkFolder({
  dirPath,
  emitLog,
  jobId,
}) {
  const abs = path.resolve(dirPath);
  const entries = await fs.readdir(abs, { withFileTypes: true });

  const files = entries
    .filter((e) => e.isFile())
    .map((e) => path.join(abs, e.name));

  const seen = new Set();
  const channels = [];

  let linesRead = 0;
  let skippedLines = 0;

  for (const filePath of files) {
    const filename = path.basename(filePath);

    let text = "";
    try {
      text = await fs.readFile(filePath, "utf-8");
    } catch (e) {
      emitLog?.(jobId, "warn", "Konnte Datei nicht lesen (inputYT)", {
        filename,
        error: String(e?.message || e),
      });
      continue;
    }

    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      linesRead++;
      const handle = extractHandleFromLine(line);
      if (!handle) {
        skippedLines++;
        continue;
      }

      const youtubeHandle = `@${handle}`;
      if (seen.has(youtubeHandle)) continue;
      seen.add(youtubeHandle);

      channels.push({
        youtubeId: null,
        youtubeHandle,
        youtubeUrl: normalizeYoutubeUrl(
          `https://www.youtube.com/${youtubeHandle}`
        ),
      });
    }
  }

  const summary = {
    dirPath: abs,
    filesCount: files.length,
    linesRead,
    channelsFound: channels.length,
    skippedLines,
  };

  emitLog?.(jobId, "info", "inputYT geladen", summary);

  return { channels, summary };
}
