/**
 * Campaign Validation Schemas
 * 
 * Zod schemas for campaign CRUD operations.
 * Per Lastenheft: Campaigns must be created before importing.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Campaign type enum
 * Per Lastenheft: Separated lists for channel vs video imports
 */
export const CampaignTypeSchema = z.enum(['channel', 'video']);

export type CampaignTypeValue = z.infer<typeof CampaignTypeSchema>;

// =============================================================================
// Campaign Schemas
// =============================================================================

/**
 * Create a new campaign
 */
export const CreateCampaignSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(200, 'Name must be 200 characters or less'),
  type: CampaignTypeSchema,
});

export type CreateCampaign = z.infer<typeof CreateCampaignSchema>;

/**
 * Update an existing campaign
 */
export const UpdateCampaignSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(200, 'Name must be 200 characters or less')
    .optional(),
});

export type UpdateCampaign = z.infer<typeof UpdateCampaignSchema>;

/**
 * Campaign ID parameter
 */
export const CampaignIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'Invalid campaign ID'),
});

export type CampaignIdParam = z.infer<typeof CampaignIdParamSchema>;

/**
 * List campaigns query params
 */
export const ListCampaignsQuerySchema = z.object({
  type: CampaignTypeSchema.optional(),
});

export type ListCampaignsQuery = z.infer<typeof ListCampaignsQuerySchema>;

