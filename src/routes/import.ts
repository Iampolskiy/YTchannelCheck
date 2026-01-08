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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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
 */
function parseCsvUrls(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const urls: string[] = [];
  // Regex to find youtube URLs (channel, user, c, @, or video) or SocialBlade URLs
  const urlRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:channel\/|c\/|@|user\/|watch\?v=)|youtu\.be\/|socialblade\.com\/youtube\/[\w/-]+)[\w.-]+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip header row if it looks like a header (and doesn't look like a URL)
    if (i === 0 && !line.includes('http') && (line.toLowerCase().includes('url') || line.toLowerCase().includes('link') || line.toLowerCase().includes('placement'))) {
      continue;
    }

    // 1. Try regex match first
    const match = line.match(urlRegex);
    if (match) {
      let foundUrl = match[0];
      
      // Convert SocialBlade URL to YouTube URL
      if (foundUrl.includes('socialblade.com')) {
        if (foundUrl.includes('/handle/')) {
           const handle = foundUrl.split('/handle/')[1];
           if (handle) foundUrl = `https://www.youtube.com/@${handle}`;
        } else if (foundUrl.includes('/channel/')) {
           const id = foundUrl.split('/channel/')[1];
           if (id) foundUrl = `https://www.youtube.com/channel/${id}`;
        } else if (foundUrl.includes('/user/')) {
           const user = foundUrl.split('/user/')[1];
           if (user) foundUrl = `https://www.youtube.com/user/${user}`;
        } else if (foundUrl.includes('/c/')) {
            const c = foundUrl.split('/c/')[1];
            if (c) foundUrl = `https://www.youtube.com/c/${c}`;
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
               const handle = clean.split('/handle/')[1];
               if (handle) clean = `https://www.youtube.com/@${handle}`;
            } else if (clean.includes('/channel/')) {
               const id = clean.split('/channel/')[1];
               if (id) clean = `https://www.youtube.com/channel/${id}`;
            } else if (clean.includes('/user/')) {
               const user = clean.split('/user/')[1];
               if (user) clean = `https://www.youtube.com/user/${user}`;
            } else if (clean.includes('/c/')) {
                const c = clean.split('/c/')[1];
                if (c) clean = `https://www.youtube.com/c/${c}`;
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
      const content = req.file.buffer.toString('utf-8');
      const urls = parseCsvUrls(content);

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

          const scraped = await scrapeChannel(url);
          
          const existingById = await Channel.findOne({ youtubeId: scraped.youtubeId });
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

