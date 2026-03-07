// reviewReply node — One-by-one sequential review of reply drafts
// Uses interrupt() for each draft: approve, edit, reject (with feedback), or skip

import { interrupt, Command } from '@langchain/langgraph';
import type { DistributionState } from '../state.js';
import { llm } from '../lib/llm.js';
import { replyRegenerationPrompt } from '../lib/prompts.js';

export async function reviewReply(
  state: DistributionState
): Promise<Command> {
  const { replyDrafts, currentReviewIndex } = state;

  // Check if all drafts have been reviewed
  if (currentReviewIndex >= replyDrafts.length) {
    console.log('[reviewReply] All drafts reviewed. Moving to saveMemory.');
    return new Command({ update: {}, goto: 'saveMemory' });
  }

  const draft = replyDrafts[currentReviewIndex];

  // Skip drafts that were already marked as skipped (failed generation)
  if (draft.status === 'skipped') {
    console.log(
      `[reviewReply] Skipping failed draft for ${draft.targetUrl}`
    );
    return new Command({
      update: { currentReviewIndex: currentReviewIndex + 1 },
      goto: 'reviewReply',
    });
  }

  console.log(
    `[reviewReply] Reviewing draft ${currentReviewIndex + 1}/${replyDrafts.length}`
  );

  // Interrupt to present draft for user review
  const userDecision = interrupt({
    action: 'Review this reply draft',
    reviewIndex: `${currentReviewIndex + 1} of ${replyDrafts.length}`,
    originalPost: {
      platform: draft.targetPlatform,
      title: draft.targetTitle,
      text: draft.targetText,
      url: draft.targetUrl,
    },
    proposedReply: draft.draft,
    options: 'approve | edit | reject | skip',
  });

  const action =
    typeof userDecision === 'string'
      ? userDecision.toLowerCase().trim()
      : (userDecision.action ?? 'skip').toLowerCase().trim();

  // Handle: approve
  if (action === 'approve') {
    const updatedDraft = { ...draft, status: 'approved' as const };
    return new Command({
      update: { replyDrafts: [updatedDraft] },
      goto: 'postReply',
    });
  }

  // Handle: edit (user provides edited text)
  if (action === 'edit' || action.startsWith('edit:')) {
    const editedText =
      typeof userDecision === 'string'
        ? userDecision.replace(/^edit:\s*/i, '')
        : userDecision.editedReply ?? draft.draft;

    const updatedDraft = {
      ...draft,
      status: 'edited' as const,
      editedDraft: editedText,
    };
    return new Command({
      update: { replyDrafts: [updatedDraft] },
      goto: 'postReply',
    });
  }

  // Handle: skip (move to next without posting)
  if (action === 'skip') {
    const updatedDraft = { ...draft, status: 'skipped' as const };
    return new Command({
      update: {
        replyDrafts: [updatedDraft],
        currentReviewIndex: currentReviewIndex + 1,
      },
      goto: 'reviewReply',
    });
  }

  // Handle: reject (regenerate with feedback)
  const feedback =
    typeof userDecision === 'string'
      ? userDecision.replace(/^reject:\s*/i, '')
      : userDecision.feedback ?? 'Please try a different approach.';

  console.log(`[reviewReply] Regenerating with feedback: ${feedback}`);

  // Regenerate the reply using user feedback
  const prompt = replyRegenerationPrompt(
    {
      id: draft.targetId,
      platform: draft.targetPlatform,
      title: draft.targetTitle,
      text: draft.targetText,
      url: draft.targetUrl,
      author: '',
      score: 0,
    },
    draft.draft,
    feedback,
    state.businessUnderstanding!,
    state.toneExamples
  );

  const response = await llm.invoke(prompt);
  const newDraft =
    typeof response.content === 'string'
      ? response.content
      : String(response.content);

  const updatedDraft = {
    ...draft,
    draft: newDraft.trim(),
    status: 'pending' as const,
    userFeedback: feedback,
  };

  // Loop back to reviewReply with the regenerated draft (same index)
  return new Command({
    update: { replyDrafts: [updatedDraft] },
    goto: 'reviewReply',
  });
}
