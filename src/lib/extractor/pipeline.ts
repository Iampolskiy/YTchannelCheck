/**
 * YouTube Extractor Pipeline
 * 
 * Fetches and extracts data from YouTube channels.
 * Updates channels with channel info and videos.
 */

import { Channel } from '../../models/index.js';
import {
  fetchChannelAbout,
  fetchChannelVideos,
  fetchVideoPage,
  CaptchaError,
  type FetcherOptions,
} from '../fetcher.js';
import {
  extractYtInitialData,
  extractChannelInfo,
  extractVideos,
  extractChannelIdFromVideoPage,
  normalizeYoutubeUrl,
} from '../youtube.js';
import type { ChannelInfo, VideoInfo } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ExtractorOptions extends FetcherOptions {
  /** Batch size for processing */
  batchSize?: number;
  /** Number of concurrent extractions (parallel processing) */
  concurrency?: number;
  /** Delay between channels (ms) */
  delayBetweenChannels?: number;
  /** Max videos to extract per channel */
  maxVideos?: number;
  /** Stop on captcha detection */
  stopOnCaptcha?: boolean;
  /** Skip fetching videos page for faster extraction */
  skipVideos?: boolean;
  /** Progress callback */
  onProgress?: (stats: ExtractorStats) => void;
  /** Log callback */
  onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
}

export interface ExtractorStats {
  total: number;
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  captchaDetected: boolean;
  isComplete: boolean;
}

export interface ExtractionResult {
  youtubeId: string;
  success: boolean;
  channelInfo?: ChannelInfo;
  videos?: VideoInfo[];
  error?: string;
  aboutOk: boolean;
  videosOk: boolean;
}

// ============================================================================
// Helper: Pause Between Requests
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Single Channel Extraction
// ============================================================================

/**
 * Extract data from a single YouTube channel
 */
export async function extractChannel(
  youtubeUrl: string,
  options: ExtractorOptions = {}
): Promise<ExtractionResult> {
  const { maxVideos = 30, skipVideos = false } = options;
  const result: ExtractionResult = {
    youtubeId: '',
    success: false,
    aboutOk: false,
    videosOk: false,
  };

  const baseUrl = normalizeYoutubeUrl(youtubeUrl);

  // 1. Fetch and parse /about page
  try {
    const aboutHtml = await fetchChannelAbout(baseUrl, options);
    const aboutData = extractYtInitialData(aboutHtml);

    if (!aboutData) {
      result.error = 'Could not extract ytInitialData from about page';
      return result;
    }

    const channelInfo = extractChannelInfo(aboutData);
    result.channelInfo = channelInfo;
    result.youtubeId = channelInfo.id || '';
    result.aboutOk = true;
  } catch (error) {
    if (error instanceof CaptchaError) {
      throw error; // Re-throw captcha errors
    }
    result.error = `About page error: ${error instanceof Error ? error.message : String(error)}`;
    return result;
  }

  // 2. Fetch and parse /videos page (unless skipVideos is enabled)
  if (!skipVideos) {
    // Small delay between requests to same channel
    const internalDelay = Math.min(options.delayBetweenChannels ?? 300, 300);
    await sleep(internalDelay);

    try {
      const videosHtml = await fetchChannelVideos(baseUrl, options);
      const videosData = extractYtInitialData(videosHtml);

      if (videosData) {
        result.videos = extractVideos(videosData, maxVideos);
        result.videosOk = true;
      }
    } catch (error) {
      if (error instanceof CaptchaError) {
        throw error; // Re-throw captcha errors
      }
      // Videos page failure is non-fatal
      result.videos = [];
    }
  } else {
    // Skip videos - just mark as OK with empty array
    result.videos = [];
    result.videosOk = true;
  }

  result.success = result.aboutOk;
  return result;
}

/**
 * Resolve a video URL to its channel ID
 */
export async function resolveVideoToChannel(
  videoUrl: string,
  options: ExtractorOptions = {}
): Promise<string | null> {
  try {
    const html = await fetchVideoPage(videoUrl, options);
    const data = extractYtInitialData(html);
    if (!data) return null;
    return extractChannelIdFromVideoPage(data);
  } catch {
    return null;
  }
}

