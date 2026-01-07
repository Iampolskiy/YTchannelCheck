/**
 * Channel Routes
 * 
 * List and view channels, manual status changes.
 * Per Lastenheft: Views for each status + mass actions.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Channel } from '../models/index.js';
import { validateBody, validateQuery, ApiError } from '../middleware/index.js';
import {
  ChangeChannelStatusSchema,
  MassStatusChangeSchema,
  ResetToUncheckedSchema,
} from '../schemas/index.js';
import { z } from 'zod';

const router = Router();

// =============================================================================
// Query Schema for listing channels
// =============================================================================

const ListChannelsQuerySchema = z.object({
  status: z.enum(['unchecked', 'prefiltered', 'positive', 'negative']).optional(),
  decisionLevel: z.enum(['prefilter', 'ai', 'manual']).optional(),
  limit: z.coerce.number().min(1).max(1000000).default(1000),
  skip: z.coerce.number().min(0).default(0),
  q: z.string().optional(), // Search query
});

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/channels
 * List channels with filtering and pagination
 * Per Lastenheft: Load limits (1k, 10k, 100k, 1M, all)
 */
router.get(
  '/',
  validateQuery(ListChannelsQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // After validation middleware, req.query is the parsed result
      const query = req.query as unknown as z.infer<typeof ListChannelsQuerySchema>;
      const { status, decisionLevel, limit, skip, q } = query;

      // Build filter
      const filter: Record<string, unknown> = {};
      
      if (status) {
        filter.status = status;
      }
      
      if (decisionLevel) {
        filter.decisionLevel = decisionLevel;
      }
      
      if (q) {
        filter.$or = [
          { youtubeId: { $regex: q, $options: 'i' } },
          { youtubeUrl: { $regex: q, $options: 'i' } },
          { 'channelInfo.title': { $regex: q, $options: 'i' } },
          { 'channelInfo.handle': { $regex: q, $options: 'i' } },
        ];
      }

      // Get total count
      const total = await Channel.countDocuments(filter);

      // Get channels with projection (exclude heavy fields for list view)
      const channels = await Channel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select({
          youtubeId: 1,
          youtubeUrl: 1,
          status: 1,
          decisionLevel: 1,
          sources: 1,
          'channelInfo.title': 1,
          'channelInfo.handle': 1,
          'channelInfo.country': 1,
          'channelInfo.subscriberCountText': 1,
          ytAboutOk: 1,
          ytVideosOk: 1,
          extractedAt: 1,
          createdAt: 1,
        })
        .lean();

      res.json({
        ok: true,
        total,
        channels,
        count: channels.length,
        hasMore: skip + channels.length < total,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/channels/stats
 * Get channel counts by status
 */
router.get(
  '/stats',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [unchecked, prefiltered, positive, negative, total] = await Promise.all([
        Channel.countDocuments({ status: 'unchecked' }),
        Channel.countDocuments({ status: 'prefiltered' }),
        Channel.countDocuments({ status: 'positive' }),
        Channel.countDocuments({ status: 'negative' }),
        Channel.countDocuments(),
      ]);

      res.json({
        ok: true,
        stats: {
          unchecked,
          prefiltered,
          positive,
          negative,
          total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/channels/:youtubeId
 * Get a single channel with full details (including videos)
 */
router.get(
  '/:youtubeId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { youtubeId } = req.params;

      const channel = await Channel.findOne({ youtubeId }).lean();

      if (!channel) {
        throw ApiError.notFound('Channel not found');
      }

      res.json({
        ok: true,
        channel,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/channels/:youtubeId/status
 * Change status of a single channel (manual decision)
 * Per Lastenheft: Manual decisions are marked with decisionLevel = 'manual'
 */
router.patch(
  '/:youtubeId/status',
  validateBody(ChangeChannelStatusSchema.pick({ status: true })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { youtubeId } = req.params;
      const { status } = req.body;

      const channel = await Channel.findOneAndUpdate(
        { youtubeId },
        {
          $set: {
            status,
            decisionLevel: 'manual', // Mark as manual decision
          },
        },
        { new: true }
      ).lean();

      if (!channel) {
        throw ApiError.notFound('Channel not found');
      }

      res.json({
        ok: true,
        channel,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/channels/mass-status
 * Change status of multiple channels (manual decision)
 */
router.post(
  '/mass-status',
  validateBody(MassStatusChangeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { youtubeIds, status } = req.body;

      const result = await Channel.updateMany(
        { youtubeId: { $in: youtubeIds } },
        {
          $set: {
            status,
            decisionLevel: 'manual',
          },
        }
      );

      res.json({
        ok: true,
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/channels/reset-to-unchecked
 * Reset channels to unchecked status based on filters
 * Per Lastenheft: Can exclude manually decided channels
 */
router.post(
  '/reset-to-unchecked',
  validateBody(ResetToUncheckedSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fromStatus, fromDecisionLevel, excludeManual, limit } = req.body;

      // Build filter
      const filter: Record<string, unknown> = {};
      
      if (fromStatus) {
        filter.status = fromStatus;
      }
      
      if (fromDecisionLevel) {
        filter.decisionLevel = fromDecisionLevel;
      }
      
      if (excludeManual) {
        filter.decisionLevel = { $ne: 'manual' };
      }

      // If limit is set, we need to find IDs first
      if (limit > 0) {
        const channelsToReset = await Channel.find(filter)
          .limit(limit)
          .select({ youtubeId: 1 })
          .lean();

        const ids = channelsToReset.map((c) => c.youtubeId);

        const result = await Channel.updateMany(
          { youtubeId: { $in: ids } },
          {
            $set: {
              status: 'unchecked',
              decisionLevel: null,
            },
          }
        );

        res.json({
          ok: true,
          modifiedCount: result.modifiedCount,
        });
      } else {
        // Reset all matching
        const result = await Channel.updateMany(filter, {
          $set: {
            status: 'unchecked',
            decisionLevel: null,
          },
        });

        res.json({
          ok: true,
          modifiedCount: result.modifiedCount,
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;

