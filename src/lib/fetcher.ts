/**
 * Safe Fetcher for YouTube
 * 
 * Rate-limited HTTP client with captcha detection.
 * Simplified TypeScript version of the legacy safeFetch.js
 */

// =============================================================================
// Types
// =============================================================================

export interface FetcherOptions {
  minIntervalMs?: number;
  jitterMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  userAgent?: string;
  acceptLanguage?: string;
}

export class CaptchaError extends Error {
  url: string;
  marker: string;

  constructor(url: string, marker: string) {
    super(`Captcha detected at ${url} (${marker})`);
    this.name = 'CaptchaError';
    this.url = url;
    this.marker = marker;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectCaptcha(text: string): string | null {
  const markers = [
    { key: 'recaptcha', re: /recaptcha|g-recaptcha|hcaptcha/i },
    { key: 'sorry', re: /\/sorry\/|unusual traffic|traffic from your computer network/i },
    { key: 'robot', re: /i.?m not a robot|robot check/i },
    { key: 'verify', re: /verify it.?s you|confirm you.?re not a bot/i },
  ];

  for (const m of markers) {
    if (m.re.test(text)) {
      return m.key;
    }
  }
  return null;
}

// =============================================================================
// Fetcher
// =============================================================================

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DEFAULT_ACCEPT_LANGUAGE = 'de,de-DE;q=1.0,en;q=0.5';

// Track last request time per host for rate limiting
const lastRequestByHost = new Map<string, number>();

/**
 * Fetch a URL with rate limiting and retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: FetcherOptions = {}
): Promise<string> {
  const {
    minIntervalMs = 2000,
    jitterMs = 500,
    maxRetries = 3,
    timeoutMs = 25000,
    userAgent = DEFAULT_USER_AGENT,
    acceptLanguage = DEFAULT_ACCEPT_LANGUAGE,
  } = options;

  // Rate limit per host
  const host = new URL(url).host;
  const lastRequest = lastRequestByHost.get(host) || 0;
  const elapsed = Date.now() - lastRequest;
  const wait = Math.max(0, minIntervalMs - elapsed) + Math.random() * jitterMs;
  
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestByHost.set(host, Date.now());

  // Retry loop
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Accept-Language': acceptLanguage,
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const text = await response.text();

      // Check for captcha
      const captchaMarker = detectCaptcha(text.slice(0, 100000));
      if (captchaMarker) {
        throw new CaptchaError(url, captchaMarker);
      }

      return text;
    } catch (error) {
      if (error instanceof CaptchaError) {
        throw error; // Don't retry on captcha
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const backoff = Math.min(30000, 1000 * Math.pow(2, attempt));
        await sleep(backoff);
      }
    }
  }

  throw lastError || new Error('Fetch failed');
}

/**
 * Fetch YouTube channel page (about tab)
 */
export async function fetchChannelAbout(channelUrl: string, options?: FetcherOptions): Promise<string> {
  const url = channelUrl.replace(/\/+$/, '') + '/about';
  return fetchWithRetry(url, options);
}

/**
 * Fetch YouTube channel videos page
 */
export async function fetchChannelVideos(channelUrl: string, options?: FetcherOptions): Promise<string> {
  const url = channelUrl.replace(/\/+$/, '') + '/videos';
  return fetchWithRetry(url, options);
}

/**
 * Fetch YouTube video page
 */
export async function fetchVideoPage(videoUrl: string, options?: FetcherOptions): Promise<string> {
  return fetchWithRetry(videoUrl, options);
}

