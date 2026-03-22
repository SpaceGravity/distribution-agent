// askIdeaHelp node — Interrupts after max iterations for idea path
// Presents idea-specific context: targets found, categories, what failed

import { interrupt, Command } from '@langchain/langgraph';
import type { DistributionState } from '../state.js';

export async function askIdeaHelp(
  state: DistributionState
): Promise<Command> {
  // Summarize targets by category
  const categoryCounts: Record<string, number> = {};
  for (const target of state.ideaTargets) {
    categoryCounts[target.category] =
      (categoryCounts[target.category] ?? 0) + 1;
  }

  // Get best targets found so far
  const bestTargets = state.ideaTargets
    .filter((t) => t.status !== 'rejected')
    .slice(0, 10)
    .map((t) => ({
      name: t.name,
      platform: t.platform,
      category: t.category,
      whyRelevant: t.whyRelevant,
    }));

  const iterationSummaries = state.evaluationHistory.map((record) => ({
    iteration: record.iteration,
    resultCount: record.resultCount,
    satisfactory: record.satisfactory,
    reasoning: record.reasoning,
    suggestedRefinements: record.suggestedRefinements,
  }));

  console.log(
    `[askIdeaHelp] Reached ${state.iterationCount ?? 0} iterations without satisfactory targets.`
  );

  const userResponse = interrupt({
    action:
      'Idea target discovery needs your input after maximum iterations.',
    report: {
      problemHypothesis:
        state.ideaUnderstanding?.problemHypothesis ?? 'unknown',
      totalIterations: state.iterationCount,
      targetsFound: state.ideaTargets.length,
      categoryCounts,
      bestTargets,
      iterations: iterationSummaries,
    },
    instructions:
      'You have two options:\n1. Type "proceed" to review and use the targets found so far.\n2. Provide search guidance (communities, demographics, keywords) to try again.',
  });

  const guidance =
    typeof userResponse === 'string'
      ? userResponse
      : userResponse.guidance ?? JSON.stringify(userResponse);

  console.log(
    `[askIdeaHelp] Received user guidance: ${guidance.substring(0, 100)}...`
  );

  // Check if user wants to proceed with current targets
  const lower = guidance.toLowerCase();
  const proceedSignals = ['proceed', 'what you have', 'what you found', 'give me', 'use current', 'skip', 'just use', 'go ahead', 'move on'];
  const wantsProceed = proceedSignals.some((signal) => lower.includes(signal));

  if (wantsProceed && state.ideaTargets.length > 0) {
    console.log(
      `[askIdeaHelp] User wants to proceed with ${state.ideaTargets.length} existing targets.`
    );
    // Mark all pending targets as approved so batchReviewTargets can present them
    const updatedTargets = state.ideaTargets.map((t) =>
      t.status === 'pending' ? { ...t, status: 'approved' as const } : t
    );
    return new Command({
      update: {
        ideaTargets: updatedTargets,
      },
      goto: 'batchReviewTargets',
    });
  }

  return new Command({
    update: {
      userGuidance: guidance,
      iterationCount: 0,
    },
    goto: 'refineIdeaSearch',
  });
}
