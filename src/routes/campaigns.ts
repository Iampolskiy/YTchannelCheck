/**
 * Campaign Routes
 * 
 * CRUD operations for campaigns.
 * Per Lastenheft: Campaigns must be created before importing.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Campaign } from '../models/index.js';
import { validateBody, validateParams, validateQuery, ApiError } from '../middleware/index.js';
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  CampaignIdParamSchema,
  ListCampaignsQuerySchema,
} from '../schemas/index.js';

const router = Router();

/**
 * GET /api/campaigns
 * List all campaigns, optionally filtered by type
 */
router.get(
  '/',
  validateQuery(ListCampaignsQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { type } = req.query as { type?: 'channel' | 'video' };
      
      const filter = type ? { type } : {};
      const campaigns = await Campaign.find(filter)
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        ok: true,
        campaigns,
        count: campaigns.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/campaigns/:id
 * Get a single campaign by ID
 */
router.get(
  '/:id',
  validateParams(CampaignIdParamSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      const campaign = await Campaign.findById(id).lean();
      
      if (!campaign) {
        throw ApiError.notFound('Campaign not found');
      }

      res.json({
        ok: true,
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/campaigns
 * Create a new campaign
 */
router.post(
  '/',
  validateBody(CreateCampaignSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, type } = req.body;

      const campaign = await Campaign.create({ name, type });

      res.status(201).json({
        ok: true,
        campaign: campaign.toObject(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/campaigns/:id
 * Update a campaign
 */
router.patch(
  '/:id',
  validateParams(CampaignIdParamSchema),
  validateBody(UpdateCampaignSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (Object.keys(updates).length === 0) {
        throw ApiError.badRequest('No updates provided');
      }

      const campaign = await Campaign.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      ).lean();

      if (!campaign) {
        throw ApiError.notFound('Campaign not found');
      }

      res.json({
        ok: true,
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/campaigns/:id
 * Delete a campaign
 */
router.delete(
  '/:id',
  validateParams(CampaignIdParamSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const campaign = await Campaign.findByIdAndDelete(id).lean();

      if (!campaign) {
        throw ApiError.notFound('Campaign not found');
      }

      res.json({
        ok: true,
        deleted: true,
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

