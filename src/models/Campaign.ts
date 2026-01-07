/**
 * Campaign Model
 * 
 * Represents a Google Ads import source.
 * Per Lastenheft: Campaigns must be created before importing,
 * and are separated by import type (channel vs video).
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import type { CampaignType } from '../types/index.js';

// =============================================================================
// Document Interface
// =============================================================================

export interface ICampaign extends Document {
  name: string;
  type: CampaignType;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Schema
// =============================================================================

const CampaignSchema = new Schema<ICampaign>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    type: {
      type: String,
      enum: ['channel', 'video'],
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'campaigns',
  }
);

// =============================================================================
// Indexes
// =============================================================================

// Unique constraint: no duplicate names per type
CampaignSchema.index({ name: 1, type: 1 }, { unique: true });

// =============================================================================
// Model Export
// =============================================================================

export const Campaign: Model<ICampaign> = 
  mongoose.models.Campaign || mongoose.model<ICampaign>('Campaign', CampaignSchema);

