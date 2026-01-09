export function getTextsToCheck(doc) {
  const channelTitle = String(doc?.channelInfo?.title || "");
  const channelDescription = String(doc?.channelInfo?.description || "");
  const videoTitles = Array.isArray(doc?.videos)
    ? doc.videos.map((v) => String(v?.title || ""))
    : [];
  return { channelTitle, channelDescription, videoTitles };
}
