# SOP: Subprocess Execution and Search Integration

## Running Python scripts from Node.js

Use `child_process.execFile` (not `exec`) for security — avoids shell injection:

```ts
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function runPythonScript(
  query: string,
  platforms: string[]
): Promise<Result[]> {
  const args = [
    SCRIPT_PATH,
    query,
    '--emit=json',
    `--search=${platforms.join(',')}`,
  ];

  const { stdout } = await execFileAsync('python3', args, {
    timeout: 5 * 60 * 1000, // 5 min
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });

  return JSON.parse(stdout);
}
```

## last30days integration

### Script location
```
~/.claude/skills/last30days/scripts/last30days.py
```

### Command format
```bash
python3 last30days.py "<query>" --emit=json --search=reddit,x,hn
```

### Flags
- `--emit=json` — output structured JSON instead of text
- `--search=<platforms>` — comma-separated platform list
- `--quick` — faster, lighter search
- `--deep` — more thorough search

### Output parsing
The script outputs JSON with platform-specific fields. Normalize to a unified schema:
```ts
interface SearchResultItem {
  id: string;        // SHA-256 hash of URL for deterministic dedup
  platform: string;
  title: string;
  text: string;
  url: string;
  author: string;
  date?: string;
  score: number;
}
```

Platform-specific fields like `subreddit`, `author_handle`, `channel_name` get merged into the unified fields.

## Query hygiene

### Rules for LLM-generated queries
The last30days.py script is NOT Google. Queries go directly to platform-native search APIs (Reddit, X, HN). These APIs:
- Treat `site:` operators as literal text (returns 0 results)
- Don't support boolean operators (`OR`, `AND`, exact-match quotes)
- Perform poorly on long complex queries

Both `criteriaGenerationPrompt` and `ideaCriteriaPrompt` include CRITICAL QUERY RULES that instruct the LLM to:
1. Never include `site:` operators (platform filtering is handled by `--search=` flag)
2. Keep queries under 8 words
3. Use plain natural language only
4. Focus on pain-point language real people would type

### `sanitizeQuery()` safety net
Prompts are suggestions, not guarantees. `search-runner.ts` exports `sanitizeQuery()` that runs before every search call:
```ts
function sanitizeQuery(query: string): string {
  return query
    .replace(/\s*(OR\s+)?site:\S+(\s+OR)?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
```
Strips `site:` patterns and cleans up leftover boolean artifacts. Logs a warning when it modifies a query.

### Per-platform isolation (idea path)
`searchIdea` runs **one subprocess per platform per query** instead of combining platforms in a single `--search=reddit,x` call. Rationale:
- When `--search=reddit,x` runs in one process, both platforms share the same global timeout
- If X is rate-limited (60s wait), it triggers the global 90s kill, discarding Reddit results too
- Per-platform isolation ensures a single platform failure doesn't kill results from others
- Uses `Promise.allSettled()` so partial failures are tolerated

### Quick depth for idea path
`searchIdea` forces `--quick` depth for content queries. Rationale:
- `default` depth enriches the top 5 posts with comment text (useful for business path reply generation)
- Enrichment takes 90s+ and triggers the script's global 180s timeout
- Even when Reddit finds 80-120 posts, the timeout discards ALL results
- Idea path only needs post metadata for target extraction, not full comment threads
- Community-discovery queries still use `default` depth since they run on `web` (no enrichment)

## Performance tips

### Cap query count
LLMs tend to generate too many search queries (10-20). Cap to 5 max:
```ts
const cappedQueries = queries.slice(0, 5);
```

Also instruct the LLM in the prompt: "Generate at most 5 queries."

### Sequential not parallel for subprocess calls
Each subprocess spawns a Python process. Running 5+ in parallel can overwhelm the system. Use sequential execution with progress logging:
```ts
for (const query of queries) {
  const results = await searchPlatforms(query, platforms);
  allResults.push(...results);
  console.log(`Query "${query.substring(0, 40)}..." returned ${results.length} results`);
}
```

### Graceful failure
Return empty array on subprocess failure rather than throwing — partial results are better than no results:
```ts
try {
  const { stdout } = await execFileAsync('python3', args, opts);
  return parseResults(stdout);
} catch (err) {
  console.warn(`Search failed for "${query}": ${err}`);
  return [];
}
```

## MCP server wrapper

For external reuse, wrap the Python skill in a standalone MCP server:
```
~/.claude/mcp-servers/last30days-mcp/
  src/index.ts        # McpServer with stdio transport
  src/tools/search.ts # Tool definition
  src/lib/runner.ts   # Python subprocess wrapper
```

Uses `@modelcontextprotocol/sdk` with `StdioServerTransport`.

## Related Documentation

- `.agent/Lessons/search-query-hygiene.md` — Root cause analysis and 5-part fix for `site:` operator and timeout issues
- `.agent/SOP/agent-architecture-patterns.md` — Dual search strategy pattern, `askIdeaHelp` escape hatch
- `.agent/System/architecture.md` — Search integration config, timeout constants
