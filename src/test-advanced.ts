// Advanced integration tests — covers reject-regenerate, SQLite resume, iteration counter
// Usage: pnpm tsx --env-file=.env src/test-advanced.ts

import { graph } from './index.js';
import { Command } from '@langchain/langgraph';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphResult = Record<string, any>;

const BUSINESS_FILE = resolve(
  import.meta.dirname ?? '.',
  '../docs/business.md'
);
const TONE_FILE = resolve(
  import.meta.dirname ?? '.',
  '../docs/tone_examples.md'
);

// Test tracking
const testResults: { name: string; passed: boolean; detail: string }[] = [];

function assert(name: string, condition: boolean, detail: string) {
  testResults.push({ name, passed: condition, detail });
  console.log(condition ? `  PASS: ${name}` : `  FAIL: ${name} — ${detail}`);
}

async function run() {
  const threadId = `test-adv-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  console.log('\n=== Advanced Integration Tests ===');
  console.log(`Thread: ${threadId}\n`);

  // --- Phase 1: Run full pipeline until first review interrupt ---
  console.log('--- Phase 1: Full pipeline (search + evaluate) ---');
  let result: GraphResult = await graph.invoke(
    {
      businessFilePath: BUSINESS_FILE,
      selectedPlatforms: ['reddit', 'x'],
      targetCount: 3, // small batch
      toneFilePath: TONE_FILE,
    },
    config
  );

  // Handle any non-review interrupts first (shouldn't happen with pre-populated input)
  let loopCount = 0;
  while (loopCount < 40) {
    loopCount++;

    if (!result.__interrupt__ || result.__interrupt__.length === 0) {
      break;
    }

    const interruptData = result.__interrupt__[0];
    const action = interruptData.value?.action ?? '';

    if (action.includes('Review this reply draft')) {
      break; // Stop here — we'll handle review interrupts in Phase 2
    }

    if (action.includes('maximum iterations')) {
      console.log('  Hit max iterations — providing guidance...');
      result = await graph.invoke(
        new Command({
          resume: {
            guidance:
              'Try "SaaS cost tracking per customer" and "cloud infrastructure cost allocation".',
          },
        }),
        config
      );
    } else if (action.includes('Provide input')) {
      result = await graph.invoke(
        new Command({
          resume: {
            businessFilePath: BUSINESS_FILE,
            selectedPlatforms: 'reddit,x',
            targetCount: '3',
            toneFilePath: TONE_FILE,
          },
        }),
        config
      );
    } else {
      result = await graph.invoke(new Command({ resume: 'continue' }), config);
    }
  }

  // Verify we reached review phase
  const atReview =
    result.__interrupt__?.[0]?.value?.action?.includes('Review this reply');
  assert(
    'Reached review phase',
    !!atReview,
    `Expected review interrupt, got: ${result.__interrupt__?.[0]?.value?.action}`
  );

  if (!atReview) {
    console.log('\nCannot continue — did not reach review phase.');
    printSummary();
    return;
  }

  // --- Phase 2: Test REJECT and REGENERATE ---
  console.log('\n--- Phase 2: Reject-and-regenerate test ---');
  const firstDraft = result.__interrupt__[0].value?.proposedReply ?? '';
  console.log(`  Original draft: "${firstDraft.substring(0, 80)}..."`);

  // Reject with specific feedback
  result = await graph.invoke(
    new Command({
      resume: {
        action: 'reject',
        feedback:
          'Too generic. Mention a specific feature of CostTracker like per-API-call cost tracking. Keep it shorter, 2 sentences max.',
      },
    }),
    config
  );

  // Should get another review interrupt with the regenerated draft
  const gotRegenerated =
    result.__interrupt__?.[0]?.value?.action?.includes('Review this reply');
  assert(
    'Got regenerated draft after reject',
    !!gotRegenerated,
    'Expected another review interrupt with regenerated draft'
  );

  if (gotRegenerated) {
    const regeneratedDraft = result.__interrupt__[0].value?.proposedReply ?? '';
    console.log(
      `  Regenerated draft: "${regeneratedDraft.substring(0, 80)}..."`
    );
    assert(
      'Regenerated draft is different from original',
      regeneratedDraft !== firstDraft,
      'Drafts should differ after regeneration with feedback'
    );
  }

  // --- Phase 3: Test SQLite RESUME (persistence) ---
  console.log('\n--- Phase 3: SQLite resume test ---');

  // Check state is persisted by getting it from the graph
  const savedState = await graph.getState(config);
  assert(
    'State persisted in SQLite',
    !!savedState && !!savedState.values,
    'getState should return saved values'
  );

  if (savedState?.values) {
    const vals = savedState.values as GraphResult;
    assert(
      'Business understanding persisted',
      !!vals.businessUnderstanding?.summary,
      `Got: ${vals.businessUnderstanding?.summary?.substring(0, 50) ?? 'null'}`
    );
    assert(
      'Search results persisted',
      (vals.searchResults?.length ?? 0) > 0,
      `Got ${vals.searchResults?.length ?? 0} results`
    );
    assert(
      'Reply drafts persisted',
      (vals.replyDrafts?.length ?? 0) > 0,
      `Got ${vals.replyDrafts?.length ?? 0} drafts`
    );
  }

  // Resume from the persisted state (approve the regenerated/current draft)
  console.log('  Resuming from SQLite checkpoint...');
  result = await graph.invoke(
    new Command({ resume: { action: 'approve' } }),
    config
  );

  assert(
    'Resumed successfully from SQLite',
    !!result,
    'Graph should continue after resume'
  );

  // --- Phase 4: Auto-approve remaining drafts ---
  console.log('\n--- Phase 4: Auto-approve remaining drafts ---');
  let approvedCount = 1; // Already approved one above

  while (true) {
    if (!result.__interrupt__ || result.__interrupt__.length === 0) {
      break;
    }

    const interruptData = result.__interrupt__[0];
    if (!interruptData.value?.action?.includes('Review this reply')) {
      break;
    }

    approvedCount++;
    console.log(`  Auto-approving draft ${approvedCount}...`);
    result = await graph.invoke(
      new Command({ resume: { action: 'approve' } }),
      config
    );
  }

  // --- Phase 5: Verify final state ---
  console.log('\n--- Phase 5: Final state verification ---');

  assert(
    'Graph completed (no pending interrupts)',
    !result.__interrupt__ || result.__interrupt__.length === 0,
    `Still has interrupts: ${result.__interrupt__?.length}`
  );

  assert(
    'iterationCount is a valid number',
    typeof result.iterationCount === 'number' && !isNaN(result.iterationCount),
    `Got: ${result.iterationCount} (type: ${typeof result.iterationCount})`
  );

  assert(
    'iterationCount >= 1',
    (result.iterationCount ?? 0) >= 1,
    `Got: ${result.iterationCount}`
  );

  assert(
    'Posted replies exist',
    (result.postedReplies?.length ?? 0) > 0,
    `Got ${result.postedReplies?.length ?? 0} posted replies`
  );

  assert(
    'All drafts were reviewed',
    approvedCount === (result.replyDrafts?.length ?? 0),
    `Approved ${approvedCount}, total drafts: ${result.replyDrafts?.length}`
  );

  // Check no obviously irrelevant results in posted replies
  if (result.postedReplies?.length > 0) {
    console.log('\n--- Posted Replies ---');
    for (const posted of result.postedReplies) {
      console.log(`  [${posted.platform}] ${posted.targetUrl}`);
      console.log(`  Reply: ${posted.replyText.substring(0, 120)}...`);
      console.log(`  Method: ${posted.method}\n`);
    }
  }

  // --- Phase 6: Verify SQLite final state ---
  console.log('--- Phase 6: Final SQLite state check ---');
  const finalState = await graph.getState(config);
  const finalVals = finalState?.values as GraphResult;
  assert(
    'Final state persisted in SQLite',
    !!finalVals,
    'getState should return final values'
  );
  assert(
    'Final posted replies match',
    finalVals?.postedReplies?.length === result.postedReplies?.length,
    `SQLite: ${finalVals?.postedReplies?.length}, result: ${result.postedReplies?.length}`
  );

  printSummary();
}

function printSummary() {
  console.log('\n========================================');
  console.log('         TEST RESULTS SUMMARY');
  console.log('========================================');
  const passed = testResults.filter((t) => t.passed).length;
  const failed = testResults.filter((t) => !t.passed).length;
  for (const t of testResults) {
    console.log(`  ${t.passed ? 'PASS' : 'FAIL'}: ${t.name}`);
    if (!t.passed) console.log(`        ${t.detail}`);
  }
  console.log(
    `\n  Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}`
  );
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
