/**
 * SocialBlade HTML Parser
 * Extracts YouTube channel IDs from SocialBlade HTML files
 */

/**
 * Extract YouTube channel IDs from SocialBlade HTML content
 * SocialBlade lists have table rows with id="UC..." (YouTube channel IDs)
 */
export function parseSocialBladeHtml(html: string): string[] {
  const channelIds: string[] = [];
  
  // Pattern to match YouTube channel IDs in table rows
  // SocialBlade uses: <tr id="UCxxxxxx" ...>
  const rowIdPattern = /<tr\s+id="(UC[a-zA-Z0-9_-]+)"/gi;
  
  let match;
  while ((match = rowIdPattern.exec(html)) !== null) {
    const channelId = match[1];
    if (channelId && !channelIds.includes(channelId)) {
      channelIds.push(channelId);
    }
  }
  
  // Also try to extract from href patterns (backup method)
  // Pattern: /youtube/channel/UCxxxxxx or /youtube/c/UCxxxxxx
  const hrefPattern = /\/youtube\/(?:channel|c|user|handle)\/([a-zA-Z0-9_-]+)/gi;
  while ((match = hrefPattern.exec(html)) !== null) {
    const id = match[1];
    // Only add if it looks like a channel ID (starts with UC) and not already present
    if (id.startsWith('UC') && !channelIds.includes(id)) {
      channelIds.push(id);
    }
  }
  
  return channelIds;
}

/**
 * Convert a channel ID to a YouTube channel URL
 */
export function channelIdToUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}

/**
 * Parse SocialBlade HTML and return YouTube channel URLs
 */
export function parseSocialBladeToUrls(html: string): string[] {
  const channelIds = parseSocialBladeHtml(html);
  return channelIds.map(channelIdToUrl);
}

