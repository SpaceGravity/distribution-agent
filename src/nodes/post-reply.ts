// postReply node — Posts the approved/edited reply or presents for manual posting
// Checks AUTO_POST_ENABLED config flag; defaults to clipboard + link

import { Command } from '@langchain/langgraph';
import type { DistributionState, PostedReply } from '../state.js';
import { CONFIG } from '../config.js';

export async function postReply(state: DistributionState): Promise<Command> {
  const { replyDrafts, currentReviewIndex } = state;
  const draft = replyDrafts[currentReviewIndex];

  if (!draft || (draft.status !== 'approved' && draft.status !== 'edited')) {
    // Should not happen, but handle gracefully
    return new Command({
      update: { currentReviewIndex: currentReviewIndex + 1 },
      goto: 'reviewReply',
    });
  }

  const replyText = draft.editedDraft ?? draft.draft;

  let posted: PostedReply;

  if (CONFIG.AUTO_POST_ENABLED) {
    // Future: call platform API to post the reply
    console.log(
      `[postReply] AUTO-POST to ${draft.targetPlatform}: ${draft.targetUrl}`
    );
    console.log(`[postReply] Reply: ${replyText}`);
    // TODO: implement platform-specific posting when write tokens are available
    posted = {
      targetId: draft.targetId,
      targetUrl: draft.targetUrl,
      platform: draft.targetPlatform,
      replyText,
      postedAt: new Date().toISOString(),
      method: 'auto',
    };
  } else {
    // Manual posting: present reply for clipboard copy + link
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PLATFORM: ${draft.targetPlatform.toUpperCase()}`);
    console.log(`POST URL: ${draft.targetUrl}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`REPLY TO COPY:\n\n${replyText}\n`);
    console.log(`${'='.repeat(60)}\n`);

    posted = {
      targetId: draft.targetId,
      targetUrl: draft.targetUrl,
      platform: draft.targetPlatform,
      replyText,
      postedAt: new Date().toISOString(),
      method: 'manual',
    };
  }

  // Mark draft as posted, advance to next
  const updatedDraft = { ...draft, status: 'posted' as const };
  const nextIndex = currentReviewIndex + 1;

  // Check if this was the last draft
  if (nextIndex >= replyDrafts.length) {
    return new Command({
      update: {
        replyDrafts: [updatedDraft],
        postedReplies: [posted],
        currentReviewIndex: nextIndex,
      },
      goto: 'saveMemory',
    });
  }

  return new Command({
    update: {
      replyDrafts: [updatedDraft],
      postedReplies: [posted],
      currentReviewIndex: nextIndex,
    },
    goto: 'reviewReply',
  });
}
