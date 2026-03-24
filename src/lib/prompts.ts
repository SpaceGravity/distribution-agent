// Prompt templates for the Distribution Agent
// Each function takes state fields and returns a formatted prompt string

import type {
  BusinessUnderstanding,
  SearchResultItem,
  EvaluationRecord,
  TargetRejectionNote,
  IdeaUnderstanding,
  IdeaTarget,
  IdeaRejectionNote,
} from '../state.js';
import type { CrossSessionMemory } from './memory.js';

/**
 * Formats cross-session memory as XML blocks for prompt injection.
 * Returns empty string when no data — no prompt bloat on first run.
 */
function formatCrossSessionBlock(memory: CrossSessionMemory): string {
  let block = '';

  if (memory.rejectionPatterns.length > 0) {
    block += `

<cross_session_rejection_patterns>
The user has established these rejection patterns across previous sessions. Apply them to avoid wasting time on targets the user consistently rejects.

${memory.rejectionPatterns
  .map(
    (p) =>
      `- [strength: ${p.strength}/10] ${p.rule} (platforms: ${p.platforms.join(', ')})`
  )
  .join('\n')}
</cross_session_rejection_patterns>`;
  }

  if (memory.recentStrategies.length > 0) {
    block += `

<cross_session_successful_strategies>
These search strategies worked well in previous sessions (sorted by approval rate). Use them as reference for effective keywords and query patterns.

${memory.recentStrategies
  .map(
    (s) =>
      `- "${s.productOrIdea}" — approval: ${Math.round(s.approvalRate * 100)}%, keywords: ${s.keywords.slice(0, 5).join(', ')}, queries: ${s.queries.slice(0, 3).join('; ')}`
  )
  .join('\n')}
</cross_session_successful_strategies>`;
  }

  return block;
}

/**
 * Prompt for analyzing a business description file and extracting
 * structured information (summary, audience, keywords, etc.).
 */
export function businessUnderstandingPrompt(
  businessFileContent: string
): string {
  return `You are an expert business analyst. Read the following business description and extract structured information from it.

<business_description>
${businessFileContent}
</business_description>

Extract the following information:

1. **summary** - A concise 2-3 sentence summary of what this business/product does.
2. **targetAudience** - A list of specific audience segments who would benefit from this product.
3. **valueProposition** - The core value proposition in one sentence.
4. **keyFeatures** - A list of the product's key features or capabilities.
5. **seedKeywords** - A list of 5-10 search keywords/phrases that potential customers might use when discussing problems this product solves. Focus on pain points and use cases, not the product name itself.
6. **productLinks** - Any URLs mentioned (website, github, social media).

Return your analysis as structured JSON matching this schema:
{
  "summary": string,
  "targetAudience": string[],
  "valueProposition": string,
  "keyFeatures": string[],
  "seedKeywords": string[],
  "productLinks": { "website"?: string, "github"?: string, "social"?: string }
}`;
}

/**
 * Prompt for generating search criteria based on business understanding.
 * Incorporates evaluation history and user guidance for iterative refinement.
 */
