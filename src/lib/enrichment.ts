// Enrichment API clients — Reddit public endpoint, X API, URL verification
// Uses built-in fetch (Node 20+), no external dependencies

import { CONFIG } from '../config.js';

/**
 * Get subscriber count for a subreddit via public .json endpoint (no auth required).
 */
export async function getSubredditMemberCount(
  subreddit: string
): Promise<number | null> {
  const response = await fetch(
    `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/about.json`,
    {
      headers: {
        'User-Agent': 'distribution-agent/1.0',
      },
      signal: AbortSignal.timeout(CONFIG.ENRICHMENT_TIMEOUT_MS),
    }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as {
    data?: { subscribers?: number };
  };
  return data.data?.subscribers ?? null;
}

/**
 * Get follower count for a Twitter/X user.
 */
export async function getTwitterFollowerCount(
  username: string,
  bearerToken: string
): Promise<number | null> {
  const response = await fetch(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=public_metrics`,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'User-Agent': 'distribution-agent/1.0',
      },
      signal: AbortSignal.timeout(CONFIG.ENRICHMENT_TIMEOUT_MS),
    }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as {
    data?: { public_metrics?: { followers_count?: number } };
  };
  return data.data?.public_metrics?.followers_count ?? null;
}

/**
 * Check if a URL points to a private/internal IP range (SSRF prevention).
 */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;
    // Block non-HTTP(S) schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
    // Block obvious private/internal hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (hostname === '0.0.0.0') return true;
    // Block metadata endpoints
    if (hostname === '169.254.169.254') return true;
    // Block private IP ranges
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const first = parseInt(parts[0]);
      const second = parseInt(parts[1]);
      if (first === 10) return true;
      if (first === 172 && second >= 16 && second <= 31) return true;
      if (first === 192 && second === 168) return true;
      if (first === 127) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Verify a URL is reachable (HEAD request, accepts 200-399).
 * Rejects private/internal URLs to prevent SSRF.
 */
export async function verifyUrl(url: string): Promise<boolean> {
  if (isPrivateUrl(url)) return false;
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(CONFIG.ENRICHMENT_TIMEOUT_MS),
      redirect: 'manual', // Don't follow redirects (prevents SSRF via open redirect)
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}
