/**
 * YouTube Scraping Utilities
 * 
 * Extracts channel and video information from YouTube pages.
 * Based on ytInitialData parsing.
 */

import type { ChannelInfo, VideoInfo } from '../types/index.js';

// =============================================================================
// Types for YouTube Internal Data
// =============================================================================

interface YtTextRun {
  text?: string;
}

interface YtText {
  simpleText?: string;
  runs?: YtTextRun[];
}

// Generic type for YouTube's complex nested structures
type YtData = Record<string, unknown>;

// =============================================================================
// Text Extraction Helpers
// =============================================================================

/**
 * Extract text from YouTube's simpleText/runs format
 */
function extractText(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;

  const v = value as YtText;
  
  if (typeof v.simpleText === 'string') {
    return v.simpleText.trim() || null;
  }

  if (Array.isArray(v.runs)) {
    const text = v.runs
      .map((r) => r?.text || '')
      .join('')
      .trim();
    return text || null;
  }

  return null;
}

// =============================================================================
// ytInitialData Extraction
// =============================================================================

/**
 * Extract ytInitialData JSON from YouTube HTML
 */
export function extractYtInitialData(html: string): YtData | null {
  const markerVariants = [
    'var ytInitialData =',
    'window["ytInitialData"] =',
    "window['ytInitialData'] =",
    'ytInitialData =',
  ];

  let idx = -1;
  for (const marker of markerVariants) {
    idx = html.indexOf(marker);
    if (idx !== -1) break;
  }
  if (idx === -1) return null;

  const start = html.indexOf('{', idx);
  if (start === -1) return null;

  // Parse by counting braces
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const jsonText = html.slice(start, i + 1);
        try {
          return JSON.parse(jsonText) as YtData;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

// =============================================================================
// Country Extraction (Deep Search)
// =============================================================================

/**
 * Extract country from ytInitialData using deep search
 * YouTube stores country in different places depending on page type
 */
function extractCountry(ytData: YtData): string | null {
  // Try simple path first
  const meta = ytData?.metadata as YtData | undefined;
  const renderer = meta?.channelMetadataRenderer as YtData | undefined;
  const simpleCountry = extractText(renderer?.country);
  if (simpleCountry) return simpleCountry;

  // Deep search for aboutChannelViewModel.country
  const stack: unknown[] = [ytData];
  const seen = new Set<unknown>();

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    const obj = cur as Record<string, unknown>;
    const acvm = obj.aboutChannelViewModel as YtData | undefined;
    if (acvm && typeof acvm === 'object') {
      const country = extractText(acvm.country);
      if (country) return country;
    }

    if (Array.isArray(cur)) {
      for (const v of cur) {
        if (v && typeof v === 'object') stack.push(v);
      }
    } else {
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') stack.push(v);
      }
    }
  }

  return null;
}

// =============================================================================
// Channel Info Extraction
// =============================================================================

/**
 * Extract channel information from ytInitialData
 */
export function extractChannelInfo(ytData: YtData): ChannelInfo {
  const meta = ytData?.metadata as YtData | undefined;
  const renderer = meta?.channelMetadataRenderer as YtData | undefined;

  if (!renderer) {
    throw new Error('channelMetadataRenderer not found');
  }

  const header = (ytData?.header as YtData)?.c4TabbedHeaderRenderer as YtData | undefined
    || (ytData?.header as YtData)?.pageHeaderRenderer as YtData | undefined;

  const description = typeof renderer.description === 'string'
    ? renderer.description
    : extractText(renderer.description);

  const subscriberCountText = extractText(header?.subscriberCountText);

  const avatarThumbs = (renderer.avatar as YtData)?.thumbnails as Array<{ url: string }> | undefined;
  const avatar = avatarThumbs?.length ? avatarThumbs[avatarThumbs.length - 1].url : null;

  const channelUrl = renderer.channelUrl as string | undefined;
  const vanityUrl = renderer.vanityChannelUrl as string | undefined;

  // Extract handle from vanity URL
  let handle: string | null = null;
  if (typeof vanityUrl === 'string' && vanityUrl.includes('@')) {
    const parts = vanityUrl.split('@');
    if (parts[1]) handle = `@${parts[1]}`;
  }

  const keywords = Array.isArray(renderer.keywords)
    ? (renderer.keywords as string[])
    : [];

  return {
    id: (renderer.externalId as string) || null,
    title: (renderer.title as string) || null,
    handle,
    url: channelUrl || null,
    description: description || null,
    country: extractCountry(ytData),
    keywords,
    subscriberCountText: subscriberCountText || null,
    avatar,
    isFamilySafe: (renderer.isFamilySafe as boolean) ?? null,
  };
}

// =============================================================================
// Video List Extraction
// =============================================================================

/**
 * Extract videos from ytInitialData (from /videos tab)
 */