export function criteriaGenerationPrompt(
  businessSummary: BusinessUnderstanding,
  evaluationHistory?: EvaluationRecord[],
  userGuidance?: string,
  targetRejectionNotes?: TargetRejectionNote[],
  crossSessionMemory?: CrossSessionMemory
): string {
  let prompt = `You are a growth marketing expert. Generate search criteria to find potential customers for a product on social media and community platforms.

<business_understanding>
Summary: ${businessSummary.summary}
Target Audience: ${businessSummary.targetAudience.join(', ')}
Value Proposition: ${businessSummary.valueProposition}
Key Features: ${businessSummary.keyFeatures.join(', ')}
Seed Keywords: ${businessSummary.seedKeywords.join(', ')}
</business_understanding>`;

  // Include evaluation history so the LLM can learn from past attempts
  if (evaluationHistory && evaluationHistory.length > 0) {
    prompt += `

<evaluation_history>
The following past search attempts have been made. Learn from what worked and what did not.

${evaluationHistory
  .map(
    (record) => `Iteration ${record.iteration}:
  - Criteria keywords: ${record.criteria.keywords.join(', ')}
  - Queries used: ${record.criteria.queries.join('; ')}
  - Results found: ${record.resultCount}
  - Satisfactory: ${record.satisfactory ? 'Yes' : 'No'}
  - Reasoning: ${record.reasoning}
  - Suggested refinements: ${record.suggestedRefinements ?? 'None'}`
  )
  .join('\n\n')}
</evaluation_history>`;
  }

  // Incorporate user guidance if provided
  if (userGuidance) {
    prompt += `

<user_guidance>
The user has provided the following guidance to help refine the search:
${userGuidance}
</user_guidance>`;
  }

  // Include target rejection history so the LLM avoids similar content
  if (targetRejectionNotes && targetRejectionNotes.length > 0) {
    prompt += `

<target_rejection_history>
The user has previously rejected the following targets as unsuitable. Adjust search criteria to avoid finding similar content.

${targetRejectionNotes
  .map(
    (note) => `- [${note.targetPlatform}] "${note.targetTitle}" — Reason: ${note.reason}`
  )
  .join('\n')}
</target_rejection_history>`;
  }

  if (crossSessionMemory) {
    prompt += formatCrossSessionBlock(crossSessionMemory);
  }

  prompt += `

Generate search criteria that will find posts, comments, and threads where potential customers are discussing problems this product solves.

Return your criteria as structured JSON matching this schema:
{
  "keywords": string[],       // 5-10 individual keywords to search for
  "queries": string[],        // 3-5 full search query strings (combine keywords naturally). Keep this list SHORT and focused.
  "platformFilters": string[], // Platform-specific subreddits, hashtags, or communities to target
  "depth": "quick" | "default" | "deep"  // Recommended search depth
}

IMPORTANT: Generate at most 5 queries. Each query runs a separate search, so fewer high-quality queries are better than many broad ones.

Each query MUST target a DIFFERENT search angle to maximize coverage:
- Problem-focused: How people describe the pain point in their own words
- Solution-seeking: People actively looking for tools or solutions
- Comparison: People comparing alternatives or asking "X vs Y"
- Community: People asking where to find help or relevant communities
- Frustration: People expressing frustration with current tools or workarounds

CRITICAL QUERY RULES:
- NEVER include "site:" operators (e.g., site:reddit.com). Platform filtering is handled separately by the system.
- Keep each query SHORT — under 8 words. Reddit and X have basic search engines.
- Do NOT use boolean operators like OR, AND, or exact-match quotes. Use plain natural language.
- Focus on pain-point language that real people would type into a search bar.
- Avoid generic terms that would return too much noise.`;

  return prompt;
}

/**
 * Prompt for evaluating search results for product-market fit.
 * Includes business context, results, and iteration history.
 */
export function evaluationPrompt(
  businessUnderstanding: BusinessUnderstanding,
  results: SearchResultItem[],
  evaluationHistory: EvaluationRecord[],
  iterationCount: number,
  targetRejectionNotes?: TargetRejectionNote[],
  totalResultCount?: number,
  crossSessionMemory?: CrossSessionMemory
): string {
  let prompt = `You are evaluating search results for product-market fit. Your job is to determine whether the collected results contain enough high-quality opportunities for product outreach.

<business_understanding>
Summary: ${businessUnderstanding.summary}
Target Audience: ${businessUnderstanding.targetAudience.join(', ')}
Value Proposition: ${businessUnderstanding.valueProposition}
Key Features: ${businessUnderstanding.keyFeatures.join(', ')}
</business_understanding>

<search_results>
Total results: ${totalResultCount ?? results.length}
Top ${results.length} results by score:

${results
  .map(
    (r, i) => `${i + 1}. [${r.platform}] "${r.title}" (score: ${r.score})
   ID: ${r.id}
   URL: ${r.url}
   Author: ${r.author}
   Date: ${r.date ?? 'unknown'}
   Text: ${r.text.slice(0, 200)}${r.text.length > 200 ? '...' : ''}
   Relevance: ${r.relevanceReason ?? 'not scored'}`
  )
  .join('\n\n')}
</search_results>

<iteration_info>
Current iteration: ${iterationCount}
Maximum iterations: 3
</iteration_info>`;

  // Include evaluation history
  if (evaluationHistory.length > 0) {
    prompt += `

<evaluation_history>
${evaluationHistory
  .map(
    (record) => `Iteration ${record.iteration}:
  - Results found: ${record.resultCount}
  - Satisfactory: ${record.satisfactory ? 'Yes' : 'No'}
  - Reasoning: ${record.reasoning}
  - Suggested refinements: ${record.suggestedRefinements ?? 'None'}`
  )
  .join('\n\n')}
</evaluation_history>`;
  }

  // Include rejected targets so the LLM excludes similar posts
  if (targetRejectionNotes && targetRejectionNotes.length > 0) {
    prompt += `

<rejected_targets>
The user has previously rejected these targets as unsuitable. Exclude similar posts from topResultIds.

${targetRejectionNotes
  .map(
    (note) => `- [${note.targetPlatform}] "${note.targetTitle}" — Reason: ${note.reason}`
  )
  .join('\n')}
</rejected_targets>`;
  }

  if (crossSessionMemory) {
    prompt += formatCrossSessionBlock(crossSessionMemory);
  }

  prompt += `

Evaluate these results using the following criteria:
1. **Relevance** - Are the posts genuinely related to problems this product solves? CRITICAL: Exclude posts about completely unrelated topics that happen to share keywords (e.g., personal finance posts, lifestyle content, unrelated industries). A post is only relevant if someone is discussing a problem the product directly addresses.
2. **Recency** - Are the posts from within the last 30 days?
3. **Engagement** - Do the posts have enough engagement to warrant a reply?
4. **Platform diversity** - Is there a good spread across different platforms?
5. **Reply opportunity** - Would a product reply feel natural and helpful (not spammy)?

You MUST also identify the IDs of ONLY the truly relevant results where a reply would be appropriate. Be strict — only include posts where mentioning the product would genuinely help the poster.

Return your evaluation as structured JSON matching this schema:
{
  "satisfactory": boolean,    // true if results are good enough for outreach
  "reasoning": string,        // Explain why the results are or are not satisfactory
  "suggestedRefinements": string,  // If not satisfactory, what specific changes to search criteria would help
  "topResultIds": string[]    // IDs of ONLY the relevant results suitable for outreach (exclude irrelevant ones)
}`;

  return prompt;
}

