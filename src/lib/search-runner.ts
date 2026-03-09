// Search runner — wraps the last30days.py Python script
// Spawns the script, parses JSON output, and normalizes into SearchResultItem[]

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CONFIG } from '../config.js';
import type { SearchResultItem } from '../state.js';

// Platform-specific raw item shapes from last30days JSON output
interface RawEngagement {
  score?: number;
  num_comments?: number;
  upvote_ratio?: number;
  likes?: number;
  reposts?: number;
  replies?: number;
  quotes?: number;
  views?: number;
  shares?: number;
  volume?: number;
  liquidity?: number;
}

interface RawBaseItem {
  id?: string;
  title?: string;
  text?: string;
  url?: string;
  date?: string;
  engagement?: RawEngagement | null;
  score?: number;
  why_relevant?: string;
}

// Reddit: title, url, subreddit (no text body in output)
interface RawRedditItem extends RawBaseItem {
  subreddit?: string;
}

// X/Twitter: text, url, author_handle (no title)
interface RawXItem extends RawBaseItem {
  author_handle?: string;
}

// Web: title, url, source_domain, snippet
interface RawWebItem extends RawBaseItem {
  source_domain?: string;
  snippet?: string;
}

// YouTube: title, url, channel_name, transcript_snippet
interface RawYouTubeItem extends RawBaseItem {
  channel_name?: string;
  transcript_snippet?: string;
}

// TikTok: text, url, author_name, caption_snippet
interface RawTikTokItem extends RawBaseItem {
  author_name?: string;
  caption_snippet?: string;
}

// Instagram: text, url, author_name, caption_snippet
interface RawInstagramItem extends RawBaseItem {
  author_name?: string;
  caption_snippet?: string;
}

// HackerNews: title, url, hn_url, author
interface RawHackerNewsItem extends RawBaseItem {
  hn_url?: string;
  author?: string;
}

// Polymarket: title, question, url
interface RawPolymarketItem extends RawBaseItem {
  question?: string;
}

// Top-level JSON structure emitted by last30days --emit=json
interface RawReport {
  reddit?: RawRedditItem[];
  x?: RawXItem[];
  web?: RawWebItem[];
  youtube?: RawYouTubeItem[];
  tiktok?: RawTikTokItem[];
  instagram?: RawInstagramItem[];
  hackernews?: RawHackerNewsItem[];
  polymarket?: RawPolymarketItem[];
  [key: string]: unknown;
}

/**
 * Generate a deterministic ID from a string (url or platform+title fallback).
 */
function generateId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

/**
 * Extract the author field from a platform-specific raw item.
 */
function extractAuthor(platform: string, item: RawBaseItem): string {
  const raw = item as Record<string, unknown>;
  switch (platform) {
    case 'reddit':
      return String(raw.subreddit ?? 'unknown');
    case 'x':
      return String(raw.author_handle ?? 'unknown');
    case 'web':
      return String(raw.source_domain ?? 'unknown');
    case 'youtube':
      return String(raw.channel_name ?? 'unknown');
    case 'tiktok':
    case 'instagram':
      return String(raw.author_name ?? 'unknown');
    case 'hn':
      return String(raw.author ?? 'unknown');
    default:
      return 'unknown';
  }
}

/**
 * Extract the text/body content from a platform-specific raw item.
 * Different platforms store their main content in different fields.
 */
function extractText(platform: string, item: RawBaseItem): string {
  const raw = item as Record<string, unknown>;
  // Prefer explicit text field
  if (raw.text && typeof raw.text === 'string') return raw.text;
  // Web items use snippet
  if (raw.snippet && typeof raw.snippet === 'string') return raw.snippet;
  // YouTube uses transcript_snippet
  if (raw.transcript_snippet && typeof raw.transcript_snippet === 'string') {
    return raw.transcript_snippet;
  }
  // TikTok/Instagram use caption_snippet as fallback
  if (raw.caption_snippet && typeof raw.caption_snippet === 'string') {
    return raw.caption_snippet;
  }
  // Polymarket uses question
  if (raw.question && typeof raw.question === 'string') return raw.question;
  // Last resort: use why_relevant or empty
  return String(raw.why_relevant ?? '');
}

