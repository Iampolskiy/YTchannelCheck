/**
 * Import Validation Schemas
 * 
 * Zod schemas for channel and video import inputs.
 * Per .cursorrules: Validate all external input.
 */

import { z } from 'zod';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Validates a YouTube URL (channel or video)
 */
const youtubeUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL cannot be empty')
  .refine(
    (url) => {
      const lower = url.toLowerCase();
      return (
        lower.includes('youtube.com') ||
        lower.includes('youtu.be') ||
        lower.startsWith('https://www.youtube.com') ||
        lower.startsWith('http://www.youtube.com')
      );
    },
    { message: 'Must be a valid YouTube URL' }
  );

/**
 * Validates a MongoDB ObjectId string
 */
const objectIdSchema = z
  .string()
  .trim()
  .min(1, 'ID cannot be empty')
  .regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid ObjectId');

// =============================================================================
// Channel Import Schemas
// =============================================================================

/**
 * Single channel URL import
 */
export const ChannelUrlSchema = youtubeUrlSchema;

/**
 * Textarea input: multiple channel URLs (newline-separated)
 */
export const ChannelTextareaInputSchema = z.object({
  text: z
    .string()
    .min(1, 'Text cannot be empty')
    .transform((text) =>
      text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    ),
  campaignId: objectIdSchema.optional(),
});

export type ChannelTextareaInput = z.infer<typeof ChannelTextareaInputSchema>;

/**
 * CSV upload for channels
 * The actual parsing happens in the route, this validates the parsed result
 */
export const ChannelCsvInputSchema = z.object({
  urls: z
    .array(youtubeUrlSchema)
    .min(1, 'At least one URL is required'),
  campaignId: objectIdSchema.optional(),
});

export type ChannelCsvInput = z.infer<typeof ChannelCsvInputSchema>;

/**
 * Unified channel import input (used internally after parsing)
 */
export const ChannelImportSchema = z.object({
  urls: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one URL is required'),
  campaignId: objectIdSchema.optional(),
});

export type ChannelImport = z.infer<typeof ChannelImportSchema>;

// =============================================================================
// Video Import Schemas
// =============================================================================

/**
 * Textarea input: multiple video URLs (newline-separated)
 */
export const VideoTextareaInputSchema = z.object({
  text: z
    .string()
    .min(1, 'Text cannot be empty')
    .transform((text) =>
      text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    ),
  campaignId: objectIdSchema.optional(),
});

export type VideoTextareaInput = z.infer<typeof VideoTextareaInputSchema>;

/**
 * CSV upload for videos
 */
export const VideoCsvInputSchema = z.object({
  urls: z
    .array(youtubeUrlSchema)
    .min(1, 'At least one URL is required'),
  campaignId: objectIdSchema.optional(),
});

export type VideoCsvInput = z.infer<typeof VideoCsvInputSchema>;

/**
 * Unified video import input (used internally after parsing)
 */
export const VideoImportSchema = z.object({
  urls: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one URL is required'),
  campaignId: objectIdSchema.optional(),
});

export type VideoImport = z.infer<typeof VideoImportSchema>;

// =============================================================================
// SocialBlade Import Schema
// =============================================================================

/**
 * Options for SocialBlade HTML processing
 */
export const SocialBladeProcessOptionsSchema = z.object({
  inputDir: z.string().optional(),
  fetchOptions: z
    .object({
      minIntervalMs: z.number().min(500).optional(),
      jitterMs: z.number().min(0).optional(),
      maxRetries: z.number().min(0).max(20).optional(),
      timeoutMs: z.number().min(1000).optional(),
      concurrency: z.number().min(1).max(5).optional(),
    })
    .optional(),
  switchTabMinMs: z.number().min(1000).optional(),
  switchTabMaxMs: z.number().min(1000).optional(),
  betweenChMinMs: z.number().min(1000).optional(),
  betweenChMaxMs: z.number().min(1000).optional(),
  videosLimit: z.number().min(1).max(100).optional(),
});

export type SocialBladeProcessOptions = z.infer<typeof SocialBladeProcessOptionsSchema>;