/**
 * Prompt for generating a reply to a specific social media post.
 * Enforces human founder tone with platform-specific rules and examples.
 */
export function replyGenerationPrompt(
  target: SearchResultItem,
  businessUnderstanding: BusinessUnderstanding,
  toneExamples?: string,
  platformToneMap?: Record<string, string>
): string {
  const platformRules = platformToneMap?.[target.platform];

  let prompt = `You are a startup founder writing a reply to a social media post. Your goal is to genuinely help this person while mentioning your product as a potential solution.

<constraints>
- Your reply MUST be directly relevant to the original post content
- NO emojis whatsoever
- Write in a natural human founder tone -- it must NOT feel AI-generated
- Explain specifically how the product could help with their stated problem
- Do not be generic or vague
- Do not start with "Hey!" or similar generic greetings unless it fits naturally
</constraints>

<original_post>
Platform: ${target.platform}
Title: ${target.title}
Content: ${target.text}
Author: ${target.author}
URL: ${target.url}
</original_post>

<your_product>
Summary: ${businessUnderstanding.summary}
Value Proposition: ${businessUnderstanding.valueProposition}
Key Features: ${businessUnderstanding.keyFeatures.join(', ')}${businessUnderstanding.productLinks?.website ? `\nWebsite: ${businessUnderstanding.productLinks.website}` : ''}${businessUnderstanding.productLinks?.github ? `\nGitHub: ${businessUnderstanding.productLinks.github}` : ''}
</your_product>`;

  // Include platform-specific rules + examples if available
  if (platformRules) {
    prompt += `

<platform_rules_and_examples>
Follow these rules and match the tone of these examples for ${target.platform}:
${platformRules}
</platform_rules_and_examples>`;
  } else if (toneExamples) {
    // Fall back to generic tone examples if platform not found
    prompt += `

<tone_examples>
Here are examples of the tone and style to match:
${toneExamples}
</tone_examples>

<fallback_constraints>
- Maximum 4 sentences (use fewer if the point is clear)
- Be friendly and enthusiastic
</fallback_constraints>`;
  }

  prompt += `

Write your reply now. Output ONLY the reply text in plain text. No markdown, no bullet points, no formatting.`;

  return prompt;
}

/**
 * Prompt for regenerating a reply based on user feedback.
 * Includes the previous draft and the reason it was rejected.
 */
