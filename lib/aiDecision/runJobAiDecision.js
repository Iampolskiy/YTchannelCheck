// lib/aiDecision/runJobAiDecision.js (ESM)

import { connectDb } from "../db.js";
import { VorgefiltertCode } from "../models/VorgefiltertCode.js";
import { Positiv } from "../models/Positiv.js";
import { Negativ } from "../models/Negativ.js";

import { buildAiDecisionChannelPayload } from "./payload.js";
import { loadPromptText, fillPromptTemplate } from "./prompt.js";
import { ollamaDecision } from "./ollamaClient.js";
import { computeMajorityDecision } from "./majority.js";

function shorten(text, max = 160) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

function buildReasonsSummary(votes) {
  const arr = Array.isArray(votes) ? votes : [];
  return arr
    .map((v) => {
      const m = String(v?.model || "").trim();
      const d = String(v?.decision || "").trim();
      const r = shorten(v?.reason || "", 1500);
      return `${m}:${d}${r ? ` — ${r}` : ""}`;
    })
    .join(" | ");
}

function buildFinalReason({ finalDecision, votes }) {
  const arr = Array.isArray(votes) ? votes : [];
  const majorityReasons = arr
    .filter(
      (v) => String(v?.decision || "").trim() === String(finalDecision || "")
    )
    .map((v) => String(v?.reason || "").trim())
    .filter(Boolean);

  // Prefer Gründe der Mehrheit; ansonsten irgendein Grund (falls Modelle leer liefern)
  const txt = majorityReasons.length
    ? majorityReasons.join(" | ")
    : arr
        .map((v) => String(v?.reason || "").trim())
        .filter(Boolean)
        .join(" | ");

  return shorten(txt, 3000);
}

function buildFinalEvidence({ finalDecision, votes }) {
  const arr = Array.isArray(votes) ? votes : [];
  return arr
    .filter(
      (v) => String(v?.decision || "").trim() === String(finalDecision || "")
    )
    .flatMap((v) => (Array.isArray(v?.evidence) ? v.evidence : []))
    .map((e) => ({
      field: String(e?.field || "").trim(),
      quote: String(e?.quote || "").trim(),
    }))
    .filter((e) => e.field && e.quote)
    .slice(0, 5);
}

