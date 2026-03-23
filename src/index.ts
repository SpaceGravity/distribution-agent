// Distribution Agent - Main graph definition
// Automates product outreach by searching platforms, evaluating results,
// generating reply drafts, and posting after user approval.

import { StateGraph, START, END } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { DistributionStateSchema } from './state.js';
import { CONFIG } from './config.js';

// Node imports — Business path
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

// Node imports — Idea path
import { understandIdea } from './nodes/understand-idea.js';
import { generateIdeaCriteria } from './nodes/generate-idea-criteria.js';
import { searchIdea } from './nodes/search-idea.js';
import { extractTargets } from './nodes/extract-targets.js';
import { enrichTargets } from './nodes/enrich-targets.js';
import { evaluateIdeaTargets } from './nodes/evaluate-idea-targets.js';
import { refineIdeaSearch } from './nodes/refine-idea-search.js';
import { askIdeaHelp } from './nodes/ask-idea-help.js';
import { batchReviewTargets } from './nodes/batch-review-targets.js';
import { exportCsv } from './nodes/export-csv.js';

// --- Graph construction ---
// SqliteSaver persists state to disk for full resume across process restarts

const checkpointer = SqliteSaver.fromConnString(CONFIG.DB_PATH);

export const graph = new StateGraph(DistributionStateSchema)
  // --- Business path nodes ---
  .addNode('getInput', getInput, {
    ends: ['understandBusiness', 'understandIdea'],
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

  // --- Idea path nodes ---
  .addNode('understandIdea', understandIdea)
  .addNode('generateIdeaCriteria', generateIdeaCriteria)
  .addNode('searchIdea', searchIdea)
  .addNode('extractTargets', extractTargets)
  .addNode('enrichTargets', enrichTargets)
  .addNode('evaluateIdeaTargets', evaluateIdeaTargets, {
    ends: ['enrichTargets', 'refineIdeaSearch', 'askIdeaHelp'],
  })
  .addNode('refineIdeaSearch', refineIdeaSearch)
  .addNode('askIdeaHelp', askIdeaHelp, { ends: ['refineIdeaSearch', 'enrichTargets'] })
  .addNode('batchReviewTargets', batchReviewTargets, {
    ends: ['saveMemory', 'generateIdeaCriteria'],
  })
  .addNode('exportCsv', exportCsv)

  // --- Business path edges ---
  .addEdge(START, 'getInput')
  .addEdge('understandBusiness', 'generateCriteria')
  .addEdge('generateCriteria', 'search')
  .addEdge('search', 'evaluate')
  .addEdge('refineSearch', 'search')
  .addEdge('generateReplies', 'reviewReply')
  .addEdge('saveMemory', END)

  // --- Idea path edges ---
  .addEdge('understandIdea', 'generateIdeaCriteria')
  .addEdge('generateIdeaCriteria', 'searchIdea')
  .addEdge('searchIdea', 'extractTargets')
  .addEdge('extractTargets', 'evaluateIdeaTargets')
  .addEdge('refineIdeaSearch', 'searchIdea')
  .addEdge('enrichTargets', 'exportCsv')
  .addEdge('exportCsv', 'batchReviewTargets')

  .compile({ checkpointer });

// Direct CLI execution guard
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n=== Distribution Agent ===\n');
  console.log('Run via LangGraph Studio: pnpm dev');
  console.log('Or invoke programmatically with graph.invoke(state, config)\n');
}