export function replyRegenerationPrompt(
  target: SearchResultItem,
  previousDraft: string,
  userFeedback: string,
  businessUnderstanding: BusinessUnderstanding,
  toneExamples?: string,
  platformToneMap?: Record<string, string>
): string {
  const platformRules = platformToneMap?.[target.platform];

  let prompt = `You are a startup founder rewriting a reply to a social media post. Your previous draft was rejected and you need to improve it based on the feedback.

<constraints>
- Your reply MUST be directly relevant to the original post content
- NO emojis whatsoever
- Write in a natural human founder tone -- it must NOT feel AI-generated
- Explain specifically how the product could help with their stated problem
- Do not be generic or vague
- Do not start with "Hey!" or similar generic greetings unless it fits naturally
</constraints>

<original_post>
Platform: ${target.platform}
Title: ${target.title}
Content: ${target.text}
Author: ${target.author}
URL: ${target.url}
</original_post>

<your_product>
Summary: ${businessUnderstanding.summary}
Value Proposition: ${businessUnderstanding.valueProposition}
Key Features: ${businessUnderstanding.keyFeatures.join(', ')}${businessUnderstanding.productLinks?.website ? `\nWebsite: ${businessUnderstanding.productLinks.website}` : ''}${businessUnderstanding.productLinks?.github ? `\nGitHub: ${businessUnderstanding.productLinks.github}` : ''}
</your_product>

<previous_draft>
${previousDraft}
</previous_draft>

<user_feedback>
${userFeedback}
</user_feedback>`;

  // Include platform-specific rules + examples if available
  if (platformRules) {
    prompt += `

<platform_rules_and_examples>
Follow these rules and match the tone of these examples for ${target.platform}:
${platformRules}
</platform_rules_and_examples>`;
  } else if (toneExamples) {
    // Fall back to generic tone examples if platform not found
    prompt += `

<tone_examples>
Here are examples of the tone and style to match:
${toneExamples}
</tone_examples>

<fallback_constraints>
- Maximum 4 sentences (use fewer if the point is clear)
- Be friendly and enthusiastic
</fallback_constraints>`;
  }

  prompt += `

Rewrite the reply addressing the feedback. Output ONLY the reply text in plain text. No markdown, no bullet points, no formatting.`;

  return prompt;
}

// === Idea path prompts ===

/**
 * Prompt for analyzing an idea file and extracting structured understanding.
 * Adapts flexibly to one-liner or detailed hypothesis.
 */
export function ideaUnderstandingPrompt(fileContent: string): string {
  return `You are an expert at idea validation and customer discovery. Read the following idea description and extract structured information from it. The input may range from a single sentence to a detailed hypothesis document — adapt your extraction accordingly.

<idea_description>
${fileContent}
</idea_description>

Extract the following information (infer what you can, leave empty arrays where the input provides no signal):

1. **rawText** - The original text verbatim.
2. **problemHypothesis** - A clear, concise statement of the problem being hypothesized. If the input is vague, sharpen it into a testable hypothesis.
3. **targetDemographic** - Who experiences this problem? Be specific (e.g., "solo founders building SaaS", not just "entrepreneurs").
4. **assumptions** - What assumptions does this idea rest on? List them explicitly.
5. **existingSolutions** - What existing solutions or workarounds might people currently use?
6. **keywords** - 5-10 search keywords/phrases that people experiencing this problem would use online.
7. **validationGoals** - What would prove or disprove this hypothesis? (e.g., "Find 10 people who report spending >2 hours/week on this task").

Return your analysis as structured JSON matching this schema:
{
  "rawText": string,
  "problemHypothesis": string,
  "targetDemographic": string[],
  "assumptions": string[],
  "existingSolutions": string[],
  "keywords": string[],
  "validationGoals": string[]
}`;
}

/**
 * Prompt for generating content + community-discovery search queries
 * from idea understanding.
 */
