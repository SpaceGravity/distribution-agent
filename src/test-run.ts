// Integration test — runs the Distribution Agent end-to-end
// Usage: pnpm tsx --env-file=.env src/test-run.ts

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

async function run() {
  const threadId = `test-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  console.log('\n=== Distribution Agent Integration Test ===');
  console.log(`Thread: ${threadId}`);
  console.log(`Business file: ${BUSINESS_FILE}`);
  console.log(`Tone file: ${TONE_FILE}\n`);

  // Step 1: Invoke with initial state (skip getInput interrupt)
  console.log('--- Step 1: Starting graph with pre-populated input ---');
  let result: GraphResult = await graph.invoke(
    {
      businessFilePath: BUSINESS_FILE,
      selectedPlatforms: ['reddit', 'x'],
      targetCount: 5, // small batch for testing
      toneFilePath: TONE_FILE,
    },
    config
  );

  // Check for interrupts and handle them
  let loopCount = 0;
  const maxLoops = 30;

  while (loopCount < maxLoops) {
    loopCount++;

    // Check if graph completed
    if (!result.__interrupt__ || result.__interrupt__.length === 0) {
      console.log('\n--- Graph completed ---');
      break;
    }

    const interruptData = result.__interrupt__[0];
    console.log(`\n--- Interrupt ${loopCount} ---`);
    console.log('Action:', interruptData.value?.action ?? 'unknown');

    // Auto-handle interrupts for testing
    if (interruptData.value?.action?.includes('Review this reply draft')) {
      // Auto-approve all drafts for testing
      console.log('Auto-approving reply draft...');
      console.log(
        `Post: [${interruptData.value?.originalPost?.platform}] ${interruptData.value?.originalPost?.title?.substring(0, 50)}`
      );
      console.log(
        `Reply: ${interruptData.value?.proposedReply?.substring(0, 100)}...`
      );
      result = await graph.invoke(
        new Command({ resume: { action: 'approve' } }),
        config
      );
    } else if (interruptData.value?.action?.includes('maximum iterations')) {
      // Provide guidance after 5 failed search iterations
      console.log('Providing search guidance...');
      result = await graph.invoke(
        new Command({
          resume: {
            guidance:
              'Try searching for "per customer cost tracking" and "SaaS unit economics" on Reddit and X.',
          },
        }),
        config
      );
    } else if (interruptData.value?.action?.includes('Provide input')) {
      // Shouldn't happen since we pre-populated, but handle just in case
      console.log('Providing input...');
      result = await graph.invoke(
        new Command({
          resume: {
            businessFilePath: BUSINESS_FILE,
            selectedPlatforms: 'reddit,x',
            targetCount: '5',
            toneFilePath: TONE_FILE,
          },
        }),
        config
      );
    } else {
      console.log('Unknown interrupt, providing generic resume...');
      console.log(
        'Interrupt value:',
        JSON.stringify(interruptData.value, null, 2)
      );
      result = await graph.invoke(new Command({ resume: 'continue' }), config);
    }
  }

  // Print final state summary
  console.log('\n=== Final State Summary ===');
  console.log(
    `Business: ${result.businessUnderstanding?.summary?.substring(0, 100) ?? 'N/A'}`
  );
  console.log(`Search iterations: ${result.iterationCount}`);
  console.log(`Total results: ${result.searchResults?.length ?? 0}`);
  console.log(`Reply drafts: ${result.replyDrafts?.length ?? 0}`);
  console.log(`Posted replies: ${result.postedReplies?.length ?? 0}`);

  if (result.postedReplies?.length > 0) {
    console.log('\n--- Posted Replies ---');
    for (const posted of result.postedReplies) {
      console.log(`[${posted.platform}] ${posted.targetUrl}`);
      console.log(`Reply: ${posted.replyText.substring(0, 150)}`);
      console.log(`Method: ${posted.method}\n`);
    }
  }

  console.log('=== Test Complete ===\n');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
