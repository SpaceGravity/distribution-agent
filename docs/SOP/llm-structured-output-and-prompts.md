# SOP: LLM Structured Output and Prompt Engineering

## Structured output with Zod

```ts
import { ChatAnthropic } from '@langchain/anthropic';

const llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });

const OutputSchema = z.object({
  satisfactory: z.boolean(),
  reasoning: z.string(),
  suggestions: z.string().optional(),
});

const structuredLlm = llm.withStructuredOutput(OutputSchema);
const result = await structuredLlm.invoke(promptString);
// result is typed: { satisfactory: boolean, reasoning: string, suggestions?: string }
```

## Prompt template pattern

Keep prompts as pure functions in a dedicated `lib/prompts.ts`:
```ts
export function evaluationPrompt(
  business: BusinessUnderstanding,
  results: SearchResultItem[],
  history: EvaluationRecord[]
): string {
  return `You are evaluating search results...
<business_understanding>
Summary: ${business.summary}
</business_understanding>
...`;
}
```

Benefits:
- Easy to test prompts in isolation
- All prompts in one file for consistency review
- Functions receive typed state fields, not raw strings

## Prompt gotchas

### Make optional fields truly optional in the schema
If the LLM might not return a field, use `.optional()` in the Zod schema. Otherwise structured output will fail:
```ts
// BAD — LLM may not know result IDs
topResultIds: z.array(z.string()),

// GOOD
topResultIds: z.array(z.string()).optional(),
```
Then default in the consuming code: `decision.topResultIds ?? []`

### Include IDs in prompts if you want IDs back
If you ask the LLM to return `topResultIds`, you must include the IDs in the prompt data:
```ts
`${i + 1}. [${r.platform}] "${r.title}"
   ID: ${r.id}    // <-- LLM needs this to reference it
   URL: ${r.url}`
```

### Be explicit about constraints
LLMs over-generate unless constrained:
```
IMPORTANT: Generate at most 5 queries. Each query runs a separate search,
so fewer high-quality queries are better than many broad ones.
```

### Filtering irrelevant results
Keyword-based search returns noise. Add explicit filtering instructions:
```
CRITICAL: Exclude posts about completely unrelated topics that happen to
share keywords. A post is only relevant if someone is discussing a problem
the product directly addresses.
```

## Reply generation constraints

For human-sounding outreach replies:
```
<constraints>
- Directly relevant to the original post content
- Friendly and enthusiastic
- NO emojis whatsoever
- Maximum 4 sentences
- Human founder tone — must NOT feel AI-generated
- Explain specifically how the product could help
- Do not be generic or vague
</constraints>
```

### Tone matching with few-shot examples
Include user-provided examples as context:
```
<tone_examples>
Here are examples of the tone and style to match:
${toneExamples}
</tone_examples>
```

### Regeneration with feedback
When a user rejects a draft, include both the previous draft and feedback:
```
<previous_draft>
${previousDraft}
</previous_draft>

<user_feedback>
${userFeedback}
</user_feedback>

Rewrite the reply addressing the feedback.
```

## Injecting rejection context into prompts

When users reject targets (not just replies), record why and inject into future prompts:

### In criteriaGenerationPrompt — avoid similar search results
```ts
export function criteriaGenerationPrompt(
  business, evaluationHistory?, userGuidance?, targetRejectionNotes?
) {
  // ... existing prompt ...
  if (targetRejectionNotes?.length) {
    prompt += `
<target_rejection_history>
The user has previously rejected the following targets as unsuitable.
Adjust search criteria to avoid finding similar content.
${notes.map(n => `- [${n.targetPlatform}] "${n.targetTitle}" — Reason: ${n.reason}`).join('\n')}
</target_rejection_history>`;
  }
}
```

### In evaluationPrompt — exclude similar posts
```ts
export function evaluationPrompt(
  business, results, history, iteration, targetRejectionNotes?
) {
  // ... existing prompt ...
  if (targetRejectionNotes?.length) {
    prompt += `
<rejected_targets>
The user has previously rejected these targets as unsuitable.
Exclude similar posts from topResultIds.
${notes.map(n => `- [${n.targetPlatform}] "${n.targetTitle}" — Reason: ${n.reason}`).join('\n')}
</rejected_targets>`;
  }
}
```

This creates a feedback loop: target rejections influence both what gets searched for and what gets approved.
