/**
 * Prefilter functions for YouTube channel filtering.
 * These are applied before AI filtering to quickly exclude obvious non-matches.
 */

import type { ChannelInfo, VideoInfo } from '../../types/index.js';
import { GERMAN_WORDS, NON_GERMAN_CHARS, ALLOWED_COUNTRIES } from '../config/index.js';

// ============================================================================
// Types
// ============================================================================

export interface FilterResult {
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface NonGermanCharsMatch {
  field: string;
  distinctCount: number;
  chars: string[];
  textSample: string;
}

export interface NonGermanCharsResult extends FilterResult {
  maxDistinctPerField: number;
  matches: NonGermanCharsMatch[];
}

export interface GermanWordsResult extends FilterResult {
  minDistinct: number;
  hitsDistinct: number;
  wordsFoundSample: string[];
}

export interface ChannelTexts {
  title: string;
  description: string;
  videoTitles: string[];
}

// ============================================================================
// Text Extraction
// ============================================================================

/**
 * Extract all text fields from channel data for filtering.
 */
export function extractChannelTexts(
  channelInfo?: ChannelInfo | null,
  videos?: VideoInfo[] | null
): ChannelTexts {
  const title = channelInfo?.title ?? '';
  const description = channelInfo?.description ?? '';
  const videoTitles = (videos ?? []).map(v => v.title ?? '');
  
  return { title, description, videoTitles };
}

/**
 * Combine all channel text into a single lowercase string for word matching.
 */
function buildFullText(texts: ChannelTexts): string {
  const parts = [texts.title, texts.description, ...texts.videoTitles];
  return parts.join(' ').toLowerCase();
}

/**
 * Tokenize text into unique lowercase words (alphanumeric only).
 */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-zäöüß]+/i)
    .filter(w => w.length > 1);
  return new Set(words);
}

// ============================================================================
// Location Filter
// ============================================================================

/**
 * Check if channel is in DACH region (DE/AT/CH).
 * Returns true if location is Germany, Austria, or Switzerland.
 */
export function checkLocation(country?: string | null): FilterResult {
  if (!country) {
    return { 
      passed: false, 
      reason: 'No country specified',
      details: { country: null }
    };
  }
  
  const normalized = country.trim().toLowerCase();
  
  // Direct match
  if (ALLOWED_COUNTRIES.has(normalized)) {
    return { passed: true };
  }
  
  // Word-boundary match for compound country names (e.g., "Deutschland (DE)")
  // Only match if the allowed word appears as a complete word in the string
  const words = normalized.split(/[\s,()[\]]+/).filter(w => w.length > 0);
  for (const word of words) {
    if (ALLOWED_COUNTRIES.has(word)) {
      return { passed: true };
    }
  }
  
  return { 
    passed: false, 
    reason: `Country "${country}" not in DACH region`,
    details: { country }
  };
}

// ============================================================================
// Non-German Characters Filter (Alphabet Check)
// ============================================================================

/**
 * Scan a text for distinct non-German characters.
 */
function scanNonGermanChars(
  text: string, 
  badChars: ReadonlySet<string>
): { distinctCount: number; chars: string[] } {
  const found = new Set<string>();
  
  // Iterate by codepoint (handles unicode correctly)
  for (const char of text) {
    if (badChars.has(char)) {
      found.add(char);
    }
  }
  
  return {
    distinctCount: found.size,
    chars: Array.from(found)
  };
}

/**
 * Check if channel text contains too many non-German characters.
 * Checks each field separately - if ANY field exceeds the limit, filter fails.
 */
