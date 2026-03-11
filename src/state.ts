// State schema for the Distribution Agent
// All state definitions grouped together following project conventions

import z from 'zod';
import { registry } from '@langchain/langgraph/zod';

// === Sub-schemas ===

export const BusinessUnderstandingSchema = z.object({
  summary: z.string(),
  targetAudience: z.array(z.string()),
  valueProposition: z.string(),
  keyFeatures: z.array(z.string()),
  seedKeywords: z.array(z.string()),
  productLinks: z
    .object({
      website: z.string().optional(),
      github: z.string().optional(),
      social: z.string().optional(),
    })
    .optional(),
});

export type BusinessUnderstanding = z.infer<typeof BusinessUnderstandingSchema>;

export const SearchCriteriaSchema = z.object({
  keywords: z.array(z.string()),
  queries: z.array(z.string()),
  platformFilters: z.array(z.string()),
  depth: z.enum(['quick', 'default', 'deep']),
});

export type SearchCriteria = z.infer<typeof SearchCriteriaSchema>;

export const SearchResultItemSchema = z.object({
  id: z.string(),
  platform: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  author: z.string(),
  date: z.string().optional(),
  engagement: z.record(z.string(), z.any()).optional(),
  score: z.number(),
  relevanceReason: z.string().optional(),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const EvaluationRecordSchema = z.object({
  iteration: z.number(),
  criteria: SearchCriteriaSchema,
  resultCount: z.number(),
  topResultIds: z.array(z.string()),
  satisfactory: z.boolean(),
  reasoning: z.string(),
  suggestedRefinements: z.string().optional(),
});

export type EvaluationRecord = z.infer<typeof EvaluationRecordSchema>;

export const ReplyDraftSchema = z.object({
  targetId: z.string(),
  targetPlatform: z.string(),
  targetUrl: z.string(),
  targetTitle: z.string(),
  targetText: z.string(),
  draft: z.string(),
  status: z.enum([
    'pending',
    'approved',
    'rejected',
    'edited',
    'posted',
    'skipped',
  ]),
  userFeedback: z.string().optional(),
  editedDraft: z.string().optional(),
});

export type ReplyDraft = z.infer<typeof ReplyDraftSchema>;

export const TargetRejectionNoteSchema = z.object({
  targetId: z.string(),
  targetPlatform: z.string(),
  targetUrl: z.string(),
  targetTitle: z.string(),
  reason: z.string(),
  rejectedAt: z.string(),
});
export type TargetRejectionNote = z.infer<typeof TargetRejectionNoteSchema>;

// === Idea path sub-schemas ===

export const IdeaUnderstandingSchema = z.object({
  rawText: z.string(),
  problemHypothesis: z.string(),
  targetDemographic: z.array(z.string()),
  assumptions: z.array(z.string()),
  existingSolutions: z.array(z.string()),
  keywords: z.array(z.string()),
  validationGoals: z.array(z.string()),
});

export type IdeaUnderstanding = z.infer<typeof IdeaUnderstandingSchema>;

export const IdeaTargetSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.string(),
  url: z.string(),
  category: z.enum([
    'potential_customer',
    'domain_expert',
    'community_hub',
    'competitor_user',
  ]),
  whyRelevant: z.string(),
  followerCount: z.number().nullable(),
  sourcePostUrl: z.string(),
  sourcePostTitle: z.string(),
  outreachDraft: z.string(),
  outreachType: z.enum(['dm', 'post', 'comment']),
  status: z.enum(['pending', 'approved', 'rejected']),
  rejectionReason: z.string().nullable(),
});

export type IdeaTarget = z.infer<typeof IdeaTargetSchema>;

export const IdeaRejectionNoteSchema = z.object({
  targetId: z.string(),
  platform: z.string(),
  name: z.string(),
  reason: z.string(),
  rejectedAt: z.string(),
});

export type IdeaRejectionNote = z.infer<typeof IdeaRejectionNoteSchema>;

export const PostedReplySchema = z.object({
  targetId: z.string(),
  targetUrl: z.string(),
  platform: z.string(),
  replyText: z.string(),
  postedAt: z.string().optional(),
  postUrl: z.string().optional(),
  method: z.enum(['auto', 'manual']),
});

export type PostedReply = z.infer<typeof PostedReplySchema>;

// === Main State Schema ===

