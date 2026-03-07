// Distribution Agent - Main graph definition
// Automates product outreach by searching platforms, evaluating results,
// generating reply drafts, and posting after user approval.

import { StateGraph, START, END } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { DistributionStateSchema } from './state.js';
import { CONFIG } from './config.js';

// Node imports
import { getInput } from './nodes/get-input.js';
import { understandBusiness } from './nodes/understand-business.js';
import { generateCriteria } from './nodes/generate-criteria.js';
import { search } from './nodes/search.js';
import { evaluate } from './nodes/evaluate.js';
import { refineSearch } from './nodes/refine-search.js';
import { askUserHelp } from './nodes/ask-user-help.js';
import { generateReplies } from './nodes/generate-replies.js';
import { reviewReply } from './nodes/review-reply.js';
import { postReply } from './nodes/post-reply.js';
import { saveMemory } from './nodes/save-memory.js';

// --- Graph construction ---
// SqliteSaver persists state to disk for full resume across process restarts

const checkpointer = SqliteSaver.fromConnString(CONFIG.DB_PATH);

export const graph = new StateGraph(DistributionStateSchema)
  // --- Nodes ---
  // Nodes returning Command need `ends` to declare possible destinations
  .addNode('getInput', getInput, {
    ends: ['understandBusiness'],
  })
  .addNode('understandBusiness', understandBusiness)
  .addNode('generateCriteria', generateCriteria)
  .addNode('search', search)
  .addNode('evaluate', evaluate, {
    ends: ['generateReplies', 'refineSearch', 'askUserHelp'],
  })
  .addNode('refineSearch', refineSearch)
  .addNode('askUserHelp', askUserHelp, {
    ends: ['refineSearch'],
  })
  .addNode('generateReplies', generateReplies)
  .addNode('reviewReply', reviewReply, {
    ends: ['postReply', 'reviewReply', 'saveMemory'],
  })
  .addNode('postReply', postReply, {
    ends: ['reviewReply', 'saveMemory'],
  })
  .addNode('saveMemory', saveMemory)

  // --- Edges ---
  // Static edges for the linear path; conditional routing handled by Command in nodes
  .addEdge(START, 'getInput')
  .addEdge('understandBusiness', 'generateCriteria')
  .addEdge('generateCriteria', 'search')
  .addEdge('search', 'evaluate')
  .addEdge('refineSearch', 'search')
  .addEdge('generateReplies', 'reviewReply')
  .addEdge('saveMemory', END)

  .compile({ checkpointer });

// Direct CLI execution guard
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n=== Distribution Agent ===\n');
  console.log('Run via LangGraph Studio: pnpm dev');
  console.log('Or invoke programmatically with graph.invoke(state, config)\n');
}