export function ideaCriteriaPrompt(
  ideaUnderstanding: IdeaUnderstanding,
  rejectionNotes?: IdeaRejectionNote[],
  evaluationHistory?: EvaluationRecord[],
  userGuidance?: string,
  selectedPlatforms?: string[],
  backfillCount?: number,
  crossSessionMemory?: CrossSessionMemory
): string {
  let prompt = `You are an expert at customer discovery and community research. Generate search queries to find people and communities related to a problem hypothesis.

<idea_understanding>
Problem Hypothesis: ${ideaUnderstanding.problemHypothesis}
Target Demographic: ${ideaUnderstanding.targetDemographic.join(', ')}
Assumptions: ${ideaUnderstanding.assumptions.join('; ')}
Existing Solutions: ${ideaUnderstanding.existingSolutions.join(', ')}
Keywords: ${ideaUnderstanding.keywords.join(', ')}
Validation Goals: ${ideaUnderstanding.validationGoals.join('; ')}
</idea_understanding>`;

  if (selectedPlatforms && selectedPlatforms.length > 0) {
    prompt += `

<selected_platforms>${selectedPlatforms.join(', ')}</selected_platforms>`;
  }

  if (evaluationHistory && evaluationHistory.length > 0) {
    prompt += `

<evaluation_history>
${evaluationHistory
  .map(
    (record) => `Iteration ${record.iteration}:
  - Queries used: ${record.criteria.queries.join('; ')}
  - Results found: ${record.resultCount}
  - Satisfactory: ${record.satisfactory ? 'Yes' : 'No'}
  - Reasoning: ${record.reasoning}
  - Suggested refinements: ${record.suggestedRefinements ?? 'None'}`
  )
  .join('\n\n')}
</evaluation_history>`;
  }

  if (userGuidance) {
    prompt += `

<user_guidance>
The user has provided the following guidance to help refine the search:
${userGuidance}
</user_guidance>`;
  }

  if (rejectionNotes && rejectionNotes.length > 0) {
    prompt += `

<rejection_history>
The user rejected these targets. Adjust queries to avoid similar results.

${rejectionNotes
  .map((note) => `- [${note.platform}] "${note.name}" — Reason: ${note.reason}`)
  .join('\n')}
</rejection_history>`;
  }

  if (backfillCount && backfillCount > 0) {
    prompt += `

<backfill_target>
We need approximately ${backfillCount} more targets to reach the desired count. Focus queries on finding new, diverse targets that differ from previously found ones.
</backfill_target>`;
  }

  if (crossSessionMemory) {
    prompt += formatCrossSessionBlock(crossSessionMemory);
  }

  prompt += `

Generate TWO types of search queries:

1. **Content queries** (max 5): Find posts/threads by people discussing the pain point. Use the language and terminology real people would use when describing this problem.

2. **Community-discovery queries** (max 3): Meta-queries to find communities on the user's SELECTED PLATFORMS (see <selected_platforms> above). For reddit → "best subreddits for X". For x → "top Twitter/X accounts for X". Do NOT generate community queries for platforms the user did not select.

Return as structured JSON:
{
  "searchCriteria": {
    "keywords": string[],
    "queries": string[],
    "platformFilters": string[],
    "depth": "quick" | "default" | "deep"
  },
  "communityQueries": string[]
}

CRITICAL QUERY RULES:
- NEVER include "site:" operators (e.g., site:reddit.com). Platform filtering is handled separately by the system — adding site: operators breaks the search and returns 0 results.
- Keep each query SHORT — under 8 words. Reddit and X have basic search. Long complex queries return nothing.
- Do NOT use boolean operators like OR, AND, or exact-match quotes ("..."). Just use plain natural language.
- Write queries like a real person would type into a search bar: "LLM cost tracking per customer" not "("LLM costs" OR "OpenAI bill") ("per customer" OR "per user") site:reddit.com".
- Content queries: max 5. Focus on pain-point language.
- Community queries: max 3. These run on web only.`;

  return prompt;
}

/**
 * Prompt for extracting people and communities from search results.
 */