export function extractVideos(ytData: YtData, limit = 30): VideoInfo[] {
  const contents = ytData?.contents as YtData | undefined;
  const browseRenderer = contents?.twoColumnBrowseResultsRenderer as YtData | undefined;
  const tabs = browseRenderer?.tabs as YtData[] | undefined;

  if (!Array.isArray(tabs) || tabs.length === 0) return [];

  // Find videos tab
  const videosTab = tabs.find((tab) => {
    const tabRenderer = tab?.tabRenderer as YtData | undefined;
    const title = (tabRenderer?.title as string)?.toLowerCase?.();
    const selected = tabRenderer?.selected;
    return selected === true ||
      (typeof title === 'string' && (
        title.includes('videos') ||
        title.includes('uploads') ||
        title.includes('alle videos')
      ));
  }) || tabs[0];

  const tabRenderer = videosTab?.tabRenderer as YtData | undefined;
  const content = tabRenderer?.content as YtData | undefined;
  let gridContents = (content?.richGridRenderer as YtData)?.contents as YtData[] | undefined;

  // Fallback for different layouts
  if (!Array.isArray(gridContents) || gridContents.length === 0) {
    const sectionList = content?.sectionListRenderer as YtData | undefined;
    const sections = sectionList?.contents as YtData[] | undefined;

    if (sections) {
      for (const section of sections) {
        const itemSection = section?.itemSectionRenderer as YtData | undefined;
        const items = itemSection?.contents as YtData[] | undefined;
        if (items) {
          for (const item of items) {
            const grid = (item?.richGridRenderer as YtData)?.contents as YtData[] | undefined;
            if (Array.isArray(grid) && grid.length) {
              gridContents = grid;
              break;
            }
          }
        }
        if (gridContents?.length) break;
      }
    }
  }

  if (!Array.isArray(gridContents) || gridContents.length === 0) return [];

  const videos: VideoInfo[] = [];

  for (const item of gridContents) {
    const richItem = item?.richItemRenderer as YtData | undefined;
    const videoContent = richItem?.content as YtData | undefined;
    const v = videoContent?.videoRenderer as YtData | undefined;
    if (!v) continue;

    const videoId = v.videoId as string | undefined;
    const title = extractText(v.title);

    // Build description from snippets
    const descriptionParts: string[] = [];
    const snippet = extractText(v.descriptionSnippet);
    if (snippet) descriptionParts.push(snippet);

    const detailedSnippets = v.detailedMetadataSnippets as YtData[] | undefined;
    if (Array.isArray(detailedSnippets)) {
      for (const snip of detailedSnippets) {
        const text = extractText(snip?.snippetText);
        if (text) descriptionParts.push(text);
      }
    }

    videos.push({
      id: videoId || '',
      title: title || null,
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
      publishedText: extractText(v.publishedTimeText) || null,
      viewsText: extractText(v.viewCountText) || null,
      durationText: extractText(v.lengthText) || null,
      description: descriptionParts.join(' | ').trim() || null,
    });

    if (videos.length >= limit) break;
  }

  return videos;
}

// =============================================================================
// Channel ID Extraction from Video Page
// =============================================================================

/**
 * Extract channel ID from a video page's ytInitialData
 */
export function extractChannelIdFromVideoPage(ytData: YtData): string | null {
  // Try videoDetails first
  const videoDetails = ytData?.videoDetails as YtData | undefined;
  if (videoDetails?.channelId) {
    return videoDetails.channelId as string;
  }

  // Try owner
  const contents = ytData?.contents as YtData | undefined;
  const twoColumn = contents?.twoColumnWatchNextResults as YtData | undefined;
  const results = twoColumn?.results as YtData | undefined;
  const resultContents = results?.results as YtData | undefined;
  const resultItems = resultContents?.contents as YtData[] | undefined;

  if (resultItems) {
    for (const item of resultItems) {
      const primary = item?.videoPrimaryInfoRenderer as YtData | undefined;
      const owner = primary?.owner as YtData | undefined;
      const videoOwner = owner?.videoOwnerRenderer as YtData | undefined;
      const navEndpoint = videoOwner?.navigationEndpoint as YtData | undefined;
      const browseEndpoint = navEndpoint?.browseEndpoint as YtData | undefined;
      if (browseEndpoint?.browseId) {
        return browseEndpoint.browseId as string;
      }
    }
  }

  return null;
}

// =============================================================================
// URL Utilities
// =============================================================================

/**
 * Normalize a YouTube URL (remove trailing slashes)
 */
export function normalizeYoutubeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Extract channel ID from a YouTube channel URL
 * Handles: /channel/UC..., /@handle, /c/customname
 */
export function extractChannelIdFromUrl(url: string): { type: 'id' | 'handle' | 'custom'; value: string } | null {
  try {
    const u = new URL(url);
    const path = u.pathname;

    // /channel/UC...
    const channelMatch = path.match(/\/channel\/(UC[a-zA-Z0-9_-]{20,})/);
    if (channelMatch) {
      return { type: 'id', value: channelMatch[1] };
    }

    // /@handle
    const handleMatch = path.match(/\/@([a-zA-Z0-9._-]+)/);
    if (handleMatch) {
      return { type: 'handle', value: `@${handleMatch[1]}` };
    }

    // /c/customname
    const customMatch = path.match(/\/c\/([a-zA-Z0-9._-]+)/);
    if (customMatch) {
      return { type: 'custom', value: customMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if URL is a YouTube video URL
 */
export function isVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.hostname.includes('youtube.com') && u.pathname === '/watch') ||
      u.hostname === 'youtu.be'
    );
  } catch {
    return false;
  }
}

/**
 * Check if URL is a YouTube channel URL
 */
export function isChannelUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('youtube.com')) return false;
    return (
      u.pathname.startsWith('/channel/') ||
      u.pathname.startsWith('/@') ||
      u.pathname.startsWith('/c/') ||
      u.pathname.startsWith('/user/')
    );
  } catch {
    return false;
  }
}

