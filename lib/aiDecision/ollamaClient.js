// lib/aiDecision/ollamaClient.js (ESM)

function safeParseJsonText(raw) {
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text) {
  const t = String(text || "");
  const m = t.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

/**
 * Ruft Ollama native Chat API auf:
 * POST {baseUrl}/api/chat
 * - stream=false, damit wir direkt JSON bekommen
 * - Erwartet: message.content => JSON Text mit decision/reason
 */
export async function ollamaDecision({ baseUrl, model, prompt }) {
  const host = String(baseUrl || "").trim() || "http://127.0.0.1:11434";
  const url = host.replace(/\/+$/, "") + "/api/chat";

  const modelName = String(model || "").trim();
  if (!modelName) throw new Error("Kein Modellname gesetzt (leer).");

  const basePayload = {
    model: modelName,
    stream: false,
    // ✅ Stabiler/konstanter: weniger "kreative" Antworten
    options: { temperature: 0 },
    messages: [
      {
        role: "system",
        content:
          'Antworte NUR mit validem JSON: {"decision":"positiv"|"negativ","reason":"...","evidence":[{"field":"...","quote":"..."}]}',
      },
      { role: "user", content: String(prompt || "") },
    ],
  };

  async function doRequest(payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    return { res, data };
  }

  // 1) Versuch: JSON erzwingen (falls Ollama-Version das unterstützt)
  let attempt = await doRequest({ ...basePayload, format: "json" });

  // 2) Fallback: falls "format" nicht unterstützt, nochmal ohne
  if (!attempt.res.ok) {
    const errText = String(attempt.data?.error || "");
    const looksLikeUnsupportedFormat =
      errText.toLowerCase().includes("unknown field") &&
      errText.toLowerCase().includes("format");
    if (looksLikeUnsupportedFormat) {
      attempt = await doRequest(basePayload);
    }
  }

  if (!attempt.res.ok) {
    throw new Error(
      attempt.data?.error || `Ollama Fehler (HTTP ${attempt.res.status})`
    );
  }

  const text = attempt.data?.message?.content ?? "";
  const parsed =
    safeParseJsonText(text) ||
    safeParseJsonText(extractFirstJsonObject(text) || "");

  const decision = String(parsed?.decision || "")
    .trim()
    .toLowerCase();
  const reason = String(parsed?.reason || "").trim();
  const evidenceRaw = parsed?.evidence;
  const evidence = Array.isArray(evidenceRaw)
    ? evidenceRaw
        .map((e) => ({
          field: String(e?.field || "").trim(),
          quote: String(e?.quote || "").trim(),
        }))
        .filter((e) => e.field && e.quote)
        .slice(0, 5)
    : [];

  if (decision !== "positiv" && decision !== "negativ") {
    const e = new Error(
      "KI Antwort ungültig: decision fehlt/ist nicht positiv|negativ."
    );
    e.rawText = String(text || "");
    throw e;
  }

  return { decision, reason, evidence, rawText: String(text || "") };
}
