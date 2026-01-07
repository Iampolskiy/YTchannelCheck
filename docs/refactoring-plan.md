# Refactoring Plan

This document outlines the gap analysis and step-by-step refactoring plan to align the codebase with the **Lastenheft** requirements and **.cursorrules** coding standards.

---

## Current State Analysis

### Codebase Overview
- **server.js**: ~1784 lines, monolithic Express server
- **Language**: JavaScript (ESM)
- **Models**: 4 Mongoose models (`Vorgefiltert`, `VorgefiltertCode`, `ChannelDecision`, `ChannelPrefilter`)
- **Frontend**: Vanilla HTML/CSS/JS (2 pages)
- **Validation**: None

---

## Gap Analysis

| Aspect | Current State | Required (Lastenheft + .cursorrules) |
|--------|--------------|--------------------------------------|
| **Language** | JavaScript (ESM) | TypeScript |
| **Validation** | None | Zod schemas |
| **Status Model** | `done` / `error` | `unchecked` → `prefiltered` → `positive` / `negative` |
| **Decision Level** | Not tracked | `prefilter` / `ai` / `manual` |
| **Sources** | Just `sourceFile` string | `socialBlade: boolean` + `campaignIds: string[]` |
| **Campaigns** | Not implemented | Campaign CRUD + mandatory assignment on import |
| **Manual Import** | Not implemented | CSV + Textarea for channels & videos |
| **Topic Filters** | Not implemented | Kids/Beauty/Gaming keyword lists |
| **AI Filter** | Not implemented | Ollama integration with prompt pipeline |
| **Export** | Not implemented | TXT + CSV (Google Ads format) |
| **UI** | 2 basic pages | 6 tabs as specified |

---

## Target Data Model (per Lastenheft)

### Channel
```typescript
{
  youtubeId: string;           // Primary key
  youtubeUrl: string;
  
  // Sources (multiple allowed)
  sources: {
    socialBlade: boolean;
    campaignIds: string[];     // References to Campaign documents
  };
  
  // Status flow: unchecked → prefiltered → positive/negative
  status: 'unchecked' | 'prefiltered' | 'positive' | 'negative';
  
  // Who made the decision
  decisionLevel: 'prefilter' | 'ai' | 'manual' | null;
  
  // Scraped data from YouTube
  channelInfo: {
    title: string;
    description: string;
    country: string;
    handle: string;
    subscriberCountText: string;
    keywords: string[];
  };
  
  videos: Array<{
    id: string;
    title: string;
    url: string;
    publishedText: string;
    viewsText: string;
    durationText: string;
    description: string;
  }>;
  
  extractedAt: Date;
  timestamps: true;  // createdAt, updatedAt
}
```

### Campaign
```typescript
{
  _id: ObjectId;
  name: string;
  type: 'channel' | 'video';   // Separate lists per import type
  createdAt: Date;
}
```

---

## Refactoring Steps

### Step 1: Add TypeScript + Project Structure
- [ ] Install TypeScript and type dependencies
- [ ] Create `tsconfig.json` with strict mode
- [ ] Create folder structure:
  ```
  /src
    /models      - Mongoose schemas
    /routes      - Express route handlers
    /lib         - Utilities (safeFetch, youtubeInitialData, etc.)
    /schemas     - Zod validation schemas
    /config      - Constants (word lists, settings)
  ```
- [ ] Keep existing code running during migration

### Step 2: Refactor Database Models
- [ ] Create unified `Channel` model matching Lastenheft
- [ ] Create `Campaign` model
- [ ] Add proper indexes
- [ ] Migrate existing data (or start fresh)

### Step 3: Add Zod Validation Schemas
- [ ] `ChannelImportSchema` - for manual channel imports
- [ ] `VideoImportSchema` - for video URL imports
- [ ] `CampaignSchema` - for campaign CRUD
- [ ] `ProcessOptionsSchema` - for filter job options
- [ ] `ExportOptionsSchema` - for export parameters

### Step 4: Modularize Server
- [ ] Split routes into modules:
  - `/routes/import.ts` - SocialBlade + Manual imports
  - `/routes/campaigns.ts` - Campaign CRUD
  - `/routes/channels.ts` - Channel listing, details
  - `/routes/process.ts` - Prefilter + AI filter jobs
  - `/routes/export.ts` - Export endpoints
- [ ] Add Zod validation middleware
- [ ] Add error handling middleware

### Step 5: Implement Manual Import
- [ ] Campaign CRUD API (`POST/GET/DELETE /api/campaigns`)
- [ ] CSV upload endpoint (parse and validate)
- [ ] Textarea input endpoint
- [ ] Video URL → Channel ID resolution
- [ ] Source tracking (campaignId assignment)

### Step 6: Complete Prefilter Pipeline
- [ ] Location filter (DE/AT/CH or empty = pass)
- [ ] Alphabet check (≥5 non-Latin chars = fail)
- [ ] Language check (≥5 German words = pass)
- [ ] Topic filters:
  - Kids content keywords
  - Beauty keywords
  - Gaming keywords
- [ ] Proper status transitions + decision level tracking

### Step 7: AI Integration (Ollama)
- [ ] Ollama HTTP client
- [ ] Master prompt configuration
- [ ] Individual prompt definitions (Kids, Beauty, Gaming, Rentner, etc.)
- [ ] Sequential prompt execution with early exit
- [ ] Error handling (invalid response = skip, no status change)

### Step 8: Build Tab-Based UI
- [ ] Tab navigation component
- [ ] Views:
  - SocialBlade Import tab
  - Manual Import tab (with campaign selector)
  - Unchecked tab (+ "Start Prefilter" button)
  - Prefiltered tab (+ "Start AI Filter" button)
  - Negative tab (with load limits: 1k/10k/100k/1M/all)
  - Positive tab (with load limits)
- [ ] Channel detail view
- [ ] Mass actions (reset to unchecked, manual status change)

### Step 9: Export Feature
- [ ] Export API endpoint
- [ ] Filters:
  - Status (negative/positive/both)
  - Sources (SocialBlade, specific campaigns)
- [ ] Output formats:
  - TXT (one URL per line)
  - CSV (Google Ads format, hardcoded structure)
- [ ] Browser download trigger

---

## Migration Strategy

1. **Parallel Development**: Keep existing code running while building new structure
2. **Feature Flags**: Toggle between old and new implementations
3. **Data Migration**: Script to convert existing `vorgefiltert` → new `Channel` model
4. **Incremental Deployment**: Test each step before moving to next

---

## Dependencies to Add

```json
{
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/express": "^4.x",
    "@types/multer": "^1.x",
    "tsx": "^4.x"
  },
  "dependencies": {
    "zod": "^3.x"
  }
}
```

---

## Progress Tracking

| Step | Status | Notes |
|------|--------|-------|
| Step 1: TypeScript Setup | ⏳ Pending | |
| Step 2: Database Models | ⏳ Pending | |
| Step 3: Zod Schemas | ⏳ Pending | |
| Step 4: Modularize Server | ⏳ Pending | |
| Step 5: Manual Import | ⏳ Pending | |
| Step 6: Prefilter Pipeline | ⏳ Pending | |
| Step 7: AI Integration | ⏳ Pending | |
| Step 8: Tab-Based UI | ⏳ Pending | |
| Step 9: Export Feature | ⏳ Pending | |

