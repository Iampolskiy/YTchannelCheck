/**
 * Channel Model
 * 
 * Represents a YouTube channel in the filter pipeline.
 * Based on the Lastenheft data model requirements.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import type { 
  ChannelStatus, 
  DecisionLevel, 
  ChannelInfo, 
  VideoInfo, 
  ChannelSources 
} from '../types/index.js';

// =============================================================================
// Document Interface
// =============================================================================

export interface PrefilterCheck {
  checkedAt?: Date;
  passed?: boolean;
  passedRules?: string[];
  failedRule?: 'location' | 'alphabet' | 'language' | null;
  failedReason?: string | null;
  details?: Record<string, unknown>;
}

export interface IChannel extends Document {
  youtubeId: string;
  youtubeUrl: string;
  
  sources: ChannelSources;
  
  status: ChannelStatus;
  decisionLevel: DecisionLevel;
  
  channelInfo: ChannelInfo;
  videos: VideoInfo[];
  
  prefilterCheck?: PrefilterCheck | null;
  
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
// Sub-Schemas
// =============================================================================

const VideoInfoSchema = new Schema<VideoInfo>(
  {
    id: { type: String },
    title: { type: String, default: null },
    url: { type: String, default: null },
    publishedText: { type: String, default: null },
    viewsText: { type: String, default: null },
    durationText: { type: String, default: null },
    description: { type: String, default: null },
  },
  { _id: false }
);

const ChannelInfoSchema = new Schema<ChannelInfo>(
  {
    id: { type: String, default: null },
    title: { type: String, default: null },
    handle: { type: String, default: null },
    url: { type: String, default: null },
    description: { type: String, default: null },
    country: { type: String, default: null },
    keywords: { type: [String], default: [] },
    subscriberCountText: { type: String, default: null },
    avatar: { type: String, default: null },
    isFamilySafe: { type: Boolean, default: null },
  },
  { _id: false }
);

const ChannelSourcesSchema = new Schema<ChannelSources>(
  {
    socialBlade: { type: Boolean, default: false },
    campaignIds: { type: [String], default: [] },
  },
  { _id: false }
);

// =============================================================================
// Prefilter Check Schema
// =============================================================================

const PrefilterCheckSchema = new Schema(
  {
    checkedAt: { type: Date },
    passed: { type: Boolean },
    passedRules: { type: [String], default: [] },
    failedRule: { type: String, enum: ['location', 'alphabet', 'language', null], default: null },
    failedReason: { type: String, default: null },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

// =============================================================================
// Main Schema
// =============================================================================

const ChannelSchema = new Schema<IChannel>(
  {
    // Primary key
    youtubeId: { 
      type: String, 
      required: true, 
      unique: true,
      index: true,
    },
    youtubeUrl: { 
      type: String, 
      required: true,
    },
    
    // Source tracking (per Lastenheft: multiple sources allowed)
    sources: {
      type: ChannelSourcesSchema,
      default: () => ({ socialBlade: false, campaignIds: [] }),
    },
    
    // Status flow: unchecked → prefiltered → positive/negative
    status: {
      type: String,
      enum: ['unchecked', 'prefiltered', 'positive', 'negative'],
      default: 'unchecked',
      index: true,
    },
    
    // Decision level: who made the decision
    decisionLevel: {
      type: String,
      enum: ['prefilter', 'ai', 'manual', null],
      default: null,
    },
    
    // YouTube scraped data
    channelInfo: {
      type: ChannelInfoSchema,
      default: () => ({}),
    },
    videos: {
      type: [VideoInfoSchema],
      default: [],
    },
    
    // Prefilter check results
    prefilterCheck: {
      type: PrefilterCheckSchema,
      default: null,
    },
    
    // Debug URLs
    mainUrl: { type: String },
    aboutUrl: { type: String },
    videosUrl: { type: String },
    
    // Scrape status
    ytAboutOk: { type: Boolean, default: false },
    ytVideosOk: { type: Boolean, default: false },
    
    // Rejection reason (for negative status)
    rejectionReason: { type: String, default: null },
    
    extractedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,  // Adds createdAt and updatedAt
    strict: true,      // Per .cursorrules: catch typos
    collection: 'channels',
  }
);

// =============================================================================
// Indexes
// =============================================================================

// Compound index for filtering by status and source
ChannelSchema.index({ status: 1, 'sources.socialBlade': 1 });
ChannelSchema.index({ status: 1, 'sources.campaignIds': 1 });

// Index for querying by decision level
ChannelSchema.index({ decisionLevel: 1 });

// Index for country-based queries (prefilter)
ChannelSchema.index({ 'channelInfo.country': 1 });

// =============================================================================
// Model Export
// =============================================================================

export const Channel: Model<IChannel> = 
  mongoose.models.Channel || mongoose.model<IChannel>('Channel', ChannelSchema);

