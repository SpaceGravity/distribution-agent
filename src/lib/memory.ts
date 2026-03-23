// Cross-session memory for the Distribution Agent
// Persists rejection patterns, strategies, preferences, and session history
// to ~/.distribution-agent/memory/ as JSON files.
// No external dependencies — uses Node.js fs, path, and crypto.randomUUID().

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { CONFIG } from '../config.js';
import type { DistributionState } from '../state.js';

// === Types ===

export interface RejectionPattern {
  id: string;
  rule: string;
  platforms: string[];
  examples: string[]; // max 3
  strength: number; // 1-10
  createdAt: string;
  lastSeenAt: string;
}

interface RejectionPatternsFile {
  version: 1;
  updatedAt: string;
  business: RejectionPattern[];
  idea: RejectionPattern[];
}

interface SessionStrategy {
  id: string;
  productOrIdea: string; // first 80 chars
  keywords: string[];
  queries: string[];
  platforms: string[];
  approvalRate: number; // 0-1
  totalTargetsFound: number;
  totalApproved: number;
  totalRejected: number;
  iterationsNeeded: number;
  createdAt: string;
}

interface StrategiesFile {
  version: 1;
  updatedAt: string;
  business: SessionStrategy[];
  idea: SessionStrategy[];
}

interface PlatformPreference {
  platform: string;
  usageCount: number;
  lastUsed: string;
}

interface ReplyStyleFeedback {
  feedback: string;
  platform: string;
  occurrences: number;
  lastSeenAt: string;
}

interface PreferencesFile {
  version: 1;
  updatedAt: string;
  platformPreferences: PlatformPreference[];
  tonePatterns: string[];
  replyStyleFeedback: ReplyStyleFeedback[];
}

interface SessionSummary {
  id: string;
  mode: 'business' | 'idea';
  productOrIdea: string;
  startedAt: string;
  completedAt: string;
  platforms: string[];
  resultsFound: number;
  approvalRate: number;
  outcome: string;
}

interface SessionHistoryFile {
  version: 1;
  sessions: SessionSummary[];
}

export interface CrossSessionMemory {
  rejectionPatterns: RejectionPattern[];
  recentStrategies: SessionStrategy[];
}

// === Defaults ===

const DEFAULT_REJECTION_PATTERNS: RejectionPatternsFile = {
  version: 1,
  updatedAt: '',
  business: [],
  idea: [],
};

const DEFAULT_STRATEGIES: StrategiesFile = {
  version: 1,
  updatedAt: '',
  business: [],
  idea: [],
};

const DEFAULT_PREFERENCES: PreferencesFile = {
  version: 1,
  updatedAt: '',
  platformPreferences: [],
  tonePatterns: [],
  replyStyleFeedback: [],
};

const DEFAULT_SESSION_HISTORY: SessionHistoryFile = {
  version: 1,
  sessions: [],
};

// === File I/O ===

function ensureMemoryDir(): void {
  if (!existsSync(CONFIG.MEMORY_DIR)) {
    mkdirSync(CONFIG.MEMORY_DIR, { recursive: true });
  }
}

function readJsonFile<T extends { version: number }>(
  filename: string,
  defaultValue: T
): T {
  const filePath = join(CONFIG.MEMORY_DIR, filename);
  try {
    if (!existsSync(filePath)) return defaultValue;
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as T;
    if (parsed.version !== defaultValue.version) {
      console.warn(`[memory] ${filename} version mismatch. Starting fresh.`);
      return defaultValue;
    }
    return parsed;
  } catch (err) {
    console.warn(`[memory] Failed to read ${filename}, using defaults:`, err);
    return defaultValue;
  }
}

function writeJsonFile<T>(filename: string, data: T): void {
  ensureMemoryDir();
  const filePath = join(CONFIG.MEMORY_DIR, filename);
  const tmpPath = filePath + '.tmp';
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    console.warn(`[memory] Failed to write ${filename}:`, err);
    try {
      unlinkSync(tmpPath);
    } catch {
      // tmp file may not exist
    }
  }
}

// === Helpers ===

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function generateId(): string {
  return crypto.randomUUID();
}

// === Reader Functions ===

