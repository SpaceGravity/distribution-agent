// evaluate node — LLM evaluates search results for product-market fit
// Routes to: generateReplies (satisfactory), refineSearch (retry), askUserHelp (5 failures)

import { Command } from '@langchain/langgraph';
import z from 'zod';
import type { DistributionState } from '../state.js';
import { llm } from '../lib/llm.js';
import { evaluationPrompt } from '../lib/prompts.js';
import { loadCrossSessionMemory } from '../lib/memory.js';
import { CONFIG } from '../config.js';

// Structured output for evaluation decision
const EvaluationDecisionSchema = z.object({
  satisfactory: z.boolean(),
  reasoning: z.string(),
  suggestedRefinements: z.string().optional(),
  topResultIds: z.array(z.string()).optional(),
});

export async function evaluate(state: DistributionState): Promise<Command> {
  if (!state.businessUnderstanding) {
    throw new Error('Business understanding not available in state.');
  }

  const newIteration = (state.iterationCount ?? 0) + 1;
  console.log(
    `[evaluate] Iteration ${newIteration}/${CONFIG.MAX_ITERATIONS}, evaluating ${state.searchResults.length} results`
  );

  // Sort results by score, take top 30 for evaluation
  const topResults = [...state.searchResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  const structuredLlm = llm.withStructuredOutput(EvaluationDecisionSchema);
  const memory = loadCrossSessionMemory('business');
  const prompt = evaluationPrompt(
    state.businessUnderstanding,
    topResults,
    state.evaluationHistory,
    newIteration,
    state.targetRejectionNotes.length > 0
      ? state.targetRejectionNotes
      : undefined,
    state.searchResults.length,
    memory
  );

  const decision = await structuredLlm.invoke(prompt);

  // Build evaluation record
  const record = {
    iteration: newIteration,
    criteria: state.searchCriteria!,
    resultCount: state.searchResults.length,
    topResultIds: decision.topResultIds ?? [],
    satisfactory: decision.satisfactory,
    reasoning: decision.reasoning,
    suggestedRefinements: decision.suggestedRefinements,
  };

  console.log(
    `[evaluate] Decision: ${decision.satisfactory ? 'SATISFACTORY' : 'NOT SATISFACTORY'} — ${decision.reasoning.substring(0, 80)}...`
  );

  // Route based on evaluation
  if (decision.satisfactory) {
    // Filter results to only LLM-approved relevant ones
    const approvedIds = new Set(decision.topResultIds ?? []);
    let filteredResults: typeof topResults;
    if (approvedIds.size > 0) {
      filteredResults = state.searchResults.filter((r) => approvedIds.has(r.id));
    } else {
      // LLM said satisfactory but returned no IDs — conservative fallback to top 10
      console.warn('[evaluate] LLM marked satisfactory but returned no topResultIds. Using top 10 by score as fallback.');
      filteredResults = topResults.slice(0, 10);
    }

    console.log(
      `[evaluate] Approved ${filteredResults.length} relevant results out of ${state.searchResults.length} total`
    );

    return new Command({
      update: {
        evaluationHistory: [record],
        iterationCount: newIteration,
        searchSatisfactory: true,
        approvedTargets: filteredResults,
      },
      goto: 'generateReplies',
    });
  }

  if (newIteration >= CONFIG.MAX_ITERATIONS) {
    console.log(
      `[evaluate] Max iterations (${CONFIG.MAX_ITERATIONS}) reached. Asking user for help.`
    );
    return new Command({
      update: {
        evaluationHistory: [record],
        iterationCount: newIteration,
      },
      goto: 'askUserHelp',
    });
  }

  return new Command({
    update: {
      evaluationHistory: [record],
      iterationCount: newIteration,
    },
    goto: 'refineSearch',
  });
}
