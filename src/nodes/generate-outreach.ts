// generateOutreach node — Generates context-aware outreach drafts
// Tone: validation-focused (curious, question-asking, not pitching)

import type { DistributionState, IdeaTarget } from '../state.js';
import { llm } from '../lib/llm.js';
import { outreachDraftPrompt } from '../lib/prompts.js';

export async function generateOutreach(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  if (!state.ideaUnderstanding) {
    throw new Error('Idea understanding not available in state.');
  }

  // Generate for approved targets without real drafts
  // Empty string or failed sentinel both need (re)generation
  const targets = state.ideaTargets.filter(
    (t) =>
      t.status === 'approved' &&
      (!t.outreachDraft || t.outreachDraft === '[Draft generation failed]')
  );

  if (targets.length === 0) {
    console.log('[generateOutreach] No targets need outreach drafts.');
    return {};
  }

  console.log(
    `[generateOutreach] Generating outreach drafts for ${targets.length} targets`
  );

  // Determine outreach type for each target
  const targetsWithType = targets.map((t) => ({
    ...t,
    outreachType: determineOutreachType(t),
  }));

  // Generate drafts in batches of 5
  const updatedTargets: IdeaTarget[] = [];
  for (let i = 0; i < targetsWithType.length; i += 5) {
    const batch = targetsWithType.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (target) => {
        const prompt = outreachDraftPrompt(target, state.ideaUnderstanding!);
        const response = await llm.invoke(prompt);
        const draft =
          typeof response.content === 'string'
            ? response.content.trim()
            : String(response.content).trim();

        return {
          ...target,
          outreachDraft: draft,
        };
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        updatedTargets.push(result.value);
      } else {
        console.warn(
          `[generateOutreach] Failed for ${batch[j].name}: ${result.reason}`
        );
        updatedTargets.push({
          ...batch[j],
          outreachDraft: '[Draft generation failed]',
        });
      }
    }
  }

  console.log(
    `[generateOutreach] Generated ${updatedTargets.length} outreach drafts`
  );

  return { ideaTargets: updatedTargets };
}

function determineOutreachType(
  target: IdeaTarget
): 'dm' | 'post' | 'comment' {
  if (target.category === 'community_hub') return 'post';
  if (target.sourcePostUrl && target.sourcePostUrl !== target.url)
    return 'comment';
  return 'dm';
}
