import { URL } from "url";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

function parseRetryAfterMs(res) {
  const ra = res.headers.get("retry-after");
  if (!ra) return null;

  if (/^\d+$/.test(ra.trim())) return Number(ra.trim()) * 1000;

  const dt = new Date(ra);
  if (!Number.isNaN(dt.getTime())) {
    const diff = dt.getTime() - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}

export class CaptchaDetectedError extends Error {
  constructor({ url, host, status, marker, snippet }) {
    super(
      `CAPTCHA/BLOCK erkannt (${host}, HTTP ${status ?? "?"}, marker=${marker})`
    );
    this.name = "CaptchaDetectedError";
    this.url = url;
    this.host = host;
    this.status = status ?? null;
    this.marker = marker ?? null;
    this.snippet = snippet ?? null;
  }
}

function detectYoutubeCaptcha({ url, host, text }) {
  const h = String(host || "").toLowerCase();
  const u = String(url || "").toLowerCase();
  if (!h.includes("youtube.com")) return null;

  const markers = [
    { key: "recaptcha", re: /recaptcha|g-recaptcha|hcaptcha/i },
    {
      key: "sorry",
      re: /\/sorry\/|unusual traffic|traffic from your computer network/i,
    },
    { key: "robot_check", re: /i.?m not a robot|robot check/i },
    { key: "verify", re: /verify it.?s you|confirm you.?re not a bot/i },
  ];

  if (u.includes("/sorry/"))
    return { marker: "url_sorry", snippet: u.slice(0, 140) };

  const body = String(text || "");
  for (const m of markers) {
    const match = body.match(m.re);
    if (match) {
      const idx = body.toLowerCase().indexOf(String(match[0]).toLowerCase());
      const snippet =
        idx >= 0
          ? body.slice(Math.max(0, idx - 40), idx + 160)
          : String(match[0]);
      return { marker: m.key, snippet };
    }
  }
  return null;
}

export function createSafeFetcher({
  minIntervalMs = 1500,
  jitterMs = 500,
  maxRetries = 6,
  timeoutMs = 25_000,
  concurrency = 1,

  userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  acceptLanguage = "de,de-DE;q=1.0,en;q=0.5",

  stopOnCaptcha = true,
  captchaMaxBodyScan = 200_000,

  // hostRules: { "www.youtube.com": { minIntervalMs: 4500, jitterMs: 1200 } }
  hostRules = {},

  onEvent = null,
} = {}) {
  const emit = (ev) => {
    try {
      if (typeof onEvent === "function") onEvent(ev);
    } catch {}
  };

  // Concurrency
  let active = 0;
  const queue = [];

  async function acquireSlot(url) {
    if (active < concurrency) {
      active++;
      return;
    }
    emit({ type: "queue_wait", url, active, concurrency });
    await new Promise((resolve) => queue.push(resolve));
    active++;
  }

  function releaseSlot() {
    active--;
    const next = queue.shift();
    if (next) next();
  }

  // Rate limit per host
  const lastRequestAtByHost = new Map();

  function getRuleForHost(host) {
    const h = String(host || "").toLowerCase();
    const rule = hostRules?.[h] || hostRules?.[host] || null;
    return {
      minIntervalMs:
        typeof rule?.minIntervalMs === "number"
          ? rule.minIntervalMs
          : minIntervalMs,
      jitterMs: typeof rule?.jitterMs === "number" ? rule.jitterMs : jitterMs,
    };
  }

  async function waitForHostSlot(url) {
    const u = new URL(url);
    const host = u.host;
    const rule = getRuleForHost(host);

    const last = lastRequestAtByHost.get(host) ?? 0;
    const now = Date.now();
    const baseWait = Math.max(0, rule.minIntervalMs - (now - last));
    const jitter =
      rule.jitterMs > 0 ? Math.floor(Math.random() * (rule.jitterMs + 1)) : 0;
    const waitMs = baseWait + jitter;

    if (waitMs > 0) {
      emit({ type: "host_wait", url, host, waitMs, baseWait, jitter });
      await sleep(waitMs);
    }
    lastRequestAtByHost.set(host, Date.now());
  }

  async function fetchWithTimeout(url, { headers } = {}) {
    if (typeof fetch !== "function")
      throw new Error("global fetch nicht verfügbar. Nutze Node >= 18.");

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchText(url, opts = {}) {
    await acquireSlot(url);
    try {
      await waitForHostSlot(url);

      const headers = {
        "User-Agent": userAgent,
        "Accept-Language": acceptLanguage,
        ...(opts.headers || {}),
      };

      let attempt = 0;
      let lastErr = null;

      while (attempt <= maxRetries) {
        const started = Date.now();
        emit({ type: "fetch_start", url, attempt });

        try {
          const res = await fetchWithTimeout(url, { headers });
          const ms = Date.now() - started;
          const text = await res.text();

          emit({
            type: "fetch_response",
            url,
            attempt,
            status: res.status,
            ok: res.ok,
            ms,
          });

          if (stopOnCaptcha) {
            const u = new URL(url);
            const host = u.host;
            const scanText =
              typeof text === "string" && text.length > captchaMaxBodyScan
                ? text.slice(0, captchaMaxBodyScan)
                : text;

            const cap = detectYoutubeCaptcha({ url, host, text: scanText });
            if (cap) {
              emit({
                type: "captcha_detected",
                url,
                host,
                status: res.status,
                marker: cap.marker,
              });
              throw new CaptchaDetectedError({
                url,
                host,
                status: res.status,
                marker: cap.marker,
                snippet: cap.snippet,
              });
            }
          }

          if (!res.ok && isRetryableStatus(res.status)) {
            const retryAfterMs = parseRetryAfterMs(res);
            const backoff = Math.min(60_000, 500 * Math.pow(2, attempt));
            const waitMs = retryAfterMs ?? backoff;

            lastErr = new Error(
              `HTTP ${res.status} ${res.statusText} (retryable) – warte ${waitMs}ms`
            );
            emit({
              type: "retry_wait",
              url,
              attempt,
              status: res.status,
              waitMs,
              reason: "retryable_status",
            });

            attempt++;
            await sleep(waitMs);
            continue;
          }

          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          return text;
        } catch (err) {
          const ms = Date.now() - started;
          lastErr = err;

          emit({
            type: "fetch_error",
            url,
            attempt,
            ms,
            message: String(err?.message || err),
            name: err?.name || null,
          });

          if (err?.name === "CaptchaDetectedError") throw err;

          if (attempt >= maxRetries) break;

          const backoff = Math.min(60_000, 500 * Math.pow(2, attempt));
          emit({
            type: "retry_wait",
            url,
            attempt,
            waitMs: backoff,
            reason: "network_or_timeout",
          });
          attempt++;
          await sleep(backoff);
        }
      }

      throw lastErr ?? new Error("Unknown fetch error");
    } finally {
      releaseSlot();
    }
  }

  return { fetchText };
}
