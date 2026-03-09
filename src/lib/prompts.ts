// Prompt templates for the Distribution Agent
// Each function takes state fields and returns a formatted prompt string

import type {
  BusinessUnderstanding,
  SearchResultItem,
  EvaluationRecord,
  TargetRejectionNote,
} from '../state.js';

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
  targetRejectionNotes?: TargetRejectionNote[]
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

Focus on:
- Pain point language that potential customers would use
- Questions people ask when they need this type of solution
- Community-specific terminology
- Avoid generic terms that would return too much noise`;

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
  totalResultCount?: number
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
Maximum iterations: 5
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

Write your reply now. Output ONLY the reply text, nothing else.`;

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

Rewrite the reply addressing the feedback. Output ONLY the reply text, nothing else.`;

  return prompt;
}
