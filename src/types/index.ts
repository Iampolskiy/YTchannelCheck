/**
 * Core type definitions for the YouTube Channel Filter application.
 * Based on the Lastenheft requirements.
 */

// =============================================================================
// Status & Decision Types
// =============================================================================

/** Channel processing status */
export type ChannelStatus = 'unchecked' | 'prefiltered' | 'positive' | 'negative';

/** Who made the decision */
export type DecisionLevel = 'prefilter' | 'ai' | 'manual' | null;

/** Campaign type (separated lists per import type) */
export type CampaignType = 'channel' | 'video';

// =============================================================================
// Channel Types
// =============================================================================

/** Video metadata scraped from YouTube */
export interface VideoInfo {
  id: string;
  title: string | null;
  url: string | null;
  publishedText: string | null;
  viewsText: string | null;
  durationText: string | null;
  description: string | null;
}

/** Channel metadata scraped from YouTube */
export interface ChannelInfo {
  id: string | null;
  title: string | null;
  handle: string | null;
  url: string | null;
  description: string | null;
  country: string | null;
  keywords: string[];
  subscriberCountText: string | null;
  avatar?: string | null;
  isFamilySafe?: boolean | null;
}

/** Source tracking for a channel */
export interface ChannelSources {
  socialBlade: boolean;
  campaignIds: string[];
}

/** Full channel document */
export interface Channel {
  youtubeId: string;
  youtubeUrl: string;
  
  sources: ChannelSources;
  
  status: ChannelStatus;
  decisionLevel: DecisionLevel;
  
  channelInfo: ChannelInfo;
  videos: VideoInfo[];
  
  // URLs for debugging
  mainUrl?: string;
  aboutUrl?: string;
  videosUrl?: string;
  
  // Scrape status
  ytAboutOk: boolean;
  ytVideosOk: boolean;
  
  extractedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Campaign Types
// =============================================================================

/** Campaign document */
export interface Campaign {
  _id: string;
  name: string;
  type: CampaignType;
  createdAt: Date;
}

// =============================================================================
// Import Types
// =============================================================================

/** Manual channel import input */
export interface ChannelImportInput {
  urls: string[];
  campaignId: string;
}

/** Manual video import input */
export interface VideoImportInput {
  urls: string[];
  campaignId: string;
}

// =============================================================================
// Filter Types
// =============================================================================

/** Result of a prefilter check */
export interface PrefilterResult {
  passed: boolean;
  failedAt?: 'location' | 'alphabet' | 'language' | 'topic';
  details?: {
    locationCheck?: { country: string | null; passed: boolean };
    alphabetCheck?: { badCharsFound: string[]; count: number; passed: boolean };
    languageCheck?: { germanWordsFound: string[]; count: number; passed: boolean };
    topicCheck?: { topic: string; keywordsFound: string[]; passed: boolean };
  };
}

/** Result of an AI filter check */
export interface AIFilterResult {
  passed: boolean;
  failedAtPrompt?: string;
  promptResults?: Array<{
    promptId: string;
    response: 'positive' | 'negative' | 'invalid';
    raw?: string;
  }>;
}

// =============================================================================
// Export Types
// =============================================================================

/** Export configuration */
export interface ExportOptions {
  status: 'negative' | 'positive' | 'both';
  format: 'txt' | 'csv';
  sources: {
    includeSocialBlade: boolean;
    campaignIds: string[];  // empty = all campaigns
  };
}

// =============================================================================
// Job Types (for background processing)
// =============================================================================

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'captcha';

export interface JobProgress {
  total: number;
  current: number;
  step: string;
}

export interface Job {
  jobId: string;
  status: JobStatus;
  createdAt: Date;
  finishedAt: Date | null;
  progress: JobProgress;
  error: string | null;
}

