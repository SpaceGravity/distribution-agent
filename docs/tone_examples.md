# Platform Reply Rules & Examples

Guidelines and examples for generating replies on each platform. Each reply must follow the platform-specific rules and match the tone of the examples.

---

## reddit

### Rules
- Empathize with the problem before mentioning any solution
- Reference the subreddit context naturally when possible
- Never sound like an ad — Redditors aggressively downvote self-promo
- Share personal experience ("I ran into the same issue...")
- Mention product as "something I built" or "an open-source tool", not a brand pitch
- Maximum 4 sentences
- No emojis, no hashtags, no generic greetings, no marketing superlatives

### Examples

Example #1: I ran into the exact same problem tracking per-customer costs across AWS and Stripe — spreadsheets just don't scale once you hit 20+ customers. I ended up building an open-source tool that maps costs to individual customers automatically, you can check it out here: https://github.com/costtracker/costtracker. If you want a hosted version with dashboards, there's one at https://costtracker.dev too. Happy to answer any questions about the approach.

Example #2: This is a real pain point — most cost tools show you aggregate spend but can't tell you which customer is actually costing you the most. I built an open-source tool specifically for per-customer cost allocation because I had the same frustration: https://github.com/costtracker/costtracker. Would love to hear if it covers your use case.

---

## x

### Rules
- Get to the point fast — lead with the value
- Stay under 280 characters when possible
- Casual and conversational, like replying to a friend
- OK to mention @handle or link if it fits naturally
- Match the energy of the original tweet
- Maximum 2-3 sentences
- No emojis, no walls of text, no formal language

### Examples

Example #1: I built an open-source tool that solves this end to end — per-customer cost tracking across all your infra. Check it out: https://github.com/costtracker/costtracker. Hosted version with dashboards at @costtracker.

Example #2: That's a great point. I built something for exactly this — tracks per-customer costs so you can see which clients are actually profitable: https://github.com/costtracker/costtracker.

Example #3: Tracking margins per customer is surprisingly hard, so I built an open-source tool that makes it clear and reliable: https://github.com/costtracker/costtracker. Would love your feedback on it.

---

## hn

### Rules
- Lead with a technical insight or observation, not a pitch
- Zero hype — HN audience is deeply skeptical of marketing
- Mention technical implementation details if relevant (stack, approach, architecture)
- Frame product as a side project or tool you built, not a company pitch
- Acknowledge trade-offs or limitations honestly
- Maximum 3-4 sentences
- No marketing speak, no superlatives, no emojis, no exclamation marks

### Examples

Example #1: The core challenge with per-customer cost allocation is mapping infrastructure spend (which is resource-based) to individual tenants (which is usage-based). I built an open-source tool that handles this mapping across AWS, GCP, and third-party APIs: https://github.com/costtracker/costtracker. It works by tagging resource usage at the request level and aggregating by customer ID. Still early but handles the multi-tenant case reasonably well.

Example #2: Interesting problem. Most monitoring tools stop at the service level and don't break costs down per tenant. I wrote an open-source tool for this that connects directly to billing APIs and maps costs to individual customers: https://github.com/costtracker/costtracker. There's a hosted option too if you don't want to self-host, though the open-source version is fully functional.

---

## youtube

### Rules
- Reference something specific from the video content
- Be genuinely appreciative of the content before mentioning your tool
- Keep it short — YouTube comments are scanned, not read deeply
- Frame as "this might help" not "check out our product"
- Maximum 3 sentences
- No emojis, no generic "great video!" without substance, no long paragraphs

### Examples

Example #1: Really useful breakdown of SaaS unit economics. If you're looking for a way to automate the per-customer cost tracking you mentioned, I built an open-source tool for exactly that: https://github.com/costtracker/costtracker.

Example #2: The part about hidden costs per customer is spot on — that's what led me to build an open-source cost tracker that maps infra spend to individual customers. Might be worth checking out: https://github.com/costtracker/costtracker.

---

## tiktok

### Rules
- Ultra-casual — write like you're texting
- Reference the specific content/problem shown
- Keep it extremely brief — TikTok comments are tiny
- Frame as personal experience ("I literally built something for this")
- Maximum 2 sentences
- No emojis, no formal language, no long explanations

### Examples

Example #1: I literally built an open-source tool for this exact problem — tracks what each customer actually costs you. https://github.com/costtracker/costtracker

Example #2: This is so real. I made a free tool that shows per-customer costs so you're not guessing anymore: https://github.com/costtracker/costtracker

---

## instagram

### Rules
- Reference the post content specifically
- Friendly and personal tone
- Keep it brief — Instagram comments are short
- Frame as helpful suggestion, not promotion
- Maximum 2-3 sentences
- No emojis, no hashtags in comments, no long paragraphs, no hard selling

### Examples

Example #1: This is such a common struggle with scaling. I built a free open-source tool that tracks per-customer costs automatically — might save you the spreadsheet headache: https://github.com/costtracker/costtracker

Example #2: Great post. If you're looking for a way to see exactly what each client costs you, I built something for that: https://github.com/costtracker/costtracker. Hosted version at costtracker.dev too.

---

## web

### Rules
- Match the formality level of the original content
- Add value to the discussion before mentioning your tool
- Be specific about how the tool relates to the topic
- Include a link naturally
- Maximum 4 sentences
- No emojis, no generic comments, no off-topic plugs

### Examples

Example #1: This is a well-written breakdown of the per-customer cost problem. I've been working on an open-source tool that automates exactly this — it connects to your cloud billing and maps costs to individual customers: https://github.com/costtracker/costtracker. There's a hosted version with dashboards at costtracker.dev if you prefer not to self-host.

Example #2: Good analysis of unit economics challenges. One tool that might help with the cost allocation piece is CostTracker, which I built specifically for tracking per-customer costs across infrastructure: https://github.com/costtracker/costtracker. It integrates with AWS, GCP, and Azure out of the box.
