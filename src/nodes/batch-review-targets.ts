// batchReviewTargets node — Presents all targets for batch review
// User can approve all or reject specific targets (triggers backfill loop)

import { interrupt, Command } from '@langchain/langgraph';
import type { DistributionState, IdeaRejectionNote, IdeaTarget } from '../state.js';
import { CONFIG } from '../config.js';

/** Marks all pending targets as approved; leaves others unchanged. */
function approvePendingTargets(targets: IdeaTarget[]): IdeaTarget[] {
  return targets.map((t) =>
    t.status === 'pending' ? { ...t, status: 'approved' as const } : t
  );
}

export async function batchReviewTargets(
  state: DistributionState
): Promise<Command> {
  const cycle = state.ideaReviewCycle ?? 0;

  // Force-proceed after max review cycles
  if (cycle >= CONFIG.IDEA_MAX_REVIEW_CYCLES) {
    console.log(
      `[batchReviewTargets] Max review cycles (${CONFIG.IDEA_MAX_REVIEW_CYCLES}) reached. Proceeding to export.`
    );
    return new Command({
      update: { ideaTargets: approvePendingTargets(state.ideaTargets) },
      goto: 'saveMemory',
    });
  }

  // Present approved/pending targets for review
  const reviewableTargets = state.ideaTargets
    .filter((t) => t.status === 'approved' || t.status === 'pending')
    .map((t) => ({
      id: t.id,
      name: t.name,
      platform: t.platform,
      url: t.url,
      category: t.category,
      whyRelevant: t.whyRelevant,
      followerCount: t.followerCount,
    }));

  console.log(
    `[batchReviewTargets] Review cycle ${cycle + 1}/${CONFIG.IDEA_MAX_REVIEW_CYCLES}: presenting ${reviewableTargets.length} targets`
  );

  const userResponse = interrupt({
    action: 'Review discovered targets for idea validation',
    reviewCycle: `${cycle + 1} of ${CONFIG.IDEA_MAX_REVIEW_CYCLES}`,
    targets: reviewableTargets,
    instructions:
      'Respond with { "approved": true } to approve all, or { "rejections": [{ "id": "...", "reason": "..." }] } to reject specific targets.',
  });

  // Handle approval — type-narrow the interrupt response before accessing properties
  const response = typeof userResponse === 'object' && userResponse !== null
    ? (userResponse as Record<string, unknown>)
    : null;

  if (
    (response && response.approved === true) ||
    (typeof userResponse === 'string' &&
      userResponse.toLowerCase().trim() === 'approve')
  ) {
    console.log('[batchReviewTargets] All targets approved.');
    return new Command({
      update: { ideaTargets: approvePendingTargets(state.ideaTargets) },
      goto: 'saveMemory',
    });
  }

  // Handle rejections
  const rejections: Array<{ id: string; reason: string }> =
    (response && Array.isArray(response.rejections) ? response.rejections : []) as Array<{ id: string; reason: string }>;

  if (rejections.length === 0) {
    // No explicit rejections — treat as approval
    console.log(
      '[batchReviewTargets] No rejections specified. Approving all pending targets.'
    );
    return new Command({
      update: { ideaTargets: approvePendingTargets(state.ideaTargets) },
      goto: 'saveMemory',
    });
  }

  const rejectedIds = new Set(rejections.map((r) => r.id));

  // Build rejection notes
  const rejectionNotes: IdeaRejectionNote[] = rejections.map((r) => {
    const target = state.ideaTargets.find((t) => t.id === r.id);
    return {
      targetId: r.id,
      platform: target?.platform ?? 'unknown',
      name: target?.name ?? 'unknown',
      reason: r.reason,
      rejectedAt: new Date().toISOString(),
    };
  });

  // Remove rejected targets
  const updatedTargets = state.ideaTargets.filter((t) => !rejectedIds.has(t.id));

  // Calculate how many new targets the next search should find
  const targetCount = state.targetCount ?? CONFIG.DEFAULT_TARGET_COUNT;
  const remaining = updatedTargets.filter((t) => t.status === 'approved' || t.status === 'pending').length;
  const backfillCount = Math.max(0, targetCount - remaining);

  console.log(
    `[batchReviewTargets] ${rejections.length} targets rejected. Backfilling ${backfillCount} targets via generateIdeaCriteria.`
  );

  return new Command({
    update: {
      ideaTargets: updatedTargets,
      ideaRejectionNotes: rejectionNotes,
      ideaReviewCycle: cycle + 1,
      backfillCount,
    },
    goto: 'generateIdeaCriteria',
  });
}
