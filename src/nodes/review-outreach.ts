// reviewOutreach node — Batch review of all outreach drafts
// User can approve all, edit specific drafts, or reject targets

import { interrupt, Command } from '@langchain/langgraph';
import type { DistributionState, IdeaTarget } from '../state.js';
import { llm } from '../lib/llm.js';
import { outreachRegenerationPrompt } from '../lib/prompts.js';

export async function reviewOutreach(
  state: DistributionState
): Promise<Command> {
  const drafts = state.ideaTargets.filter(
    (t) => t.status === 'approved' && t.outreachDraft
  );

  if (drafts.length === 0) {
    console.log('[reviewOutreach] No drafts to review. Moving to export.');
    return new Command({ update: {}, goto: 'exportCsv' });
  }

  console.log(
    `[reviewOutreach] Presenting ${drafts.length} outreach drafts for review`
  );

  const userResponse = interrupt({
    action: 'Review outreach drafts',
    drafts: drafts.map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      category: d.category,
      outreachType: d.outreachType,
      outreachDraft: d.outreachDraft,
      url: d.url,
    })),
    instructions:
      'Respond with { "approved": true } to approve all, or { "edits": [{ "id": "...", "feedback": "..." }], "rejections": ["id1", "id2"] } for changes.',
  });

  // Handle approval
  if (
    userResponse.approved === true ||
    (typeof userResponse === 'string' &&
      userResponse.toLowerCase().trim() === 'approve')
  ) {
    console.log('[reviewOutreach] All outreach drafts approved.');
    return new Command({ update: {}, goto: 'exportCsv' });
  }

  const edits: Array<{ id: string; feedback: string }> =
    userResponse.edits ?? [];
  const rejections: string[] = userResponse.rejections ?? [];

  // Process rejections: mark targets as rejected
  const rejectedIds = new Set(rejections);
  const editMap = new Map(edits.map((e) => [e.id, e.feedback]));

  // Regenerate edited drafts in parallel
  const regenerationPromises: Array<{
    target: IdeaTarget;
    promise: Promise<string>;
  }> = [];

  for (const target of state.ideaTargets) {
    const feedback = editMap.get(target.id);
    if (feedback && state.ideaUnderstanding) {
      const prompt = outreachRegenerationPrompt(
        target,
        target.outreachDraft,
        feedback,
        state.ideaUnderstanding
      );
      regenerationPromises.push({
        target,
        promise: llm.invoke(prompt).then((response) =>
          typeof response.content === 'string'
            ? response.content.trim()
            : String(response.content).trim()
        ),
      });
    }
  }

  // Await all regenerations in parallel
  const regenerationResults = await Promise.allSettled(
    regenerationPromises.map((r) => r.promise)
  );
  const regeneratedDrafts = new Map<string, string>();
  for (let i = 0; i < regenerationPromises.length; i++) {
    const result = regenerationResults[i];
    const { target } = regenerationPromises[i];
    if (result.status === 'fulfilled') {
      regeneratedDrafts.set(target.id, result.value);
    } else {
      console.warn(
        `[reviewOutreach] Failed to regenerate draft for ${target.name}: ${result.reason}`
      );
    }
  }

  // Build updated targets
  const updatedTargets: IdeaTarget[] = state.ideaTargets.map((target) => {
    if (rejectedIds.has(target.id)) {
      return {
        ...target,
        status: 'rejected' as const,
        rejectionReason: 'Rejected during outreach review',
      };
    }
    const newDraft = regeneratedDrafts.get(target.id);
    if (newDraft) {
      return { ...target, outreachDraft: newDraft };
    }
    return target;
  });

  return new Command({
    update: { ideaTargets: updatedTargets },
    goto: 'exportCsv',
  });
}