export function checkNonGermanChars(
  texts: ChannelTexts,
  maxDistinctPerField = 3,
  badChars: ReadonlySet<string> = NON_GERMAN_CHARS
): NonGermanCharsResult {
  if (badChars.size === 0) {
    return { 
      passed: true, 
      maxDistinctPerField, 
      matches: [] 
    };
  }

  const matches: NonGermanCharsMatch[] = [];
  let passed = true;

  // Check title
  const titleResult = scanNonGermanChars(texts.title, badChars);
  if (titleResult.distinctCount > 0) {
    matches.push({
      field: 'title',
      distinctCount: titleResult.distinctCount,
      chars: titleResult.chars.slice(0, 50),
      textSample: texts.title.slice(0, 140)
    });
  }
  if (titleResult.distinctCount > maxDistinctPerField) {
    passed = false;
  }

  // Check description
  const descResult = scanNonGermanChars(texts.description, badChars);
  if (descResult.distinctCount > 0) {
    matches.push({
      field: 'description',
      distinctCount: descResult.distinctCount,
      chars: descResult.chars.slice(0, 50),
      textSample: texts.description.slice(0, 140)
    });
  }
  if (descResult.distinctCount > maxDistinctPerField) {
    passed = false;
  }

  // Check video titles
  for (let i = 0; i < texts.videoTitles.length; i++) {
    const videoTitle = texts.videoTitles[i];
    const result = scanNonGermanChars(videoTitle, badChars);
    
    if (result.distinctCount > 0) {
      matches.push({
        field: `videos[${i}].title`,
        distinctCount: result.distinctCount,
        chars: result.chars.slice(0, 50),
        textSample: videoTitle.slice(0, 140)
      });
    }
    
    if (result.distinctCount > maxDistinctPerField) {
      passed = false;
    }
  }

  return {
    passed,
    reason: passed ? undefined : 'Too many non-German characters in one or more fields',
    maxDistinctPerField,
    matches
  };
}

// ============================================================================
// German Words Filter (Language Check)
// ============================================================================

/**
 * Check if channel contains enough distinct German words.
 * Combines all text fields and counts unique German words found.
 */
export function checkGermanWords(
  texts: ChannelTexts,
  minDistinct = 5,
  germanWords: ReadonlySet<string> = GERMAN_WORDS
): GermanWordsResult {
  const fullText = buildFullText(texts);
  const tokens = tokenize(fullText);
  
  // Find German words that appear in the text
  const found: string[] = [];
  for (const word of germanWords) {
    if (tokens.has(word)) {
      found.push(word);
    }
  }

  const passed = found.length >= minDistinct;

  return {
    passed,
    reason: passed ? undefined : `Only ${found.length} German words found (minimum: ${minDistinct})`,
    minDistinct,
    hitsDistinct: found.length,
    wordsFoundSample: found.slice(0, 50)
  };
}

// ============================================================================
// Combined Prefilter Check
// ============================================================================

export interface PrefilterOptions {
  requireDachLocation?: boolean;
  maxNonGermanCharsPerField?: number;
  minGermanWordsDistinct?: number;
}

export interface PrefilterResult {
  passed: boolean;
  failedRule?: 'location' | 'alphabet' | 'language';
  reason?: string;
  location?: FilterResult;
  alphabet?: NonGermanCharsResult;
  language?: GermanWordsResult;
}

/**
 * Run all prefilter checks on a channel.
 * Returns immediately when a filter fails (short-circuit).
 */
export function runPrefilter(
  channelInfo: ChannelInfo | undefined | null,
  videos: VideoInfo[] | undefined | null,
  options: PrefilterOptions = {}
): PrefilterResult {
  const {
    requireDachLocation = true,
    maxNonGermanCharsPerField = 3,
    minGermanWordsDistinct = 5
  } = options;

  const texts = extractChannelTexts(channelInfo, videos);
  
  // 1. Location check (DACH region)
  if (requireDachLocation) {
    const locationResult = checkLocation(channelInfo?.country);
    if (!locationResult.passed) {
      return {
        passed: false,
        failedRule: 'location',
        reason: locationResult.reason,
        location: locationResult
      };
    }
  }

  // 2. Alphabet check (non-German characters)
  const alphabetResult = checkNonGermanChars(texts, maxNonGermanCharsPerField);
  if (!alphabetResult.passed) {
    return {
      passed: false,
      failedRule: 'alphabet',
      reason: alphabetResult.reason,
      alphabet: alphabetResult
    };
  }

  // 3. Language check (German words)
  const languageResult = checkGermanWords(texts, minGermanWordsDistinct);
  if (!languageResult.passed) {
    return {
      passed: false,
      failedRule: 'language',
      reason: languageResult.reason,
      language: languageResult
    };
  }

  // All checks passed
  return {
    passed: true,
    location: { passed: true },
    alphabet: alphabetResult,
    language: languageResult
  };
}

