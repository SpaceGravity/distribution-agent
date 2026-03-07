// askUserHelp node — Interrupts after 5 failed evaluation iterations
// Presents a summary report and asks user for search strategy guidance

import { interrupt, Command } from '@langchain/langgraph';
import type { DistributionState } from '../state.js';

export async function askUserHelp(
  state: DistributionState
): Promise<Command> {
  // Build summary report from all evaluation iterations
  const iterationSummaries = state.evaluationHistory.map((record) => ({
    iteration: record.iteration,
    keywords: record.criteria.keywords,
    queries: record.criteria.queries,
    resultCount: record.resultCount,
    satisfactory: record.satisfactory,
    reasoning: record.reasoning,
    suggestedRefinements: record.suggestedRefinements,
  }));

  // Present top results found so far
  const bestResults = [...state.searchResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((r) => ({
      platform: r.platform,
      title: r.title,
      url: r.url,
      score: r.score,
    }));

  console.log(
    `[askUserHelp] Reached ${state.iterationCount ?? 0} iterations without satisfactory results.`
  );

  // Interrupt to ask user for guidance
  const userResponse = interrupt({
    action: 'Search evaluation failed after maximum iterations. Please provide guidance.',
    report: {
      totalIterations: state.iterationCount,
      iterations: iterationSummaries,
      bestResultsSoFar: bestResults,
      totalResultsFound: state.searchResults.length,
    },
    instructions:
      'Please review the iteration summaries and provide new search strategy guidance. What keywords, topics, or approaches should the agent try?',
  });

  const guidance =
    typeof userResponse === 'string'
      ? userResponse
      : userResponse.guidance ?? JSON.stringify(userResponse);

  console.log(
    `[askUserHelp] Received user guidance: ${guidance.substring(0, 100)}...`
  );

  // Reset iteration count and route back to refine search with user guidance
  return new Command({
    update: {
      userGuidance: guidance,
      iterationCount: 0,
    },
    goto: 'refineSearch',
  });
}
