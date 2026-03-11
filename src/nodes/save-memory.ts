// saveMemory node — Persists the winning search strategy for future reference
// Uses a local JSON file for cross-session memory (LangGraph Store integration TBD)

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import type { DistributionState } from '../state.js';

const MEMORY_DIR = resolve(
  process.env.HOME ?? '~',
  '.distribution-agent'
);
const MEMORY_FILE = resolve(MEMORY_DIR, 'search-strategies.json');

interface StrategyRecord {
  timestamp: string;
  mode: 'business' | 'idea';
  businessSummary: string;
  platforms: string[];
  winningCriteria: {
    keywords: string[];
    queries: string[];
    depth: string;
  };
  iterationsUsed: number;
  totalResultsFound: number;
  repliesGenerated: number;
  repliesPosted: number;
  targetRejectionPatterns?: string[];
  // Idea-specific fields
  ideaSummary?: string;
  targetsDiscovered?: number;
  targetCategories?: Record<string, number>;
  ideaRejectionPatterns?: string[];
}

export async function saveMemory(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  // Build strategy record from final state
  const successfulEval = state.evaluationHistory.find((e) => e.satisfactory);
  const criteria = successfulEval?.criteria ?? state.searchCriteria;

  const isIdeaMode = state.mode === 'idea';

  // Build category counts for idea mode
  let targetCategories: Record<string, number> | undefined;
  if (isIdeaMode && state.ideaTargets.length > 0) {
    targetCategories = {};
    for (const t of state.ideaTargets) {
      targetCategories[t.category] =
        (targetCategories[t.category] ?? 0) + 1;
    }
  }

  const record: StrategyRecord = {
    timestamp: new Date().toISOString(),
    mode: isIdeaMode ? 'idea' : 'business',
    businessSummary:
      state.businessUnderstanding?.summary ?? 'unknown',
    platforms: state.selectedPlatforms,
    winningCriteria: {
      keywords: criteria?.keywords ?? [],
      queries: criteria?.queries ?? [],
      depth: criteria?.depth ?? 'default',
    },
    iterationsUsed: state.iterationCount ?? 0,
    totalResultsFound: state.searchResults.length,
    repliesGenerated: state.replyDrafts.length,
    repliesPosted: state.postedReplies.length,
    targetRejectionPatterns:
      state.targetRejectionNotes.length > 0
        ? state.targetRejectionNotes.map(
            (n) => `[${n.targetPlatform}] ${n.reason}`
          )
        : undefined,
    // Idea-specific fields
    ideaSummary: isIdeaMode
      ? state.ideaUnderstanding?.problemHypothesis
      : undefined,
    targetsDiscovered: isIdeaMode
      ? state.ideaTargets.length
      : undefined,
    targetCategories,
    ideaRejectionPatterns:
      isIdeaMode && state.ideaRejectionNotes.length > 0
        ? state.ideaRejectionNotes.map(
            (n) => `[${n.platform}] ${n.reason}`
          )
        : undefined,
  };

  // Persist to local file
  try {
    mkdirSync(dirname(MEMORY_FILE), { recursive: true });

    let strategies: StrategyRecord[] = [];
    if (existsSync(MEMORY_FILE)) {
      const existing = readFileSync(MEMORY_FILE, 'utf-8');
      strategies = JSON.parse(existing);
    }

    strategies.push(record);

    // Keep last 50 strategies
    if (strategies.length > 50) {
      strategies = strategies.slice(-50);
    }

    writeFileSync(MEMORY_FILE, JSON.stringify(strategies, null, 2));
    console.log(`[saveMemory] Strategy saved to ${MEMORY_FILE}`);
  } catch (err) {
    console.warn(`[saveMemory] Failed to persist strategy: ${err}`);
  }

  // Log run summary
  console.log('\n=== Distribution Agent Run Summary ===');
  console.log(`Mode: ${record.mode}`);
  if (record.mode === 'idea') {
    console.log(
      `Idea: ${record.ideaSummary?.substring(0, 80) ?? 'unknown'}`
    );
    console.log(`Targets discovered: ${record.targetsDiscovered ?? 0}`);
    if (record.targetCategories) {
      console.log(
        `Categories: ${Object.entries(record.targetCategories)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')}`
      );
    }
    if (state.csvOutputPath) {
      console.log(`CSV exported: ${state.csvOutputPath}`);
    }
  } else {
    console.log(
      `Business: ${record.businessSummary.substring(0, 80)}`
    );
    console.log(`Replies generated: ${record.repliesGenerated}`);
    console.log(`Replies posted: ${record.repliesPosted}`);
  }
  console.log(`Platforms: ${record.platforms.join(', ')}`);
  console.log(`Search iterations: ${record.iterationsUsed}`);
  console.log(`Results found: ${record.totalResultsFound}`);
  console.log('======================================\n');

  return {};
}
