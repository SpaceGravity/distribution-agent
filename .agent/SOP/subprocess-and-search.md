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