export function extractTargetsPrompt(
  results: SearchResultItem[],
  ideaUnderstanding: IdeaUnderstanding,
  selectedPlatforms?: string[]
): string {
  const platformFilter = selectedPlatforms && selectedPlatforms.length > 0
    ? `\n\nIMPORTANT: ONLY extract targets on these platforms: ${selectedPlatforms.join(', ')}. Discard targets on other platforms (Discord, Slack, web blogs, etc.). Return platform names in exact lowercase: ${selectedPlatforms.join(', ')}.`
    : '';

  return `You are an expert at identifying potential validation targets from search results. Extract people and communities who are relevant to testing a problem hypothesis.${platformFilter}

<idea_understanding>
Problem Hypothesis: ${ideaUnderstanding.problemHypothesis}
Target Demographic: ${ideaUnderstanding.targetDemographic.join(', ')}
</idea_understanding>

<search_results>
${results
  .map(
    (r, i) => `${i + 1}. [${r.platform}] "${r.title}"
   URL: ${r.url}
   Author: ${r.author}
   Text: ${(r.text ?? '').slice(0, 300)}${(r.text ?? '').length > 300 ? '...' : ''}
   Relevance: ${r.relevanceReason ?? 'not scored'}`
  )
  .join('\n\n')}
</search_results>

For each result, extract:
- **Person targets**: The author of the post (if they appear to experience the problem or have relevant expertise). Use their handle/username as the name.
- **Community targets**: The subreddit, forum, or community where the post appeared (if it's a relevant community hub).
- **From web articles about communities**: Extract the community names and URLs mentioned in the article. Set the platform to the TARGET's actual platform (e.g., "reddit" for subreddits, "x" for Twitter/X accounts), NOT "web".

Assign each target a category:
- \`potential_customer\` — Someone who appears to experience the problem
- \`domain_expert\` — Someone with expertise in the problem domain
- \`community_hub\` — A community (subreddit, forum, Discord) focused on the problem area
- \`competitor_user\` — Someone using an existing solution that addresses this problem

Deduplicate: don't include the same person or community twice.

Return as structured JSON:
{
  "targets": [
    {
      "name": string,           // handle, username, or community name
      "platform": string,       // The target's actual platform: reddit, x, hn, web — use the target's platform, not the source article's
      "url": string,            // profile URL or community URL
      "category": "potential_customer" | "domain_expert" | "community_hub" | "competitor_user",
      "whyRelevant": string,    // One sentence explaining why this target is relevant
      "sourcePostUrl": string,  // URL of the post where this target was found
      "sourcePostTitle": string // Title of the source post
    }
  ]
}

Be selective — only include targets that are genuinely relevant to the problem hypothesis. Quality over quantity.

Aim for a balanced category mix when possible:
- ~40% potential_customer (people experiencing the problem)
- ~25% community_hub (relevant communities and forums)
- ~20% domain_expert (people with expertise in the problem area)
- ~15% competitor_user (people using existing solutions)`;
}

/**
 * Prompt for evaluating idea targets against the idea understanding.
 */
export function evaluateIdeaTargetsPrompt(
  targets: IdeaTarget[],
  ideaUnderstanding: IdeaUnderstanding,
  rejectionNotes?: IdeaRejectionNote[],
  crossSessionMemory?: CrossSessionMemory
): string {
  let prompt = `You are evaluating discovered targets for idea validation quality. Determine whether the targets represent a good set of people and communities to validate the problem hypothesis.

<idea_understanding>
Problem Hypothesis: ${ideaUnderstanding.problemHypothesis}
Target Demographic: ${ideaUnderstanding.targetDemographic.join(', ')}
Validation Goals: ${ideaUnderstanding.validationGoals.join('; ')}
</idea_understanding>

<discovered_targets>
${targets
  .map(
    (t, i) => `${i + 1}. [${t.platform}] ${t.name} (${t.category})
   URL: ${t.url}
   Why relevant: ${t.whyRelevant}`
  )
  .join('\n\n')}
</discovered_targets>`;

  if (rejectionNotes && rejectionNotes.length > 0) {
    prompt += `

<rejection_history>
Previously rejected targets (avoid similar ones):
${rejectionNotes
  .map((note) => `- [${note.platform}] "${note.name}" — ${note.reason}`)
  .join('\n')}
</rejection_history>`;
  }

  if (crossSessionMemory) {
    prompt += formatCrossSessionBlock(crossSessionMemory);
  }

  prompt += `

Evaluate these targets on:
1. **Audience match** — Do these people/communities represent the target demographic?
2. **Category diversity** — Is there a mix of potential customers, experts, and communities?
3. **Platform spread** — Are targets spread across multiple platforms?
4. **Validation potential** — Can reaching out to these targets help validate the hypothesis?

Return as structured JSON:
{
  "satisfactory": boolean,
  "reasoning": string,
  "approvedTargetIds": string[],
  "rejectedTargetIds": string[],
  "suggestedRefinements": string
}

approvedTargetIds: IDs of targets that pass evaluation and are worth reaching out to.
rejectedTargetIds: IDs of targets that should be excluded (poor match, irrelevant, low quality).

Decision guidelines:
- Mark satisfactory=true if there are at least 3 approved targets with reasonable audience match.
- Approve any target that is plausibly relevant — perfection is not required for validation outreach.
- Only reject targets that are clearly irrelevant (wrong domain, spam, unrelated topic).
- Prefer approving borderline targets over looping for more searches — real conversations beat perfect targeting.`;

  return prompt;
}
