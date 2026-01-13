/**
 * Import Routes
 * 
 * Manual import of channels and videos via CSV or Textarea.
 * Per Lastenheft: Campaign assignment is mandatory.
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Channel, Campaign } from '../models/index.js';
import { validateBody, ApiError } from '../middleware/index.js';
import {
  ChannelTextareaInputSchema,
  VideoTextareaInputSchema,
} from '../schemas/index.js';
import {
  extractYtInitialData,
  extractChannelInfo,
  extractVideos,
  extractChannelIdFromVideoPage,
  isVideoUrl,
  isChannelUrl,
  normalizeYoutubeUrl,
} from '../lib/youtube.js';
import {
  fetchChannelAbout,
  fetchChannelVideos,
  fetchVideoPage,
  CaptchaError,
} from '../lib/fetcher.js';
import { parseSocialBladeHtml, channelIdToUrl } from '../lib/socialblade/index.js';

const router = Router();

// =============================================================================
// Multer Setup for CSV Upload
// =============================================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse CSV content and extract URLs from first column
 * Supports multiple formats:
 * - Simple: "https://youtube.com/@channel"
 * - SocialBlade format: "https://socialblade.com/youtube/handle/wirsegeln", "wirsegeln", "+"
 * - Quoted CSV: "URL", "handle", "marker"
 */
