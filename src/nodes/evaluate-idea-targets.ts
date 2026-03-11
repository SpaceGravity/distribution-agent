// evaluateIdeaTargets node — LLM evaluates targets against idea understanding
// Routes to: batchReviewTargets, refineIdeaSearch, or askIdeaHelp

import { Command } from '@langchain/langgraph';
import z from 'zod';
import type { DistributionState } from '../state.js';
import { llm } from '../lib/llm.js';
import { evaluateIdeaTargetsPrompt } from '../lib/prompts.js';
import { CONFIG } from '../config.js';

const IdeaEvaluationDecisionSchema = z.object({
  satisfactory: z.boolean(),
  reasoning: z.string(),
  approvedTargetIds: z.array(z.string()),
  suggestedRefinements: z.string().optional(),
});

export async function evaluateIdeaTargets(
  state: DistributionState
): Promise<Command> {
  if (!state.ideaUnderstanding) {
    throw new Error('Idea understanding not available in state.');
  }

  const newIteration = (state.iterationCount ?? 0) + 1;
  console.log(
    `[evaluateIdeaTargets] Iteration ${newIteration}/${CONFIG.MAX_ITERATIONS}, evaluating ${state.ideaTargets.length} targets`
  );

  // Filter out already rejected targets
  const rejectedIds = new Set(
    state.ideaRejectionNotes.map((n) => n.targetId)
  );
  const activeTargets = state.ideaTargets.filter(
    (t) => !rejectedIds.has(t.id)
  );

  const structuredLlm = llm.withStructuredOutput(
    IdeaEvaluationDecisionSchema
  );
  const prompt = evaluateIdeaTargetsPrompt(
    activeTargets,
    state.ideaUnderstanding,
    state.ideaRejectionNotes.length > 0
      ? state.ideaRejectionNotes
      : undefined
  );

  const decision = await structuredLlm.invoke(prompt);

  // Build evaluation record
  const record = {
    iteration: newIteration,
    criteria: state.searchCriteria ?? { keywords: [], queries: [], depth: 'default' },
    resultCount: activeTargets.length,
    topResultIds: decision.approvedTargetIds,
    satisfactory: decision.satisfactory,
    reasoning: decision.reasoning,
    suggestedRefinements: decision.suggestedRefinements,
  };

  console.log(
    `[evaluateIdeaTargets] Decision: ${decision.satisfactory ? 'SATISFACTORY' : 'NOT SATISFACTORY'} — ${decision.reasoning.substring(0, 80)}...`
  );

  if (decision.satisfactory) {
    // Mark approved targets
    const approvedIds = new Set(decision.approvedTargetIds);
    const updatedTargets = state.ideaTargets.map((t) =>
      approvedIds.has(t.id) ? { ...t, status: 'approved' as const } : t
    );

    return new Command({
      update: {
        evaluationHistory: [record],
        iterationCount: newIteration,
        ideaTargets: updatedTargets,
      },
      goto: 'batchReviewTargets',
    });
  }

  if (newIteration >= CONFIG.MAX_ITERATIONS) {
    console.log(
      `[evaluateIdeaTargets] Max iterations (${CONFIG.MAX_ITERATIONS}) reached. Asking user for help.`
    );
    return new Command({
      update: {
        evaluationHistory: [record],
        iterationCount: newIteration,
      },
      goto: 'askIdeaHelp',
    });
  }

  return new Command({
    update: {
      evaluationHistory: [record],
      iterationCount: newIteration,
    },
    goto: 'refineIdeaSearch',
  });
}
