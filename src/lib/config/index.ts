export { GERMAN_WORDS } from './germanWords.js';
export { NON_GERMAN_CHARS } from './nonGermanChars.js';

/**
 * Allowed countries for the location filter.
 * DE, AT, CH = DACH region (Germany, Austria, Switzerland)
 */
export const ALLOWED_COUNTRIES: ReadonlySet<string> = new Set([
  'deutschland',
  'germany',
  'de',
  'deutsch',
  'österreich',
  'austria',
  'at',
  'schweiz',
  'switzerland',
  'ch',
  'suisse',
  'svizzera'
]);

/**
 * Default prefilter configuration
 */
export const PREFILTER_DEFAULTS = {
  /** Max distinct non-German chars per field before filtering out */
  maxNonGermanCharsPerField: 3,
  /** Min distinct German words required to pass language filter */
  minGermanWordsDistinct: 5,
  /** Whether to filter out channels not in DACH region */
  requireDachLocation: true,
} as const;

/**
 * AI Configuration
 */
export const AI_CONFIG = {
  ollama: {
    host: 'http://192.168.178.142:11434',
    defaultModel: 'llama3:8b',
    timeout: 60000, // 60s
  },
} as const;