function parseCsvUrls(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const urls: string[] = [];
  // Regex to find youtube URLs (channel, user, c, @, or video) or SocialBlade URLs
  const urlRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:channel\/|c\/|@|user\/|watch\?v=)|youtu\.be\/|socialblade\.com\/youtube\/[\w/-]+)[\w.-]+)/i;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // Skip header row if it looks like a header (and doesn't look like a URL)
    if (i === 0 && !line.includes('http') && (line.toLowerCase().includes('url') || line.toLowerCase().includes('link') || line.toLowerCase().includes('placement'))) {
      continue;
    }

    // Special handling for quoted CSV format: "URL", "handle", "+/-"
    // Pattern: "https://socialblade.com/youtube/handle/xxx", "xxx", "+" or "-"
    // Also handles: "URL", "handle" (without marker) or just "URL"
    // Allow leading whitespace
    const quotedCsvMatch = line.match(/^\s*"([^"]+)"/);
    if (quotedCsvMatch && quotedCsvMatch[1].includes('socialblade.com')) {
      const urlPart = quotedCsvMatch[1].trim();
      let foundUrl = urlPart;
      
      // Convert SocialBlade URL to YouTube URL
      if (foundUrl.includes('socialblade.com')) {
        if (foundUrl.includes('/handle/')) {
          const handleMatch = foundUrl.match(/\/handle\/([^\/\s"]+)/);
          if (handleMatch) {
            const handle = handleMatch[1];
            foundUrl = `https://www.youtube.com/@${handle}`;
          }
        } else if (foundUrl.includes('/channel/')) {
          const idMatch = foundUrl.match(/\/channel\/(UC[\w-]+)/);
          if (idMatch) {
            foundUrl = `https://www.youtube.com/channel/${idMatch[1]}`;
          }
        } else if (foundUrl.includes('/user/')) {
          const userMatch = foundUrl.match(/\/user\/([^\/\s"]+)/);
          if (userMatch) {
            foundUrl = `https://www.youtube.com/user/${userMatch[1]}`;
          }
        } else if (foundUrl.includes('/c/')) {
          const cMatch = foundUrl.match(/\/c\/([^\/\s"]+)/);
          if (cMatch) {
            foundUrl = `https://www.youtube.com/c/${cMatch[1]}`;
          }
        }
      }
      
      if (foundUrl && (foundUrl.includes('youtube.com') || foundUrl.includes('youtu.be'))) {
        urls.push(foundUrl);
        continue;
      }
    }

    // 1. Try regex match first (handles URLs without quotes)
    const match = line.match(urlRegex);
    if (match) {
      let foundUrl = match[0];
      
      // Convert SocialBlade URL to YouTube URL
      if (foundUrl.includes('socialblade.com')) {
        if (foundUrl.includes('/handle/')) {
          const handleMatch = foundUrl.match(/\/handle\/([^\/\s"]+)/);
          if (handleMatch) {
            foundUrl = `https://www.youtube.com/@${handleMatch[1]}`;
          }
        } else if (foundUrl.includes('/channel/')) {
          const idMatch = foundUrl.match(/\/channel\/(UC[\w-]+)/);
          if (idMatch) {
            foundUrl = `https://www.youtube.com/channel/${idMatch[1]}`;
          }
        } else if (foundUrl.includes('/user/')) {
          const userMatch = foundUrl.match(/\/user\/([^\/\s"]+)/);
          if (userMatch) {
            foundUrl = `https://www.youtube.com/user/${userMatch[1]}`;
          }
        } else if (foundUrl.includes('/c/')) {
          const cMatch = foundUrl.match(/\/c\/([^\/\s"]+)/);
          if (cMatch) {
            foundUrl = `https://www.youtube.com/c/${cMatch[1]}`;
          }
        }
      }

      urls.push(foundUrl);
      continue;
    }

    // 2. Fallback: split by comma/semicolon and check parts
    const parts = line.split(/[,;\t]/);
    for (const part of parts) {
      let clean = part.trim().replace(/^["']|["']$/g, ''); // Remove quotes
      
      if (clean && (clean.includes('youtube.com') || clean.includes('youtu.be') || clean.includes('socialblade.com'))) {
        // Ensure protocol if missing
        if (!clean.startsWith('http')) {
          clean = 'https://' + clean;
        }

        // Convert SocialBlade URL to YouTube URL (same logic)
        if (clean.includes('socialblade.com')) {
          if (clean.includes('/handle/')) {
            const handleMatch = clean.match(/\/handle\/([^\/\s"]+)/);
            if (handleMatch) {
              clean = `https://www.youtube.com/@${handleMatch[1]}`;
            }
          } else if (clean.includes('/channel/')) {
            const idMatch = clean.match(/\/channel\/(UC[\w-]+)/);
            if (idMatch) {
              clean = `https://www.youtube.com/channel/${idMatch[1]}`;
            }
          } else if (clean.includes('/user/')) {
            const userMatch = clean.match(/\/user\/([^\/\s"]+)/);
            if (userMatch) {
              clean = `https://www.youtube.com/user/${userMatch[1]}`;
            }
          } else if (clean.includes('/c/')) {
            const cMatch = clean.match(/\/c\/([^\/\s"]+)/);
            if (cMatch) {
              clean = `https://www.youtube.com/c/${cMatch[1]}`;
            }
          }
        }

        urls.push(clean);
        break; // Found one, move to next line
      }
    }
  }

  return urls;
}

/**
 * Fast: Resolve handle URL to channel ID only (no videos)
 * Used for CSV imports to speed up bulk imports
 */
async function resolveHandleToChannelId(channelUrl: string): Promise<{
  youtubeId: string;
  youtubeUrl: string;
  channelInfo: ReturnType<typeof extractChannelInfo>;
}> {
  const normalizedUrl = normalizeYoutubeUrl(channelUrl);

  // Only fetch about page (fast, no videos)
  const aboutHtml = await fetchChannelAbout(normalizedUrl);
  const aboutData = extractYtInitialData(aboutHtml);
  
  if (!aboutData) {
    throw new Error('Failed to extract YouTube data from about page');
  }

  const channelInfo = extractChannelInfo(aboutData);
  
  if (!channelInfo.id) {
    throw new Error('Failed to extract channel ID');
  }

  return {
    youtubeId: channelInfo.id,
    youtubeUrl: channelInfo.url || normalizedUrl,
    channelInfo,
  };
}

/**
 * Scrape a channel from YouTube and return channel data
 */
async function scrapeChannel(channelUrl: string): Promise<{
  youtubeId: string;
  youtubeUrl: string;
  channelInfo: ReturnType<typeof extractChannelInfo>;
  videos: ReturnType<typeof extractVideos>;
  ytAboutOk: boolean;
  ytVideosOk: boolean;
}> {
  const normalizedUrl = normalizeYoutubeUrl(channelUrl);

  // Fetch about page
  const aboutHtml = await fetchChannelAbout(normalizedUrl);
  const aboutData = extractYtInitialData(aboutHtml);
  
  if (!aboutData) {
    throw new Error('Failed to extract YouTube data from about page');
  }

  const channelInfo = extractChannelInfo(aboutData);
  
  if (!channelInfo.id) {
    throw new Error('Failed to extract channel ID');
  }

  // Fetch videos page
  let videos: ReturnType<typeof extractVideos> = [];
  let ytVideosOk = false;

  try {
    const videosHtml = await fetchChannelVideos(normalizedUrl);
    const videosData = extractYtInitialData(videosHtml);
    if (videosData) {
      videos = extractVideos(videosData, 30);
      ytVideosOk = true;
    }
  } catch {
    // Videos fetch failed, continue without videos
  }

  return {
    youtubeId: channelInfo.id,
    youtubeUrl: channelInfo.url || normalizedUrl,
    channelInfo,
    videos,
    ytAboutOk: true,
    ytVideosOk,
  };
}

/**
 * Resolve a video URL to a channel ID
 */
async function resolveVideoToChannelId(videoUrl: string): Promise<string> {
  const html = await fetchVideoPage(videoUrl);
  const data = extractYtInitialData(html);
  
  if (!data) {
    throw new Error('Failed to extract YouTube data from video page');
  }

  const channelId = extractChannelIdFromVideoPage(data);
  
  if (!channelId) {
    throw new Error('Failed to extract channel ID from video page');
  }

  return channelId;
}

// =============================================================================
// Channel Import Routes
// =============================================================================

/**
 * POST /api/import/channels/textarea
 * Import channels from textarea (newline-separated URLs)
 */
router.post(
  '/channels/textarea',
  validateBody(ChannelTextareaInputSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { text, campaignId } = req.body;

      // Verify campaign exists and is of type 'channel' (only if campaignId provided)
      if (campaignId) {
        const campaign = await Campaign.findById(campaignId);
        if (!campaign) {
          throw ApiError.badRequest('Campaign not found');
        }
        if (campaign.type !== 'channel') {
          throw ApiError.badRequest('Campaign must be of type "channel" for channel imports');
        }
      }

      // Parse URLs from text (already transformed by Zod)
      const urls = text as string[];
      
      const results = {
        total: urls.length,
        imported: 0,
        skipped: 0,
        errors: [] as Array<{ url: string; error: string }>,
      };

      for (const url of urls) {
        if (!isChannelUrl(url)) {
          results.errors.push({ url, error: 'Not a valid channel URL' });
          continue;
        }

        try {
          // Check if channel already exists
          const existing = await Channel.findOne({
            $or: [
              { youtubeUrl: { $regex: url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            ],
          });

          if (existing) {
            // Add campaign to sources if not already present
            if (campaignId && !existing.sources.campaignIds.includes(campaignId)) {
              await Channel.updateOne(
                { _id: existing._id },
                { $addToSet: { 'sources.campaignIds': campaignId } }
              );
            }
            results.skipped++;
            continue;
          }

          // Scrape channel
          // Optimization: Skip scraping if we just need to add it (we can scrape later via background job)
          // For now, we scrape basic info to have a valid record.
          // BUT: ScrapeChannel is slow. We should defer this or scrape lighter.
          
          // FAST PATH: Create 'unchecked' channel with minimal info and queue for extraction later?
          // The current requirement says "Extract YouTube data" which implies immediate extraction.
          // However, for bulk CSV, this is too slow (HTTP requests per row).
          
          // Let's create the channel record FIRST without full details, 
          // marking it as 'pending_extraction' or just 'unchecked' with empty info.
          // But our model requires youtubeId. We might need to fetch at least the ID if we only have a handle.
          
          // If we have a direct /channel/UC... URL, we know the ID!
          let channelId: string | null = null;
          let handle: string | null = null;
          
          if (url.includes('/channel/UC')) {
             const match = url.match(/\/channel\/(UC[\w-]+)/);
             if (match) channelId = match[1];
          } else if (url.includes('/@')) {
             const match = url.match(/\/@([\w.-]+)/);
             if (match) handle = '@' + match[1];
          }
          
          if (channelId) {
             // We have the ID, insert directly and skip scraping
             await Channel.create({
                youtubeId: channelId,
                youtubeUrl: `https://www.youtube.com/channel/${channelId}`,
                sources: { socialBlade: false, campaignIds: [campaignId] },
                status: 'unchecked',
                decisionLevel: null,
                channelInfo: { id: channelId, url: `https://www.youtube.com/channel/${channelId}` },
                videos: [],
                ytAboutOk: false,
                ytVideosOk: false,
                extractedAt: new Date(0), // Past date indicates "not yet extracted"
             });
             results.imported++;
             continue;
          }

          // If we only have a handle (or user URL), we MUST scrape at least the main page to get the ID.
          // This is the slow part, but unavoidable without an API.
          const scraped = await scrapeChannel(url);

          // Check if channel with this ID already exists
          const existingById = await Channel.findOne({ youtubeId: scraped.youtubeId });
          if (existingById) {
            if (campaignId && !existingById.sources.campaignIds.includes(campaignId)) {
              await Channel.updateOne(
                { _id: existingById._id },
                { $addToSet: { 'sources.campaignIds': campaignId } }
              );
            }
            results.skipped++;
            continue;
          }

          // Create new channel
          await Channel.create({
            youtubeId: scraped.youtubeId,
            youtubeUrl: scraped.youtubeUrl,
            sources: {
              socialBlade: false,
              campaignIds: campaignId ? [campaignId] : [],
            },
            status: 'unchecked',
            decisionLevel: null,
            channelInfo: scraped.channelInfo,
            videos: scraped.videos,
            aboutUrl: `${scraped.youtubeUrl}/about`,
            videosUrl: `${scraped.youtubeUrl}/videos`,
            ytAboutOk: scraped.ytAboutOk,
            ytVideosOk: scraped.ytVideosOk,
            extractedAt: new Date(),
          });

          results.imported++;
        } catch (error) {
          if (error instanceof CaptchaError) {
            // Stop on captcha
            results.errors.push({ url, error: 'Captcha detected - stopping import' });
            break;
          }
          results.errors.push({
            url,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      res.json({
        ok: true,
        results,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/import/channels/csv
 * Import channels from CSV file
 */
router.post(
  '/channels/csv',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw ApiError.badRequest('No file uploaded');
      }

      const campaignId = req.body.campaignId;
      if (!campaignId) {
        throw ApiError.badRequest('campaignId is required');
      }

      // Verify campaign
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw ApiError.badRequest('Campaign not found');
      }
      if (campaign.type !== 'channel') {
        throw ApiError.badRequest('Campaign must be of type "channel"');
      }

      // Parse CSV
      let content = req.file.buffer.toString('utf-8');
      // Remove BOM (Byte Order Mark) which is common in Windows CSV files
      content = content.replace(/^\uFEFF/, '');
      
      const urls = parseCsvUrls(content);
      console.log(`[Import] CSV Parsed: Found ${urls.length} URLs from ${content.split(/\r?\n/).length} lines`);

      // Use same logic as textarea import
      req.body = { text: urls, campaignId };
      
      // Forward to textarea handler logic
      const results = {
        total: urls.length,
        imported: 0,
        skipped: 0,
        errors: [] as Array<{ url: string; error: string }>,
      };

      for (const url of urls) {
        if (!isChannelUrl(url)) {
          results.errors.push({ url, error: 'Not a valid channel URL' });
          continue;
        }

        try {
          const existing = await Channel.findOne({ youtubeUrl: { $regex: url, $options: 'i' } });

          if (existing) {
            if (!existing.sources.campaignIds.includes(campaignId)) {
              await Channel.updateOne(
                { _id: existing._id },
                { $addToSet: { 'sources.campaignIds': campaignId } }
              );
            }
            results.skipped++;
            continue;
          }

          // Optimization for CSV Import:
          // If we have the ID directly from the URL, we can skip the expensive scraping!
          let channelId: string | null = null;
          
          if (url.includes('/channel/UC')) {
             const match = url.match(/\/channel\/(UC[\w-]+)/);
             if (match) channelId = match[1];
          }
          
          if (channelId) {
             // We have the ID, verify if it exists first
             const existingById = await Channel.findOne({ youtubeId: channelId });
             if (existingById) {
                 if (!existingById.sources.campaignIds.includes(campaignId)) {
                   await Channel.updateOne(
                     { _id: existingById._id },
                     { $addToSet: { 'sources.campaignIds': campaignId } }
                   );
                 }
                 results.skipped++;
                 continue;
             }

             // Insert directly without scraping
             await Channel.create({
                youtubeId: channelId,
                youtubeUrl: `https://www.youtube.com/channel/${channelId}`,
                sources: { socialBlade: false, campaignIds: [campaignId] },
                status: 'unchecked',
                decisionLevel: null,
                channelInfo: { id: channelId, url: `https://www.youtube.com/channel/${channelId}` },
                videos: [],
                ytAboutOk: false,
                ytVideosOk: false,
                extractedAt: new Date(0), // Mark as needing extraction
             });
             results.imported++;
             continue;
          }

          // For Handle URLs (@channel): Use fast resolution (only ID, no videos)
          // This is 2x faster than full scrapeChannel() because we skip /videos page
          const resolved = await resolveHandleToChannelId(url);
          
          // Check if channel exists by ID
          const existingById = await Channel.findOne({ youtubeId: resolved.youtubeId });
          if (existingById) {
            if (!existingById.sources.campaignIds.includes(campaignId)) {
              await Channel.updateOne(
                { _id: existingById._id },
                { $addToSet: { 'sources.campaignIds': campaignId } }
              );
            }
            results.skipped++;
            continue;
          }

          // Create channel with minimal data (videos will be fetched later by extraction pipeline)
          await Channel.create({
            youtubeId: resolved.youtubeId,
            youtubeUrl: resolved.youtubeUrl,
            sources: { socialBlade: false, campaignIds: [campaignId] },
            status: 'unchecked',
            decisionLevel: null,
            channelInfo: resolved.channelInfo,
            videos: [], // Videos will be fetched by extraction pipeline later
            ytAboutOk: true,
            ytVideosOk: false, // Not fetched yet
            extractedAt: new Date(0), // Mark as needing full extraction
          });

          results.imported++;
        } catch (error) {
          console.error(`[Import] Error processing URL ${url}:`, error);
          if (error instanceof CaptchaError) {
            results.errors.push({ url, error: 'Captcha detected - stopping import' });
            break;
          }
          results.errors.push({
            url,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      res.json({
        ok: true,
        results,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// Video Import Routes
// =============================================================================

/**
 * POST /api/import/videos/textarea
 * Import channels from video URLs (resolves to channel)
 */
router.post(
  '/videos/textarea',
  validateBody(VideoTextareaInputSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { text, campaignId } = req.body;

      // Verify campaign
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw ApiError.badRequest('Campaign not found');
      }
      if (campaign.type !== 'video') {
        throw ApiError.badRequest('Campaign must be of type "video" for video imports');
      }

      const urls = text as string[];

      const results = {
        total: urls.length,
        imported: 0,
        skipped: 0,
        errors: [] as Array<{ url: string; error: string }>,
      };

      // Track resolved channel IDs to avoid duplicates within this import
      const resolvedChannelIds = new Set<string>();

      for (const url of urls) {
        if (!isVideoUrl(url)) {
          results.errors.push({ url, error: 'Not a valid video URL' });
          continue;
        }

        try {
          // Resolve video to channel ID
          const channelId = await resolveVideoToChannelId(url);

          if (resolvedChannelIds.has(channelId)) {
            results.skipped++;
            continue;
          }
          resolvedChannelIds.add(channelId);

          // Check if channel exists
          const existing = await Channel.findOne({ youtubeId: channelId });

          if (existing) {
            if (!existing.sources.campaignIds.includes(campaignId)) {
              await Channel.updateOne(
                { _id: existing._id },
                { $addToSet: { 'sources.campaignIds': campaignId } }
              );
            }
            results.skipped++;
            continue;
          }

          // Scrape the channel
          const channelUrl = `https://www.youtube.com/channel/${channelId}`;
          const scraped = await scrapeChannel(channelUrl);

          await Channel.create({
            youtubeId: scraped.youtubeId,
            youtubeUrl: scraped.youtubeUrl,
            sources: { socialBlade: false, campaignIds: [campaignId] },
            status: 'unchecked',
            decisionLevel: null,
            channelInfo: scraped.channelInfo,
            videos: scraped.videos,
            ytAboutOk: scraped.ytAboutOk,
            ytVideosOk: scraped.ytVideosOk,
            extractedAt: new Date(),
          });

          results.imported++;
        } catch (error) {
          console.error(`[Import] Error processing URL ${url}:`, error);
          if (error instanceof CaptchaError) {
            results.errors.push({ url, error: 'Captcha detected - stopping import' });
            break;
          }
          results.errors.push({
            url,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      res.json({
        ok: true,
        results,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/import/videos/csv
 * Import channels from video URLs in CSV
 */
router.post(
  '/videos/csv',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw ApiError.badRequest('No file uploaded');
      }

      const campaignId = req.body.campaignId;
      if (!campaignId) {
        throw ApiError.badRequest('campaignId is required');
      }

      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw ApiError.badRequest('Campaign not found');
      }
      if (campaign.type !== 'video') {
        throw ApiError.badRequest('Campaign must be of type "video"');
      }

      const content = req.file.buffer.toString('utf-8');
      const urls = parseCsvUrls(content);

      const results = {
        total: urls.length,
        imported: 0,
        skipped: 0,
        errors: [] as Array<{ url: string; error: string }>,
      };

      const resolvedChannelIds = new Set<string>();

      for (const url of urls) {
        if (!isVideoUrl(url)) {
          results.errors.push({ url, error: 'Not a valid video URL' });
          continue;
        }

        try {
          const channelId = await resolveVideoToChannelId(url);

          if (resolvedChannelIds.has(channelId)) {
            results.skipped++;
            continue;
          }
          resolvedChannelIds.add(channelId);

          const existing = await Channel.findOne({ youtubeId: channelId });

          if (existing) {
            if (!existing.sources.campaignIds.includes(campaignId)) {
              await Channel.updateOne(
                { _id: existing._id },
                { $addToSet: { 'sources.campaignIds': campaignId } }
              );
            }
            results.skipped++;
            continue;
          }

          const channelUrl = `https://www.youtube.com/channel/${channelId}`;
          const scraped = await scrapeChannel(channelUrl);

          await Channel.create({
            youtubeId: scraped.youtubeId,
            youtubeUrl: scraped.youtubeUrl,
            sources: { socialBlade: false, campaignIds: [campaignId] },
            status: 'unchecked',
            decisionLevel: null,
            channelInfo: scraped.channelInfo,
            videos: scraped.videos,
            ytAboutOk: scraped.ytAboutOk,
            ytVideosOk: scraped.ytVideosOk,
            extractedAt: new Date(),
          });

          results.imported++;
        } catch (error) {
          console.error(`[Import] Error processing URL ${url}:`, error);
          if (error instanceof CaptchaError) {
            results.errors.push({ url, error: 'Captcha detected - stopping import' });
            break;
          }
          results.errors.push({
            url,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      res.json({
        ok: true,
        results,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// Folder Import Routes (SocialBlade HTML files)
// =============================================================================

/**
 * Multer setup for HTML file uploads
 */
const htmlUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/html' || file.originalname.endsWith('.html')) {
      cb(null, true);
    } else {
      cb(null, false); // Skip non-HTML files silently
    }
  },
});

/**
 * POST /api/import/folder/upload
 * Import channels from uploaded HTML files (folder picker)
 */
router.post(
  '/folder/upload',
  htmlUpload.array('files', 500), // Max 500 files
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.json({
          ok: true,
          message: 'No HTML files uploaded',
          results: { filesProcessed: 0, imported: 0, skipped: 0, errors: [] },
        });
        return;
      }

      const results = {
        filesProcessed: 0,
        totalChannelIds: 0,
        imported: 0,
        skipped: 0,
        errors: [] as Array<{ file?: string; channelId?: string; error: string }>,
      };

      // Process each uploaded file
      for (const file of files) {
        try {
          const html = file.buffer.toString('utf-8');
          const channelIds = parseSocialBladeHtml(html);

          results.filesProcessed++;
          results.totalChannelIds += channelIds.length;

          // Create channels for each ID
          for (const channelId of channelIds) {
            try {
              const existing = await Channel.findOne({ youtubeId: channelId });

              if (existing) {
                if (!existing.sources.socialBlade) {
                  await Channel.updateOne(
                    { _id: existing._id },
                    { $set: { 'sources.socialBlade': true } }
                  );
                }
                results.skipped++;
                continue;
              }

              await Channel.create({
                youtubeId: channelId,
                youtubeUrl: channelIdToUrl(channelId),
                sources: {
                  socialBlade: true,
                  campaignIds: [],
                },
                status: 'unchecked',
                decisionLevel: null,
              });

              results.imported++;
            } catch (error) {
              results.errors.push({
                channelId,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        } catch (error) {
          results.errors.push({
            file: file.originalname,
            error: error instanceof Error ? error.message : 'Failed to parse file',
          });
        }
      }

      res.json({
        ok: true,
        message: `Processed ${results.filesProcessed} files`,
        results,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/import/folder
 * Import channels from a folder containing SocialBlade HTML files
 */
router.post(
  '/folder',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { folderPath } = req.body;

      if (!folderPath || typeof folderPath !== 'string') {
        throw ApiError.badRequest('folderPath is required');
      }

      // Resolve and validate path
      const resolvedPath = path.resolve(folderPath);
      
      // Check if folder exists
      if (!fs.existsSync(resolvedPath)) {
        throw ApiError.badRequest(`Folder not found: ${resolvedPath}`);
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        throw ApiError.badRequest(`Path is not a directory: ${resolvedPath}`);
      }

      // Get all HTML files in the folder
      const files = fs.readdirSync(resolvedPath)
        .filter(f => f.endsWith('.html'))
        .map(f => path.join(resolvedPath, f));

      if (files.length === 0) {
        res.json({
          ok: true,
          message: 'No HTML files found in folder',
          results: { total: 0, imported: 0, skipped: 0, errors: [] },
        });
        return;
      }

      const results = {
        filesProcessed: 0,
        totalChannelIds: 0,
        imported: 0,
        skipped: 0,
        errors: [] as Array<{ file?: string; channelId?: string; error: string }>,
      };

      // Process each HTML file
      for (const filePath of files) {
        try {
          const html = fs.readFileSync(filePath, 'utf-8');
          const channelIds = parseSocialBladeHtml(html);
          
          results.filesProcessed++;
          results.totalChannelIds += channelIds.length;

          // Create channels for each ID
          for (const channelId of channelIds) {
            try {
              // Check if channel already exists
              const existing = await Channel.findOne({ youtubeId: channelId });
              
              if (existing) {
                // Mark as from SocialBlade if not already
                if (!existing.sources.socialBlade) {
                  await Channel.updateOne(
                    { _id: existing._id },
                    { $set: { 'sources.socialBlade': true } }
                  );
                }
                results.skipped++;
                continue;
              }

              // Create new channel (unchecked, will need extraction)
              await Channel.create({
                youtubeId: channelId,
                youtubeUrl: channelIdToUrl(channelId),
                sources: {
                  socialBlade: true,
                  campaignIds: [],
                },
                status: 'unchecked',
                decisionLevel: null,
              });

              results.imported++;
            } catch (error) {
              results.errors.push({
                channelId,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        } catch (error) {
          results.errors.push({
            file: path.basename(filePath),
            error: error instanceof Error ? error.message : 'Failed to read file',
          });
        }
      }

      res.json({
        ok: true,
        message: `Processed ${results.filesProcessed} files`,
        results,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/import/folder/preview
 * Preview channels from a folder without importing
 */
router.get(
  '/folder/preview',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const folderPath = req.query.path as string;

      if (!folderPath) {
        throw ApiError.badRequest('path query parameter is required');
      }

      const resolvedPath = path.resolve(folderPath);
      
      if (!fs.existsSync(resolvedPath)) {
        throw ApiError.badRequest(`Folder not found: ${resolvedPath}`);
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        throw ApiError.badRequest(`Path is not a directory: ${resolvedPath}`);
      }

      const files = fs.readdirSync(resolvedPath)
        .filter(f => f.endsWith('.html'));

      let totalChannelIds = 0;
      const channelIds = new Set<string>();

      for (const file of files) {
        try {
          const html = fs.readFileSync(path.join(resolvedPath, file), 'utf-8');
          const ids = parseSocialBladeHtml(html);
          ids.forEach(id => channelIds.add(id));
          totalChannelIds += ids.length;
        } catch {
          // Skip files that can't be read
        }
      }

      res.json({
        ok: true,
        folderPath: resolvedPath,
        filesCount: files.length,
        fileNames: files.slice(0, 10), // First 10 files
        totalChannelIds,
        uniqueChannelIds: channelIds.size,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

