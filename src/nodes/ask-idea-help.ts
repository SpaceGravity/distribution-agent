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
      'Idea target discovery failed after maximum iterations. Please provide guidance.',
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
      'Please review the targets found so far and provide guidance. What communities, demographics, or search approaches should the agent try?',
  });

  const guidance =
    typeof userResponse === 'string'
      ? userResponse
      : userResponse.guidance ?? JSON.stringify(userResponse);

  console.log(
    `[askIdeaHelp] Received user guidance: ${guidance.substring(0, 100)}...`
  );

  return new Command({
    update: {
      userGuidance: guidance,
      iterationCount: 0,
    },
    goto: 'refineIdeaSearch',
  });
}
