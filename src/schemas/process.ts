/**
 * Process Validation Schemas
 * 
 * Zod schemas for prefilter and AI filter job options.
 */

import { z } from 'zod';

// =============================================================================
// Prefilter Schemas
// =============================================================================

/**
 * Options for running the prefilter pipeline
 */
export const PrefilterOptionsSchema = z.object({
  // Limit number of channels to process (0 = all)
  limit: z.number().min(0).default(0),
  
  // Dry run: don't save status changes
  dryRun: z.boolean().default(false),
  
  // Location filter settings
  locationFilter: z
    .object({
      enabled: z.boolean().default(true),
      allowedCountries: z
        .array(z.string().trim().toLowerCase())
        .default(['deutschland', 'germany', 'de', 'österreich', 'austria', 'at', 'schweiz', 'switzerland', 'ch']),
      allowEmpty: z.boolean().default(true), // Pass if no country set
    })
    .optional(),
  
  // Alphabet check settings
  alphabetFilter: z
    .object({
      enabled: z.boolean().default(true),
      maxBadCharsDistinct: z.number().min(1).default(5),
      // Custom bad chars list (if not provided, uses default)
      badChars: z.array(z.string()).optional(),
    })
    .optional(),
  
  // Language check settings
  languageFilter: z
    .object({
      enabled: z.boolean().default(true),
      minGermanWords: z.number().min(1).default(5),
      // Custom word list (if not provided, uses default)
      germanWords: z.array(z.string()).optional(),
    })
    .optional(),
  
  // Topic filters settings
  topicFilters: z
    .object({
      enabled: z.boolean().default(true),
      // Each topic filter has keywords and threshold
      kids: z
        .object({
          enabled: z.boolean().default(true),
          keywords: z.array(z.string()).optional(),
          threshold: z.number().min(1).default(3),
        })
        .optional(),
      beauty: z
        .object({
          enabled: z.boolean().default(true),
          keywords: z.array(z.string()).optional(),
          threshold: z.number().min(1).default(3),
        })
        .optional(),
      gaming: z
        .object({
          enabled: z.boolean().default(true),
          keywords: z.array(z.string()).optional(),
          threshold: z.number().min(1).default(3),
        })
        .optional(),
    })
    .optional(),
});

export type PrefilterOptions = z.infer<typeof PrefilterOptionsSchema>;

// =============================================================================
// AI Filter Schemas
// =============================================================================

/**
 * Options for running the AI filter pipeline
 */
export const AIFilterOptionsSchema = z.object({
  // Limit number of channels to process (0 = all)
  limit: z.number().min(0).default(0),
  
  // Dry run: don't save status changes
  dryRun: z.boolean().default(false),
  
  // Ollama connection settings
  ollama: z
    .object({
      baseUrl: z.string().url().default('http://localhost:11434'),
      model: z.string().min(1).default('llama3.2'),
      timeout: z.number().min(1000).default(60000),
    })
    .optional(),
  
  // Which prompts to run (if empty, runs all)
  promptIds: z.array(z.string()).optional(),
});

export type AIFilterOptions = z.infer<typeof AIFilterOptionsSchema>;

// =============================================================================
// YouTube Extractor Schemas
// =============================================================================

/**
 * Options for running the YouTube extractor pipeline
 */
export const ExtractorOptionsSchema = z.object({
  // Limit number of channels to process (0 = all)
  limit: z.number().min(0).default(0),
  
  // Batch size for processing
  batchSize: z.number().min(1).max(100).default(15),
  
  // Number of concurrent extractions (parallel processing)
  concurrency: z.number().min(1).max(5).default(3),
  
  // Delay between channels (ms)
  delayBetweenChannels: z.number().min(200).max(30000).default(1000),
  
  // Max videos to extract per channel
  maxVideos: z.number().min(1).max(100).default(30),
  
  // Stop on captcha detection
  stopOnCaptcha: z.boolean().default(true),
  
  // Rate limiting options (for safeFetch)
  minIntervalMs: z.number().min(100).max(5000).default(500),
  jitterMs: z.number().min(0).max(2000).default(200),
  
  // Skip videos page for faster extraction (only get about page for country info)
  skipVideos: z.boolean().default(false),
  
  // Request settings
  minIntervalMs: z.number().min(500).default(2000),
  jitterMs: z.number().min(0).default(500),
  maxRetries: z.number().min(0).max(10).default(3),
  timeoutMs: z.number().min(5000).default(25000),
});

export type ExtractorOptions = z.infer<typeof ExtractorOptionsSchema>;

// =============================================================================
// Manual Status Change Schemas
// =============================================================================

/**
 * Change status of a single channel
 */
export const ChangeChannelStatusSchema = z.object({
  youtubeId: z.string().min(1, 'YouTube ID is required'),
  status: z.enum(['positive', 'negative', 'unchecked']),
});

export type ChangeChannelStatus = z.infer<typeof ChangeChannelStatusSchema>;

/**
 * Mass status change for multiple channels
 */
export const MassStatusChangeSchema = z.object({
  youtubeIds: z
    .array(z.string().min(1))
    .min(1, 'At least one YouTube ID is required'),
  status: z.enum(['positive', 'negative', 'unchecked']),
});

export type MassStatusChange = z.infer<typeof MassStatusChangeSchema>;

/**
 * Reset channels to unchecked based on filter
 */
export const ResetToUncheckedSchema = z.object({
  // Filter by current status
  fromStatus: z.enum(['prefiltered', 'positive', 'negative']).optional(),
  
  // Filter by decision level
  fromDecisionLevel: z.enum(['prefilter', 'ai', 'manual']).optional(),
  
  // Exclude manually decided channels
  excludeManual: z.boolean().default(true),
  
  // Limit (0 = all matching)
  limit: z.number().min(0).default(0),
});

export type ResetToUnchecked = z.infer<typeof ResetToUncheckedSchema>;