function loadRejectionPatterns(): RejectionPatternsFile {
  const data = readJsonFile('rejection-patterns.json', DEFAULT_REJECTION_PATTERNS);

  // Lazy decay: reduce strength for patterns not seen in 90 days
  const now = Date.now();
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

  for (const list of [data.business, data.idea]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const age = now - new Date(list[i].lastSeenAt).getTime();
      if (age > NINETY_DAYS) {
        list[i].strength = Math.max(0, list[i].strength - 1);
        if (list[i].strength <= 0) {
          list.splice(i, 1);
        }
      }
    }
  }

  return data;
}

function loadStrategies(): StrategiesFile {
  return readJsonFile('strategies.json', DEFAULT_STRATEGIES);
}

/**
 * Loads cross-session memory for injection into prompts.
 * Filters rejection patterns to strength >= 2, top 10.
 * Returns top 5 strategies by approval rate.
 */
export function loadCrossSessionMemory(
  mode: 'business' | 'idea'
): CrossSessionMemory {
  const patterns = loadRejectionPatterns();
  const strategies = loadStrategies();

  const modePatterns = (mode === 'business' ? patterns.business : patterns.idea)
    .filter((p) => p.strength >= 2)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10);

  const modeStrategies = (
    mode === 'business' ? strategies.business : strategies.idea
  )
    .sort((a, b) => b.approvalRate - a.approvalRate)
    .slice(0, 5);

  return {
    rejectionPatterns: modePatterns,
    recentStrategies: modeStrategies,
  };
}

// === Writer Functions ===

/**
 * Extracts rejection patterns from session rejection notes and persists them.
 * Deterministic matching — no LLM calls. 3+ keyword overlap = match.
 */