/**
 * Normalize a single raw item from any platform into a SearchResultItem.
 */
function normalizeItem(
  platform: string,
  raw: RawBaseItem
): SearchResultItem | null {
  const url = raw.url ?? '';
  if (!url) return null; // Skip items with no URL

  const id = raw.id
    ? `${platform}-${raw.id}`
    : generateId(url || `${platform}-${raw.title ?? ''}`);

  return {
    id,
    platform,
    title: raw.title ?? '',
    text: extractText(platform, raw),
    url,
    author: extractAuthor(platform, raw),
    date: raw.date ?? undefined,
    engagement: raw.engagement ?? undefined,
    score: raw.score ?? 0,
    relevanceReason: raw.why_relevant ?? undefined,
  };
}

/**
 * Map our platform names (used in --search flag) to the JSON report keys.
 * E.g., 'hn' -> 'hackernews' in the JSON output.
 */
function platformToReportKey(platform: string): string {
  if (platform === 'hn') return 'hackernews';
  return platform;
}

/**
 * Map a JSON report key back to a display platform name.
 * E.g., 'hackernews' -> 'hn'.
 */
function reportKeyToPlatform(key: string): string {
  if (key === 'hackernews') return 'hn';
  return key;
}

/**
 * Run the last30days.py search script and return normalized results.
 *
 * @param query - The search query string
 * @param platforms - Array of platform names (e.g., ['reddit', 'x', 'hn'])
 * @param depth - Search depth: 'quick', 'default', or 'deep'
 * @returns Normalized search results sorted by score descending
 */
export async function searchPlatforms(
  query: string,
  platforms: string[],
  depth: 'quick' | 'default' | 'deep' = 'default'
): Promise<SearchResultItem[]> {
  const args = [
    CONFIG.LAST30DAYS_SCRIPT,
    query,
    '--emit=json',
    `--search=${platforms.join(',')}`,
  ];

  // Add depth flag (nothing for 'default')
  if (depth === 'quick') args.push('--quick');
  if (depth === 'deep') args.push('--deep');

  return new Promise((resolve, reject) => {
    execFile(
      'python3',
      args,
      {
        timeout: CONFIG.SEARCH_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large results
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error(
            `[search-runner] Error running last30days.py: ${error.message}`
          );
          if (stderr) {
            console.error(`[search-runner] stderr: ${stderr}`);
          }
          reject(new Error(`Search failed: ${error.message}`));
          return;
        }

        try {
          const report: RawReport = JSON.parse(stdout);
          const results: SearchResultItem[] = [];

          // Iterate over all platform arrays in the report
          const platformArrayKeys = [
            'reddit',
            'x',
            'web',
            'youtube',
            'tiktok',
            'instagram',
            'hackernews',
            'polymarket',
          ];

          for (const key of platformArrayKeys) {
            const items = report[key];
            if (!Array.isArray(items)) continue;

            const displayPlatform = reportKeyToPlatform(key);
            for (const rawItem of items) {
              const normalized = normalizeItem(
                displayPlatform,
                rawItem as RawBaseItem
              );
              if (normalized) {
                results.push(normalized);
              }
            }
          }

          // Sort by score descending
          results.sort((a, b) => b.score - a.score);

          console.log(
            `[search-runner] Found ${results.length} results across ${platforms.join(', ')}`
          );
          resolve(results);
        } catch (parseError) {
          console.error(
            `[search-runner] Failed to parse JSON output: ${(parseError as Error).message}`
          );
          reject(new Error(`Search JSON parse failed: ${(parseError as Error).message}`));
        }
      }
    );
  });
}
