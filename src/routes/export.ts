/**
 * Export Routes
 * 
 * Export channels as TXT or CSV for Google Ads.
 * Per Lastenheft: Full export, filter by status and source.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Channel } from '../models/index.js';
import { validateBody } from '../middleware/index.js';
import { ExportOptionsSchema } from '../schemas/index.js';
import type { ExportOptions } from '../schemas/index.js';

const router = Router();

/**
 * Build MongoDB filter from export options
 */
function buildExportFilter(options: ExportOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  // Status filter
  if (options.status === 'negative') {
    filter.status = 'negative';
  } else if (options.status === 'positive') {
    filter.status = 'positive';
  } else {
    // 'both' - include both positive and negative
    filter.status = { $in: ['positive', 'negative'] };
  }

  // Source filters
  const sourceConditions: Record<string, unknown>[] = [];

  if (options.sources.includeSocialBlade) {
    sourceConditions.push({ 'sources.socialBlade': true });
  }

  if (options.sources.campaignIds.length > 0) {
    sourceConditions.push({
      'sources.campaignIds': { $in: options.sources.campaignIds },
    });
  }

  // If no source filters, include all
  if (sourceConditions.length > 0) {
    if (options.sources.matchAll) {
      // Must match all conditions
      filter.$and = sourceConditions;
    } else {
      // Must match any condition
      filter.$or = sourceConditions;
    }
  }

  return filter;
}

/**
 * Generate TXT content (one URL per line)
 */
function generateTxt(channels: Array<{ youtubeUrl: string }>): string {
  return channels.map((c) => c.youtubeUrl).join('\n');
}

/**
 * Generate CSV content (Google Ads format)
 * Per Lastenheft: Hardcoded format for Google Ads placement exclusion
 */
function generateCsv(channels: Array<{ youtubeUrl: string; youtubeId: string }>): string {
  // Google Ads placement exclusion CSV format
  const header = 'Placement';
  const rows = channels.map((c) => c.youtubeUrl);
  return [header, ...rows].join('\n');
}

/**
 * POST /api/export
 * Export channels based on options
 */
router.post(
  '/',
  validateBody(ExportOptionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const options = req.body as ExportOptions;

      const filter = buildExportFilter(options);

      // Get all matching channels (full export per Lastenheft)
      const channels = await Channel.find(filter)
        .select({ youtubeId: 1, youtubeUrl: 1 })
        .lean();

      // Generate content based on format
      let content: string;
      let contentType: string;
      let filename: string;
      const timestamp = new Date().toISOString().split('T')[0];

      if (options.format === 'txt') {
        content = generateTxt(channels);
        contentType = 'text/plain';
        filename = `youtube-channels-${options.status}-${timestamp}.txt`;
      } else {
        content = generateCsv(channels);
        contentType = 'text/csv';
        filename = `youtube-channels-${options.status}-${timestamp}.csv`;
      }

      // Set headers for file download
      res.setHeader('Content-Type', `${contentType}; charset=utf-8`);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/export/preview
 * Preview export (count only, no file)
 */
router.post(
  '/preview',
  validateBody(ExportOptionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const options = req.body as ExportOptions;

      const filter = buildExportFilter(options);
      const count = await Channel.countDocuments(filter);

      res.json({
        ok: true,
        count,
        options,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

