# Lastenheft Explained

The **Lastenheft** (Requirements Specification) describes a **YouTube Channel Filter Tool** for creating Google Ads exclusion lists.

---

## 🎯 Purpose

Filter YouTube channels to find ones that are **NOT relevant** for German Google Ads campaigns, then export them as a "Negative List" to block ad placements.

---

## ⚙️ Technical Constraints

| Constraint | Details |
|------------|---------|
| **Environment** | Local machine only, no deployment |
| **Stack** | Node.js + MongoDB |
| **AI** | Ollama (self-hosted, external API) |
| **Auth** | None |
| **Logging** | None |
| **UI** | Simple tabs, minimal effort |

---

## 📊 Data Model

**Channel** = A YouTube channel with:
- `youtubeId` (primary key)
- `sources` (SocialBlade flag + Campaign IDs)
- `status`: `unchecked` → `prefiltered` → `positive` / `negative`
- `decisionLevel`: `prefilter` | `ai` | `manual`

**Campaign** = A Google Ads import source (must be created before importing)

---

## 🔄 The Pipeline (5 Stages)

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌────────────┐    ┌────────┐
│   IMPORT    │ → │   YOUTUBE    │ → │  PREFILTER  │ → │  AI FILTER │ → │ EXPORT │
│             │    │  EXTRACTOR   │    │   (Rules)   │    │  (Ollama)  │    │        │
└─────────────┘    └──────────────┘    └─────────────┘    └────────────┘    └────────┘
```

---

## 1️⃣ Import Stage

Two ways to get channels into the system:

### A. SocialBlade Import
- Opens Chrome browser (logged in)
- Downloads DOM of list pages
- Extracts channel IDs
- Marks source as `socialBlade: true`

### B. Manual Import
- Upload CSV or paste URLs (channel or video URLs)
- Must assign a **Campaign** (mandatory)
- Video URLs → resolved to channel ID
- Marks source with campaign ID

---

## 2️⃣ YouTube Extractor

**Triggered**: Immediately after import (for every channel)

**Action**: Scrapes YouTube directly (no API):
- Channel title, description
- Country/location
- Subscriber count
- Video titles, metadata

**Result**: Channel saved with status `unchecked`

---

## 3️⃣ Prefilter Stage (Rule-Based)

**Input**: All `unchecked` channels

**Filters** (AND logic, fail = stop):

| Filter | Rule |
|--------|------|
| **Location** | Must be DE/AT/CH (or empty) |
| **Alphabet** | ≥5 non-Latin characters = fail |
| **Language** | ≥5 common German words required |
| **Topics** | Keywords for Kids/Beauty/Gaming = fail |

**Result**:
- Pass all → status `prefiltered`
- Fail any → status `negative`, decision `prefilter`

---

## 4️⃣ AI Filter Stage

**Input**: All `prefiltered` channels

**Process**:
- Sends channel data to Ollama
- Runs multiple prompts sequentially
- Each prompt asks one question (e.g., "Is this for children?")
- **Master prompt** is prepended to every call

**Logic**:
- Any prompt returns "negative" → stop, mark `negative`
- All prompts pass → mark `positive`

**Error handling**: Invalid AI response → skip channel, no status change

**Result**:
- Pass → status `positive`, decision `ai`
- Fail → status `negative`, decision `ai`

---

## 5️⃣ Manual Review & Export

### Manual Override
- Can mark any channel as `positive` or `negative`
- Decision level = `manual` (protected from automation)
- Can reset channels to `unchecked` for re-processing

### Export
- Select: `negative` / `positive` / both
- Filter by source (SocialBlade, specific campaigns)
- Formats: TXT (URLs) or CSV (Google Ads format)
- Full export only (no delta logic)

---

## 🖥️ UI Structure (Tabs)

| Tab | Content |
|-----|---------|
| **SocialBlade Import** | Start browser scraping |
| **Manual Import** | CSV upload, URL paste |
| **Unchecked** | List + "Start Prefilter" button |
| **Prefiltered** | List + "Start AI Filter" button |
| **Negative** | List with load limits (1k/10k/100k/1M/all) |
| **Positive** | List with load limits |

---

## 🔑 Key Design Decisions

1. **Immediate persistence**: Every status change saved instantly (survives crashes)
2. **YouTube ID is king**: Single primary key across all sources
3. **Sources are additive**: Re-importing adds campaigns, doesn't duplicate
4. **Manual decisions are final**: Never overwritten by automation
5. **Sequential processing**: No parallelism requirements
6. **Skip on error**: Never crash, just continue to next item

---

## Status Flow Diagram

```
                                    ┌──────────────┐
                                    │   NEGATIVE   │
                                    │ (Excluded)   │
                                    └──────────────┘
                                          ▲
                                          │ fail
                                          │
┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌──────────────┐
│  IMPORT  │ ──▶ │ UNCHECKED │ ──▶ │  PREFILTERED │ ──▶ │   POSITIVE   │
│          │     │           │     │              │     │  (Approved)  │
└──────────┘     └───────────┘     └──────────────┘     └──────────────┘
                       │                  │                    │
                       │ fail             │ fail               │
                       ▼                  ▼                    │
                 ┌──────────────┐   ┌──────────────┐           │
                 │   NEGATIVE   │   │   NEGATIVE   │           │
                 │ (prefilter)  │   │    (ai)      │           │
                 └──────────────┘   └──────────────┘           │
                                                               │
                                          ┌────────────────────┘
                                          ▼
                                    ┌──────────────┐
                                    │    EXPORT    │
                                    │ (Google Ads) │
                                    └──────────────┘
```

---

## Decision Level Tracking

| Decision Level | Meaning |
|----------------|---------|
| `prefilter` | Decided by rule-based filters |
| `ai` | Decided by Ollama AI prompts |
| `manual` | Decided by human operator (protected) |

Channels with `manual` decision level are **never automatically re-processed**.