// ============================================================================
// Parallel Processing Helper
// ============================================================================

/**
 * Process items in parallel with a concurrency limit
 */
async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
  onResult?: (result: R, index: number) => void
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];
      try {
        const result = await processor(item);
        results[index] = result;
        onResult?.(result, index);
      } catch (error) {
        throw error; // Propagate errors (like CaptchaError)
      }
    }
  }

  // Start workers up to concurrency limit
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

// ============================================================================
// Pipeline Runner
// ============================================================================

/**
 * Run the extractor pipeline on channels that need YouTube data.
 * 
 * This processes channels that:
 * - Have status 'unchecked'
 * - Don't have complete YouTube data (ytAboutOk = false)
 */
export async function runExtractorPipeline(
  options: ExtractorOptions = {}
): Promise<ExtractorStats> {
  const {
    batchSize = 15,
    concurrency = 3,
    delayBetweenChannels = 1000,
    stopOnCaptcha = true,
    onProgress,
    onLog,
    ...fetchOptions
  } = options;

  const log = onLog ?? (() => {});

  // Find channels needing extraction
  const total = await Channel.countDocuments({
    status: 'unchecked',
    ytAboutOk: { $ne: true },
  });

  const stats: ExtractorStats = {
    total,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    captchaDetected: false,
    isComplete: false,
  };

  if (total === 0) {
    log('info', 'No channels need extraction');
    stats.isComplete = true;
    return stats;
  }

  log('info', `Starting extraction for ${total} channels (concurrency: ${concurrency})`);

  // Process in batches with parallel processing
  let hasMore = true;

  while (hasMore && !stats.captchaDetected) {
    // Fetch next batch
    const channels = await Channel.find({
      status: 'unchecked',
      ytAboutOk: { $ne: true },
    })
      .limit(batchSize)
      .lean();

    if (channels.length === 0) {
      hasMore = false;
      break;
    }

    // Process batch in parallel
    try {
      await processInParallel(
        channels,
        async (channel) => {
          // Add small random delay to stagger requests
          await sleep(Math.random() * 500);

          try {
            const result = await extractChannel(channel.youtubeUrl, {
              ...fetchOptions,
              delayBetweenChannels,
            });

            // Update channel in database
            await Channel.updateOne(
              { youtubeId: channel.youtubeId },
              {
                $set: {
                  channelInfo: result.channelInfo || {},
                  videos: result.videos || [],
                  ytAboutOk: result.aboutOk,
                  ytVideosOk: result.videosOk,
                  extractedAt: new Date(),
                },
              }
            );

            stats.processed++;
            if (result.success) {
              stats.success++;
              log('info', `Extracted: ${channel.youtubeId}`, {
                title: result.channelInfo?.title,
                country: result.channelInfo?.country,
              });
            } else {
              stats.failed++;
              log('warn', `Failed: ${channel.youtubeId}`, { error: result.error });
            }

            // Emit progress
            onProgress?.(stats);

            return result;
          } catch (error) {
            if (error instanceof CaptchaError) {
              stats.captchaDetected = true;
              log('error', 'Captcha detected - stopping pipeline');
              throw error; // Stop all workers
            }
            stats.failed++;
            stats.processed++;
            log('error', `Error extracting ${channel.youtubeId}`, error);
            onProgress?.(stats);
            return null;
          }
        },
        concurrency
      );
    } catch (error) {
      if (error instanceof CaptchaError) {
        log('error', 'Pipeline stopped due to captcha');
        break;
      }
    }

    // Delay between batches
    if (!stats.captchaDetected) {
      await sleep(delayBetweenChannels);
    }

    // Check if we've processed all
    if (stats.processed >= total || stats.captchaDetected) {
      hasMore = false;
    }
  }

  stats.isComplete = !stats.captchaDetected;
  log('info', `Extraction complete: ${stats.success} success, ${stats.failed} failed`, stats);

  return stats;
}