export const DistributionStateSchema = z.object({
  // Input
  businessFilePath: z.string().optional(),
  toneFilePath: z.string().optional(),
  selectedPlatforms: z
    .array(z.string())
    .register(registry, { default: () => [] }),
  targetCount: z.number().optional(),

  // Business understanding
  businessUnderstanding: BusinessUnderstandingSchema.optional(),
  toneExamples: z.string().optional(),
  platformToneMap: z.record(z.string(), z.string()).optional(),

  // Search
  searchCriteria: SearchCriteriaSchema.optional(),
  searchResults: z.array(SearchResultItemSchema).register(registry, {
    reducer: {
      fn: (left: SearchResultItem[], right: SearchResultItem[]) => {
        // Deduplicate by id, keep highest score
        const map = new Map<string, SearchResultItem>();
        for (const item of [...left, ...right]) {
          const existing = map.get(item.id);
          if (!existing || item.score > existing.score) {
            map.set(item.id, item);
          }
        }
        return Array.from(map.values());
      },
    },
    default: () => [],
  }),

  // Evaluation loop
  evaluationHistory: z.array(EvaluationRecordSchema).register(registry, {
    reducer: {
      fn: (left: EvaluationRecord[], right: EvaluationRecord[]) =>
        left.concat(right),
    },
    default: () => [],
  }),
  iterationCount: z.number().register(registry, { default: () => 0 }),
  searchSatisfactory: z.boolean().register(registry, { default: () => false }),

  // User help (after 5 failures)
  userGuidance: z.string().optional(),

  // Target rejection notes (feedback on unsuitable targets)
  targetRejectionNotes: z.array(TargetRejectionNoteSchema).register(registry, {
    reducer: {
      fn: (left: TargetRejectionNote[], right: TargetRejectionNote[]) =>
        left.concat(right),
    },
    default: () => [],
  }),

  // Approved targets for reply generation
  approvedTargets: z.array(SearchResultItemSchema).register(registry, {
    reducer: {
      fn: (left: SearchResultItem[], right: SearchResultItem[]) => {
        // Deduplicate by id, keep highest score (same as searchResults)
        const map = new Map<string, SearchResultItem>();
        for (const item of [...left, ...right]) {
          const existing = map.get(item.id);
          if (!existing || item.score > existing.score) {
            map.set(item.id, item);
          }
        }
        return Array.from(map.values());
      },
    },
    default: () => [],
  }),

  // Reply drafts
  replyDrafts: z.array(ReplyDraftSchema).register(registry, {
    reducer: {
      fn: (left: ReplyDraft[], right: ReplyDraft[]) => {
        // Upsert by targetId — newer entry wins
        const map = new Map<string, ReplyDraft>();
        for (const d of left) map.set(d.targetId, d);
        for (const d of right) map.set(d.targetId, d);
        return Array.from(map.values());
      },
    },
    default: () => [],
  }),
  currentReviewIndex: z.number().register(registry, { default: () => 0 }),

  // Posted replies
  postedReplies: z.array(PostedReplySchema).register(registry, {
    reducer: {
      fn: (left: PostedReply[], right: PostedReply[]) => left.concat(right),
    },
    default: () => [],
  }),

  // === Idea path fields ===
  mode: z.enum(['business', 'idea']).optional(),
  ideaFilePath: z.string().optional(),
  ideaUnderstanding: IdeaUnderstandingSchema.optional(),
  ideaTargets: z.array(IdeaTargetSchema).register(registry, {
    reducer: {
      fn: (left: IdeaTarget[], right: IdeaTarget[]) => {
        // Upsert by id — newer entry wins
        const map = new Map<string, IdeaTarget>();
        for (const t of left) map.set(t.id, t);
        for (const t of right) map.set(t.id, t);
        return Array.from(map.values());
      },
    },
    default: () => [],
  }),
  ideaRejectionNotes: z.array(IdeaRejectionNoteSchema).register(registry, {
    reducer: {
      fn: (left: IdeaRejectionNote[], right: IdeaRejectionNote[]) =>
        left.concat(right),
    },
    default: () => [],
  }),
  ideaReviewCycle: z.number().register(registry, { default: () => 0 }),
  ideaCommunityQueries: z.array(z.string()).optional(),
  csvOutputPath: z.string().optional(),
});

export type DistributionState = z.infer<typeof DistributionStateSchema>;
