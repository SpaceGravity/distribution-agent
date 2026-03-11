// Configuration constants for the Distribution Agent
// All values sourced from environment variables with sensible defaults

import { resolve } from 'path';

export const CONFIG = {
  // LLM settings
  ANTHROPIC_MODEL: 'claude-sonnet-4-6',

  // Search settings
  MAX_ITERATIONS: parseInt(
    process.env.DISTRIBUTION_AGENT_MAX_ITERATIONS ?? '5'
  ),
  DEFAULT_TARGET_COUNT: parseInt(
    process.env.DISTRIBUTION_AGENT_DEFAULT_TARGET_COUNT ?? '20'
  ),
  LAST30DAYS_SCRIPT: resolve(
    process.env.HOME ?? '~',
    '.claude/skills/last30days/scripts/last30days.py'
  ),
  SUPPORTED_PLATFORMS: [
    'reddit',
    'x',
    'hn',
    'youtube',
    'tiktok',
    'instagram',
    'web',
  ] as const,

  // Reply settings
  REPLY_MAX_SENTENCES: 4,
  REPLY_CONCURRENCY_LIMIT: 5,

  // Posting settings
  AUTO_POST_ENABLED: process.env.AUTO_POST_ENABLED === 'true',

  // Persistence settings
  DB_PATH: resolve(
    process.env.DISTRIBUTION_AGENT_DB_PATH ?? './distribution-agent.sqlite'
  ),

  // Search runner
  SEARCH_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes

  // File validation
  MAX_BUSINESS_FILE_SIZE: 50 * 1024, // 50KB

  // Idea path settings
  IDEA_TARGET_CAP: 50,
  IDEA_MAX_REVIEW_CYCLES: 5,
  MAX_IDEA_FILE_SIZE: 50 * 1024, // 50KB

  // Enrichment API keys (required for idea path)
  REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID ?? '',
  REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET ?? '',
  X_BEARER_TOKEN: process.env.X_BEARER_TOKEN ?? '',

  ENRICHMENT_CONCURRENCY: 10,
  ENRICHMENT_TIMEOUT_MS: 10_000,

  // CSV output
  CSV_OUTPUT_DIR: resolve(
    process.env.DISTRIBUTION_AGENT_CSV_DIR ?? './output'
  ),
} as const;

export type Platform = (typeof CONFIG.SUPPORTED_PLATFORMS)[number];
