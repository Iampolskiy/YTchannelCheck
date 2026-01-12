// lib/aiDecision/majority.js (ESM)

/**
 * votes: Array<{ decision: "positiv"|"negativ" }>
 * Regeln:
 * - 3 Modelle: Mehrheit gewinnt
 * - 2 Modelle: Gleichstand => negativ (Safety-first)
 * - 1 Modell: dessen Entscheidung
 */
export function computeMajorityDecision(votes) {
  const counts = { positiv: 0, negativ: 0, total: 0 };
  for (const v of Array.isArray(votes) ? votes : []) {
    const d = String(v?.decision || "").trim().toLowerCase();
    if (d === "positiv") counts.positiv++;
    else if (d === "negativ") counts.negativ++;
    counts.total++;
  }

  // Safety-first Default
  let finalDecision = "negativ";
  if (counts.positiv > counts.negativ) finalDecision = "positiv";
  // bei Gleichstand bleibt "negativ"

  return { finalDecision, counts };
}

