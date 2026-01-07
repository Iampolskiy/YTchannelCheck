/**
 * Schemas Index
 * 
 * Re-exports all Zod validation schemas and their inferred types.
 * Per .cursorrules: Group related schemas in /lib/schemas/
 */

// =============================================================================
// Import Schemas
// =============================================================================
export {
  ChannelUrlSchema,
  ChannelTextareaInputSchema,
  ChannelCsvInputSchema,
  ChannelImportSchema,
  VideoTextareaInputSchema,
  VideoCsvInputSchema,
  VideoImportSchema,
  SocialBladeProcessOptionsSchema,
  type ChannelTextareaInput,
  type ChannelCsvInput,
  type ChannelImport,
  type VideoTextareaInput,
  type VideoCsvInput,
  type VideoImport,
  type SocialBladeProcessOptions,
} from './import.js';

// =============================================================================
// Campaign Schemas
// =============================================================================
export {
  CampaignTypeSchema,
  CreateCampaignSchema,
  UpdateCampaignSchema,
  CampaignIdParamSchema,
  ListCampaignsQuerySchema,
  type CampaignTypeValue,
  type CreateCampaign,
  type UpdateCampaign,
  type CampaignIdParam,
  type ListCampaignsQuery,
} from './campaign.js';

// =============================================================================
// Process Schemas
// =============================================================================
export {
  PrefilterOptionsSchema,
  AIFilterOptionsSchema,
  ExtractorOptionsSchema,
  ChangeChannelStatusSchema,
  MassStatusChangeSchema,
  ResetToUncheckedSchema,
  type PrefilterOptions,
  type AIFilterOptions,
  type ExtractorOptions,
  type ChangeChannelStatus,
  type MassStatusChange,
  type ResetToUnchecked,
} from './process.js';

// =============================================================================
// Export Schemas
// =============================================================================
export {
  ExportStatusSchema,
  ExportFormatSchema,
  ExportOptionsSchema,
  ExportQuerySchema,
  type ExportStatusValue,
  type ExportFormatValue,
  type ExportOptions,
  type ExportQuery,
} from './export.js';

