// lib/aiDecision/payload.js (ESM)

export function buildAiDecisionChannelPayload(doc) {
  const ci = doc?.channelInfo || {};
  const videos = Array.isArray(doc?.videos) ? doc.videos : [];

  // Prompt bleibt absichtlich kompakt (sonst explodieren Tokens).
  return {
    youtubeId: doc?.youtubeId ?? null,
    youtubeUrl: doc?.youtubeUrl ?? null,
    sourceFile: doc?.sourceFile ?? null,

    channelInfo: {
      title: ci.title ?? null,
      handle: ci.handle ?? null,
      url: ci.url ?? null,
      country: ci.country ?? null,
      subscriberCountText: ci.subscriberCountText ?? null,
      description: ci.description ?? null,
      keywords: Array.isArray(ci.keywords) ? ci.keywords : [],
    },

    codeCheck: doc?.codeCheck ?? null,

    videos: videos.slice(0, 25).map((v) => ({
      title: v?.title ?? null,
      url: v?.url ?? null,
      publishedText: v?.publishedText ?? null,
      viewsText: v?.viewsText ?? null,
      durationText: v?.durationText ?? null,
    })),
  };
}
