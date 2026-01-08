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
  // Sorting options
  sortBy: z.enum([
    'youtubeId', 
    'channelInfo.title', 
    'channelInfo.subscriberCountText', 
    'channelInfo.country',
    'status', 
    'createdAt', 
    'updatedAt'
  ]).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

const BulkDeleteSchema = z.object({
  youtubeIds: z.array(z.string().min(1)).optional(),
  deleteAllMatching: z.boolean().optional(),
  q: z.string().optional(), // Search query filter for mass delete
});

const ResetDatabaseSchema = z.object({
  target: z.enum(['all', 'negative', 'positive', 'unchecked']),
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
      const { status, decisionLevel, limit, skip, q, sortBy, sortDir } = query;

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

      // Special handling for Country Sort: Filter out nulls
      if (sortBy === 'channelInfo.country') {
        filter['channelInfo.country'] = { $ne: null, $exists: true, $ne: '' };
      }

      // Build sort
      const sort: Record<string, 1 | -1> = {};
      if (sortBy) {
        sort[sortBy] = sortDir === 'asc' ? 1 : -1;
      } else {
        sort.createdAt = -1; // Default
      }

      // Get total count
      const total = await Channel.countDocuments(filter);

      // Get channels with projection (exclude heavy fields for list view)
      const channels = await Channel.find(filter)
        .sort(sort)
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
          rejectionReason: 1,
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
 * POST /api/channels/bulk-delete
 * Delete multiple channels (by IDs or by filter)
 */
router.post(
  '/bulk-delete',
  validateBody(BulkDeleteSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { youtubeIds, deleteAllMatching, q } = req.body;

      let result;

      if (deleteAllMatching) {
        // Delete all matching the current filter (q)
        // Note: This is simplified. In a real app, you'd match all filters (status, etc.)
        // For DatabaseManager, we mainly use 'q' (searchQuery) for filtering.
        const filter: Record<string, unknown> = {};
        if (q) {
          filter.$or = [
            { youtubeId: { $regex: q, $options: 'i' } },
            { youtubeUrl: { $regex: q, $options: 'i' } },
            { 'channelInfo.title': { $regex: q, $options: 'i' } },
            { 'channelInfo.handle': { $regex: q, $options: 'i' } },
          ];
        }
        // Safety: If no query and deleteAllMatching is true, it deletes EVERYTHING.
        // This is intentional but dangerous.
        result = await Channel.deleteMany(filter);
      } else {
        // Delete by specific IDs
        if (!youtubeIds || youtubeIds.length === 0) {
          throw ApiError.badRequest('No IDs provided');
        }
        result = await Channel.deleteMany({ youtubeId: { $in: youtubeIds } });
      }

      res.json({
        ok: true,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/channels/reset
 * Reset/Delete channels by status or all
 */
router.post(
  '/reset',
  validateBody(ResetDatabaseSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { target } = req.body;
      const filter: Record<string, unknown> = {};

      if (target === 'all') {
        // No filter, delete everything
      } else {
        // Filter by status
        filter.status = target;
      }

      const result = await Channel.deleteMany(filter);

      res.json({
        ok: true,
        deletedCount: result.deletedCount,
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
  validateBody(ChangeChannelStatusSchema.pick({ status: true, reason: true })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { youtubeId } = req.params;
      const { status, reason } = req.body;

      const update: Record<string, unknown> = {
        status,
        decisionLevel: 'manual',
      };

      if (status === 'negative' && reason) {
        update.rejectionReason = reason;
      } else if (status !== 'negative') {
         // Clear rejection reason if not negative
         update.rejectionReason = null;
      }

      const channel = await Channel.findOneAndUpdate(
        { youtubeId },
        { $set: update },
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
 * DELETE /api/channels/:youtubeId
 * Delete a single channel
 */
router.delete(
  '/:youtubeId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { youtubeId } = req.params;

      const result = await Channel.deleteOne({ youtubeId });

      if (result.deletedCount === 0) {
        throw ApiError.notFound('Channel not found');
      }

      res.json({
        ok: true,
        deleted: true,
        youtubeId,
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
