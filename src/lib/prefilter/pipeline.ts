/**
 * Prefilter pipeline for batch processing channels.
 * Processes unchecked channels and updates their status based on filter results.
 */

import { Channel } from '../../models/index.js';
import { runPrefilter, type PrefilterOptions, type PrefilterResult } from './filters.js';
import type { ChannelInfo, VideoInfo } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface PrefilterPipelineOptions extends PrefilterOptions {
  /** Batch size for processing channels */
  batchSize?: number;
  /** Callback for progress updates */
  onProgress?: (stats: PrefilterStats) => void;
  /** Callback for logging */
  onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
  /** If true, stop processing on first error */
  stopOnError?: boolean;
}

export interface PrefilterStats {
  total: number;
  processed: number;
  passed: number;
  failed: number;
  failedByLocation: number;
  failedByAlphabet: number;
  failedByLanguage: number;
  errors: number;
  isComplete: boolean;
}

interface ChannelDocument {
  _id: unknown;
  youtubeId: string;
  channelInfo?: ChannelInfo;
  videos?: VideoInfo[];
}

// ============================================================================
// Pipeline Runner
// ============================================================================

/**
 * Run the prefilter pipeline on all unchecked channels.
 * Updates channel status to 'prefiltered' (passed) or 'negative' (failed).
 */
export async function runPrefilterPipeline(
  options: PrefilterPipelineOptions = {}
): Promise<PrefilterStats> {
  const {
    batchSize = 100,
    onProgress,
    onLog,
    stopOnError = false,
    ...filterOptions
  } = options;

  const log = onLog ?? (() => {});

  // Get total count of unchecked channels
  const total = await Channel.countDocuments({ status: 'unchecked' });
  
  const stats: PrefilterStats = {
    total,
    processed: 0,
    passed: 0,
    failed: 0,
    failedByLocation: 0,
    failedByAlphabet: 0,
    failedByLanguage: 0,
    errors: 0,
    isComplete: false
  };

  if (total === 0) {
    log('info', 'No unchecked channels to process');
    stats.isComplete = true;
    return stats;
  }

  log('info', `Starting prefilter pipeline for ${total} channels`);

  // Process in batches
  let hasMore = true;
  
  while (hasMore) {
    // Fetch next batch of unchecked channels
    const channels = await Channel.find({ status: 'unchecked' })
      .limit(batchSize)
      .lean<ChannelDocument[]>();

    if (channels.length === 0) {
      hasMore = false;
      break;
    }

    // Process each channel in the batch
    for (const channel of channels) {
      try {
        const result = processChannel(channel, filterOptions, log);
        
        // Update channel in database
        await updateChannelStatus(channel.youtubeId, result);
        
        // Update stats
        stats.processed++;
        if (result.passed) {
          stats.passed++;
        } else {
          stats.failed++;
          if (result.failedRule === 'location') stats.failedByLocation++;
          else if (result.failedRule === 'alphabet') stats.failedByAlphabet++;
          else if (result.failedRule === 'language') stats.failedByLanguage++;
        }
        
      } catch (error) {
        stats.errors++;
        stats.processed++;
        console.error('Prefilter error for channel', channel.youtubeId, error);
        log('error', `Error processing channel ${channel.youtubeId}`, error);
        
        // Mark channel as having an error to prevent infinite loop
        try {
          await Channel.updateOne(
            { youtubeId: channel.youtubeId },
            {
              $set: {
                status: 'negative',
                decisionLevel: 'prefilter',
                prefilterCheck: {
                  checkedAt: new Date(),
                  passed: false,
                  passedRules: [],
                  failedRule: null,
                  failedReason: `Error: ${error instanceof Error ? error.message : String(error)}`,
                  details: null
                }
              }
            }
          );
        } catch (updateError) {
          console.error('Failed to update channel status', updateError);
        }
        
        if (stopOnError) {
          throw error;
        }
      }
    }

    // Emit progress
    onProgress?.(stats);
    
    // Check if we've processed all
    if (stats.processed >= total) {
      hasMore = false;
    }
  }

  stats.isComplete = true;
  log('info', `Prefilter complete: ${stats.passed} passed, ${stats.failed} failed, ${stats.errors} errors`);
  
  return stats;
}

/**
 * Process a single channel through the prefilter.
 */
function processChannel(
  channel: ChannelDocument,
  options: PrefilterOptions,
  log?: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void
): PrefilterResult {
  // Debug logging
  log?.('info', `Processing channel ${channel.youtubeId}`, {
    hasChannelInfo: !!channel.channelInfo,
    country: channel.channelInfo?.country,
    title: channel.channelInfo?.title,
  });
  
  return runPrefilter(
    channel.channelInfo,
    channel.videos,
    options
  );
}

/**
 * Update channel status based on prefilter result.
 */
async function updateChannelStatus(
  youtubeId: string,
  result: PrefilterResult
): Promise<void> {
  const now = new Date();
  
  if (result.passed) {
    // Passed prefilter - mark as prefiltered (ready for AI)
    await Channel.updateOne(
      { youtubeId },
      {
        $set: {
          status: 'prefiltered',
          decisionLevel: 'prefilter',
          prefilterCheck: {
            checkedAt: now,
            passed: true,
            passedRules: ['location', 'alphabet', 'language'],
            failedRule: null,
            failedReason: null,
            details: null
          }
        }
      }
    );
  } else {
    // Failed prefilter - mark as negative
    await Channel.updateOne(
      { youtubeId },
      {
        $set: {
          status: 'negative',
          decisionLevel: 'prefilter',
          prefilterCheck: {
            checkedAt: now,
            passed: false,
            passedRules: [],
            failedRule: result.failedRule,
            failedReason: result.reason,
            details: {
              location: result.location,
              alphabet: result.alphabet,
              language: result.language
            }
          }
        }
      }
    );
  }
}

