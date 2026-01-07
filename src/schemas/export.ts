/**
 * Export Validation Schemas
 * 
 * Zod schemas for export options.
 * Per Lastenheft: Export negative/positive/both, filter by source, TXT/CSV formats.
 */

import { z } from 'zod';

// =============================================================================
// Export Schemas
// =============================================================================

/**
 * Export status filter
 */
export const ExportStatusSchema = z.enum(['negative', 'positive', 'both']);

export type ExportStatusValue = z.infer<typeof ExportStatusSchema>;

/**
 * Export format
 */
export const ExportFormatSchema = z.enum(['txt', 'csv']);

export type ExportFormatValue = z.infer<typeof ExportFormatSchema>;

/**
 * Export options
 * Per Lastenheft:
 * - Select negative/positive/both (default: negative)
 * - Filter by sources (SocialBlade, specific campaigns)
 * - Format: TXT (one URL per line) or CSV (Google Ads format)
 * - Full export, no delta logic
 */
export const ExportOptionsSchema = z.object({
  // Which channels to export (default: negative)
  status: ExportStatusSchema.default('negative'),
  
  // Output format (default: csv)
  format: ExportFormatSchema.default('csv'),
  
  // Source filters
  sources: z
    .object({
      // Include channels from SocialBlade
      includeSocialBlade: z.boolean().default(true),
      
      // Include channels from specific campaigns (empty = all campaigns)
      campaignIds: z.array(z.string()).default([]),
      
      // If true, channel must match ALL selected sources
      // If false, channel must match ANY selected source
      matchAll: z.boolean().default(false),
    })
    .default({ includeSocialBlade: true, campaignIds: [], matchAll: false }),
});

export type ExportOptions = z.infer<typeof ExportOptionsSchema>;

/**
 * Export query params (for GET endpoint)
 */
export const ExportQuerySchema = z.object({
  status: ExportStatusSchema.optional(),
  format: ExportFormatSchema.optional(),
  includeSocialBlade: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  campaignIds: z
    .string()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .optional(),
});

export type ExportQuery = z.infer<typeof ExportQuerySchema>;