export function extractAndSaveRejectionPatterns(
  mode: 'business' | 'idea',
  rejectionNotes: Array<{
    reason: string;
    platform?: string;
    targetPlatform?: string;
  }>
): void {
  if (rejectionNotes.length === 0) return;

  const data = readJsonFile(
    'rejection-patterns.json',
    DEFAULT_REJECTION_PATTERNS
  );
  const list = mode === 'business' ? data.business : data.idea;
  const now = new Date().toISOString();

  for (const note of rejectionNotes) {
    const reason = note.reason.trim();
    if (!reason || reason === 'No reason provided') continue;

    const platform =
      note.platform ?? note.targetPlatform ?? 'unknown';
    const reasonWords = extractKeywords(reason);

    // Find existing pattern with keyword overlap
    let matched = false;
    for (const pattern of list) {
      const patternWords = extractKeywords(pattern.rule);
      const overlap = reasonWords.filter((w) => patternWords.includes(w));
      if (overlap.length >= 3) {
        pattern.strength = Math.min(10, pattern.strength + 1);
        pattern.lastSeenAt = now;
        if (!pattern.platforms.includes(platform)) {
          pattern.platforms.push(platform);
        }
        if (
          pattern.examples.length < 3 &&
          !pattern.examples.includes(reason)
        ) {
          pattern.examples.push(reason);
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      list.push({
        id: generateId(),
        rule: reason,
        platforms: [platform],
        examples: [reason],
        strength: 1,
        createdAt: now,
        lastSeenAt: now,
      });
    }
  }

  data.updatedAt = now;
  writeJsonFile('rejection-patterns.json', data);
}

/**
 * Saves the current session's search strategy with approval metrics.
 * Capped at 20 per mode — lowest approval rate removed.
 */
export function saveSessionStrategy(
  mode: 'business' | 'idea',
  state: DistributionState
): void {
  const data = readJsonFile('strategies.json', DEFAULT_STRATEGIES);
  const list = mode === 'business' ? data.business : data.idea;
  const now = new Date().toISOString();

  const productOrIdea =
    mode === 'business'
      ? (state.businessUnderstanding?.summary ?? 'unknown').substring(0, 80)
      : (state.ideaUnderstanding?.problemHypothesis ?? 'unknown').substring(
          0,
          80
        );

  let totalFound: number;
  let totalApproved: number;
  let totalRejected: number;

  if (mode === 'business') {
    totalApproved = state.replyDrafts.filter(
      (d) =>
        d.status === 'approved' || d.status === 'edited' || d.status === 'posted'
    ).length;
    totalRejected = state.targetRejectionNotes.length;
    totalFound = totalApproved + totalRejected;
  } else {
    totalFound = state.ideaTargets.length;
    totalApproved = state.ideaTargets.filter(
      (t) => t.status === 'approved'
    ).length;
    totalRejected = state.ideaRejectionNotes.length;
  }

  const approvalRate = totalFound > 0 ? totalApproved / totalFound : 0;

  list.push({
    id: generateId(),
    productOrIdea,
    keywords: state.searchCriteria?.keywords ?? [],
    queries: state.searchCriteria?.queries ?? [],
    platforms: [...state.selectedPlatforms],
    approvalRate,
    totalTargetsFound: totalFound,
    totalApproved,
    totalRejected,
    iterationsNeeded: state.iterationCount ?? 0,
    createdAt: now,
  });

  // Cap at 20 per mode — remove lowest approval rate
  if (list.length > 20) {
    list.sort((a, b) => b.approvalRate - a.approvalRate);
    list.length = 20;
  }

  data.updatedAt = now;
  writeJsonFile('strategies.json', data);
}

/**
 * Saves platform usage and reply style feedback from user edits.
 */
export function savePreferences(state: DistributionState): void {
  const data = readJsonFile('preferences.json', DEFAULT_PREFERENCES);
  const now = new Date().toISOString();

  // Platform usage
  for (const platform of state.selectedPlatforms) {
    const existing = data.platformPreferences.find(
      (p) => p.platform === platform
    );
    if (existing) {
      existing.usageCount++;
      existing.lastUsed = now;
    } else {
      data.platformPreferences.push({
        platform,
        usageCount: 1,
        lastUsed: now,
      });
    }
  }

  // Reply style feedback from reject_reply actions
  for (const draft of state.replyDrafts) {
    if (draft.userFeedback) {
      const existing = data.replyStyleFeedback.find(
        (f) =>
          f.feedback === draft.userFeedback &&
          f.platform === draft.targetPlatform
      );
      if (existing) {
        existing.occurrences++;
        existing.lastSeenAt = now;
      } else {
        data.replyStyleFeedback.push({
          feedback: draft.userFeedback,
          platform: draft.targetPlatform,
          occurrences: 1,
          lastSeenAt: now,
        });
      }
    }
  }

  // Cap reply style feedback at 20
  if (data.replyStyleFeedback.length > 20) {
    data.replyStyleFeedback.sort((a, b) => b.occurrences - a.occurrences);
    data.replyStyleFeedback.length = 20;
  }

  data.updatedAt = now;
  writeJsonFile('preferences.json', data);
}

/**
 * Appends a session summary. Capped at 50 entries (FIFO).
 */
export function saveSessionSummary(
  mode: 'business' | 'idea',
  state: DistributionState
): void {
  const data = readJsonFile('session-history.json', DEFAULT_SESSION_HISTORY);
  const now = new Date().toISOString();

  const productOrIdea =
    mode === 'business'
      ? (state.businessUnderstanding?.summary ?? 'unknown').substring(0, 80)
      : (state.ideaUnderstanding?.problemHypothesis ?? 'unknown').substring(
          0,
          80
        );

  let approvalRate: number;
  let outcome: string;

  if (mode === 'business') {
    const total = state.replyDrafts.length;
    const posted = state.postedReplies.length;
    approvalRate = total > 0 ? posted / total : 0;
    outcome = `Posted ${posted} of ${total} replies across ${state.selectedPlatforms.join(', ')}.`;
  } else {
    const total = state.ideaTargets.length;
    const approved = state.ideaTargets.filter(
      (t) => t.status === 'approved'
    ).length;
    approvalRate = total > 0 ? approved / total : 0;
    outcome = `Discovered ${approved} approved targets of ${total} total across ${state.selectedPlatforms.join(', ')}.`;
  }

  data.sessions.push({
    id: generateId(),
    mode,
    productOrIdea,
    startedAt: now,
    completedAt: now,
    platforms: [...state.selectedPlatforms],
    resultsFound: state.searchResults.length,
    approvalRate,
    outcome,
  });

  // Cap at 50 — FIFO
  if (data.sessions.length > 50) {
    data.sessions = data.sessions.slice(-50);
  }

  writeJsonFile('session-history.json', data);
}
