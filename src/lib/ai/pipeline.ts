/**
 * AI Filter Pipeline
 * 
 * Orchestrates the AI analysis of channels.
 * - Fetches prefiltered channels
 * - Sends them to Ollama for analysis
 * - Updates status based on results
 */

import { Channel } from '../../models/index.js';
import { analyzeChannel } from './ollama.js';
import type { ChannelInfo, VideoInfo } from '../../types/index.js';

export interface AIFilterPipelineOptions {
  model?: string;
  batchSize?: number;
  prompts?: ('kids' | 'gaming')[]; // Which checks to run
  onProgress?: (stats: AIStats) => void;
  onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
}

export interface AIStats {
  total: number;
  processed: number;
  passed: number;
  failed: number;
  errors: number;
  isComplete: boolean;
}

interface ChannelDocument {
  _id: unknown;
  youtubeId: string;
  channelInfo?: ChannelInfo;
  videos?: VideoInfo[];
}

export async function runAIFilterPipeline(options: AIFilterPipelineOptions = {}): Promise<AIStats> {
  const {
    model = 'llama3',
    batchSize = 10,
    prompts = ['kids', 'gaming'], // Default to checking both
    onProgress,
    onLog
  } = options;

  const log = onLog ?? (() => {});

  // 1. Get total count of 'prefiltered' channels (ready for AI)
  const total = await Channel.countDocuments({ status: 'prefiltered' });

  const stats: AIStats = {
    total,
    processed: 0,
    passed: 0,
    failed: 0,
    errors: 0,
    isComplete: false
  };

  if (total === 0) {
    log('info', 'No prefiltered channels to process');
    stats.isComplete = true;
    return stats;
  }

  log('info', `Starting AI filter pipeline for ${total} channels using model: ${model}`);

  // 2. Process in batches
  let hasMore = true;
  while (hasMore) {
    const channels = await Channel.find({ status: 'prefiltered' })
      .limit(batchSize)
      .lean<ChannelDocument[]>();

    if (channels.length === 0) {
      hasMore = false;
      break;
    }

    for (const channel of channels) {
      try {
        const channelData = {
          title: channel.channelInfo?.title || '',
          description: channel.channelInfo?.description || '',
          videoTitles: (channel.videos || []).map(v => v.title || '').slice(0, 10) // Limit to 10 video titles
        };

        let isChannelPositive = true;
        let failureReason = '';

        // Run checks sequentially (fail fast)
        for (const promptType of prompts) {
          log('info', `Analyzing ${channel.youtubeId} for ${promptType}...`);
          
          const result = await analyzeChannel(channelData, promptType, model);
          
          if (!result.isPositive) {
            isChannelPositive = false;
            failureReason = `${promptType}: ${result.reason}`;
            break; // Stop at first failure
          }
        }

        // Update database
        const now = new Date();
        if (isChannelPositive) {
          await Channel.updateOne(
            { youtubeId: channel.youtubeId },
            {
              $set: {
                status: 'positive',
                decisionLevel: 'ai',
                // We could store detailed AI results here if needed
              }
            }
          );
          stats.passed++;
        } else {
          await Channel.updateOne(
            { youtubeId: channel.youtubeId },
            {
              $set: {
                status: 'negative',
                decisionLevel: 'ai',
                // Store why it failed
                'aiAnalysis.failedReason': failureReason,
                'aiAnalysis.checkedAt': now
              }
            }
          );
          stats.failed++;
        }

        stats.processed++;

      } catch (error) {
        stats.errors++;
        stats.processed++;
        log('error', `Error processing channel ${channel.youtubeId}`, error);
        // Optionally mark as error state or leave as prefiltered to retry
      }
    }

    onProgress?.(stats);

    if (stats.processed >= total) {
      hasMore = false;
    }
  }

  stats.isComplete = true;
  log('info', `AI Filter complete: ${stats.passed} passed, ${stats.failed} failed`);
  return stats;
}

