// scripts/backfillChannelTitle.js (ESM)
// Füllt channelTitle in positiv/negativ aus channelDoc.channelInfo.title nach

import { connectDb } from "../lib/db.js";
import { Positiv } from "../lib/models/Positiv.js";
import { Negativ } from "../lib/models/Negativ.js";

function pickTitle(doc) {
  const t =
    doc?.channelTitle ||
    doc?.channelInfo?.title ||
    doc?.channelDoc?.channelInfo?.title ||
    "";
  return String(t || "").trim();
}

async function backfillModel(Model, name) {
  const docs = await Model.find(
    {
      $or: [{ channelTitle: { $exists: false } }, { channelTitle: "" }, { channelTitle: null }],
    },
    { channelTitle: 1, channelInfo: 1, channelDoc: 1, youtubeId: 1 }
  )
    .limit(10_000)
    .lean();

  let updated = 0;
  for (const d of docs) {
    const title = pickTitle(d);
    if (!title) continue;
    await Model.updateOne({ _id: d._id }, { $set: { channelTitle: title } });
    updated++;
  }

  console.log(`[${name}] scanned=${docs.length} updated=${updated}`);
}

await connectDb();
await backfillModel(Positiv, "positiv");
await backfillModel(Negativ, "negativ");
process.exit(0);