export async function runJobAiDecision({ jobId, job, emitLog, emitSnapshot }) {
  try {
    await connectDb();
  } catch (e) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = "MongoDB Verbindung fehlgeschlagen. Läuft MongoDB?";
    emitLog(jobId, "err", job.error, { error: String(e?.message || e) });
    emitSnapshot(jobId, { step: "MongoDB Fehler" });
    return;
  }

  const options = job.options || {};

  const dryRun = Boolean(options.dryRun);
  const limit =
    typeof options.limit === "number"
      ? Math.max(0, Math.floor(options.limit))
      : 0;

  const models = [options.model1, options.model2, options.model3]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  if (models.length === 0) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = "Keine Modelle gesetzt. Bitte model1/2/3 in der UI eintragen.";
    emitLog(jobId, "err", job.error);
    emitSnapshot(jobId, { step: "KI nicht konfiguriert" });
    return;
  }

  const ollamaBaseUrl =
    String(process.env.OLLAMA_BASE_URL || "").trim() ||
    "http://127.0.0.1:11434";

  const promptFile = String(options.promptFile || "").trim();

  emitLog(jobId, "info", "Job gestartet (Ollama KI Prüfung)", {
    models,
    ollamaBaseUrl,
    dryRun,
    limit: limit || "ALL",
    promptFile: promptFile || "(default)",
  });
  emitSnapshot(jobId, {
    step: "Lade Prompt",
    progress: { current: 0, total: 0 },
  });

  let promptText = "";
  let promptFileResolved = "";
  try {
    const loaded = await loadPromptText(promptFile);
    promptText = loaded.promptText;
    promptFileResolved = loaded.promptFile;
  } catch (e) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = `Prompt Datei nicht lesbar: ${String(e?.message || e)}`;
    emitLog(jobId, "err", job.error, { promptFile: promptFile || "(default)" });
    emitSnapshot(jobId, { step: "Prompt Fehler" });
    return;
  }

  emitSnapshot(jobId, {
    step: "Starte Scan in vorgefiltertCode",
    progress: { current: 0, total: 0 },
  });

  try {
    const totalDocs = await VorgefiltertCode.countDocuments();
    const totalPlanned = limit ? Math.min(limit, totalDocs) : totalDocs;

    job.progress.aiDecisionTotal = totalPlanned;
    job.progress.aiDecisionDone = 0;
    job.progress.aiDecisionPositivSaved = 0;
    job.progress.aiDecisionNegativSaved = 0;
    job.progress.aiDecisionErrors = 0;

    emitSnapshot(jobId, {
      step: `Starte KI Prüfung (0/${totalPlanned})`,
      progress: { current: 0, total: totalPlanned },
      stats: { ...job.progress },
    });

    let q = VorgefiltertCode.find({}).sort({ _id: 1 });
    if (limit) q = q.limit(limit);
    const cursor = q.cursor();

    for await (const doc of cursor) {
      job.progress.aiDecisionDone++;

      const youtubeId = String(doc?.youtubeId || "").trim();
      if (!youtubeId) {
        job.progress.aiDecisionErrors++;
        continue;
      }

      try {
        emitSnapshot(jobId, {
          step: `KI prüft Kanal (${job.progress.aiDecisionDone}/${totalPlanned})`,
          progress: {
            current: job.progress.aiDecisionDone,
            total: totalPlanned,
          },
          stats: { ...job.progress },
        });

        const channelPayload = buildAiDecisionChannelPayload(doc);
        const prompt = fillPromptTemplate(promptText, channelPayload);

        const votes = [];
        for (const model of models) {
          const r = await ollamaDecision({
            baseUrl: ollamaBaseUrl,
            model,
            prompt,
          });
          votes.push({
            model,
            decision: r.decision,
            reason: r.reason,
            evidence: Array.isArray(r.evidence) ? r.evidence : [],
          });
        }

        const { finalDecision, counts } = computeMajorityDecision(votes);
        const reasonsSummary = buildReasonsSummary(votes);
        const finalReason = buildFinalReason({ finalDecision, votes });
        const finalEvidence = buildFinalEvidence({ finalDecision, votes });

        if (dryRun) {
          emitLog(jobId, "info", "DryRun: KI Ergebnis", {
            youtubeId,
            finalDecision,
            counts,
            votes,
          });
        } else {
          const snapshot = doc.toObject ? doc.toObject() : doc;

          const aiCheck = {
            checkedAt: new Date(),
            company: "Formilo",
            finalDecision,
            counts,
            votes,
            reasonsSummary,
            finalEvidence,
            promptFile: promptFileResolved,
            ollamaBaseUrl,
          };

          const commonPayload = {
            youtubeId,
            youtubeUrl: doc?.youtubeUrl ?? null,
            sourceFile: doc?.sourceFile ?? null,
            channelTitle: String(
              snapshot?.channelInfo?.title ??
                doc?.channelInfo?.title ??
                doc?.channelDoc?.channelInfo?.title ??
                ""
            ),
            aiFinalDecision: finalDecision,
            aiFinalReason: finalReason,
            aiFinalEvidence: finalEvidence,
            channelDoc: snapshot,
            aiCheck,
            lastJobId: jobId,
          };

          if (finalDecision === "positiv") {
            await Positiv.findOneAndUpdate(
              { youtubeId },
              {
                $set: commonPayload,
                // ✅ Cleanup: alte "doppelte" Top-Level Felder entfernen
                $unset: {
                  ytAboutOk: 1,
                  ytVideosOk: 1,
                  status: 1,
                  extractedAt: 1,
                  channelInfo: 1,
                  videos: 1,
                  codeCheck: 1,
                },
                $inc: { timesChecked: 1 },
              },
              { upsert: true, setDefaultsOnInsert: true }
            );
            await Negativ.deleteOne({ youtubeId });
            job.progress.aiDecisionPositivSaved++;
          } else {
            await Negativ.findOneAndUpdate(
              { youtubeId },
              {
                $set: commonPayload,
                // ✅ Cleanup: alte "doppelte" Top-Level Felder entfernen
                $unset: {
                  ytAboutOk: 1,
                  ytVideosOk: 1,
                  status: 1,
                  extractedAt: 1,
                  channelInfo: 1,
                  videos: 1,
                  codeCheck: 1,
                },
                $inc: { timesChecked: 1 },
              },
              { upsert: true, setDefaultsOnInsert: true }
            );
            await Positiv.deleteOne({ youtubeId });
            job.progress.aiDecisionNegativSaved++;
          }
        }

        // Für die UI: Ergebnis/Grund pro Kanal (kurz) in den Live-Logs anzeigen
        emitLog(jobId, "info", "KI Entscheidung", {
          youtubeId,
          finalDecision,
          counts,
          reason: finalReason,
          reasons: reasonsSummary,
          evidence: finalEvidence,
        });
      } catch (perDocErr) {
        job.progress.aiDecisionErrors++;
        emitLog(jobId, "warn", "Fehler bei KI Prüfung (skip)", {
          youtubeId,
          error: String(perDocErr?.message || perDocErr),
          rawTextSample: perDocErr?.rawText
            ? shorten(perDocErr.rawText, 1200)
            : undefined,
        });
        continue;
      }
    }

    job.status = "done";
    job.finishedAt = new Date().toISOString();
    emitLog(jobId, "info", "Job fertig (Ollama KI Prüfung)", {
      ...job.progress,
    });
    emitSnapshot(jobId, {
      step: "Job fertig",
      progress: { current: job.progress.aiDecisionDone, total: totalPlanned },
      stats: { ...job.progress },
    });
  } catch (err) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = String(err?.message || err);
    job.progress.aiDecisionErrors++;

    emitLog(jobId, "err", "Job fehlgeschlagen (Ollama KI Prüfung)", {
      error: job.error,
    });
    emitSnapshot(jobId, {
      step: "Job Fehler",
      progress: {
        current: job.progress.aiDecisionDone,
        total: job.progress.aiDecisionTotal,
      },
      stats: { ...job.progress },
    });
  }
}
