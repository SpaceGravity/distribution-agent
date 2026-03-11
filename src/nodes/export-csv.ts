// exportCsv node — Exports approved targets with outreach drafts to CSV

import { resolve } from 'path';
import type { DistributionState } from '../state.js';
import { CONFIG } from '../config.js';
import { writeCsv } from '../lib/csv-writer.js';

const CSV_HEADERS = [
  'name',
  'platform',
  'url',
  'category',
  'why_relevant',
  'follower_count',
  'outreach_draft',
  'outreach_type',
  'source_post_url',
  'source_post_title',
];

export async function exportCsv(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  const approvedTargets = state.ideaTargets.filter(
    (t) => t.status === 'approved'
  );

  if (approvedTargets.length === 0) {
    console.warn('[exportCsv] No approved targets to export.');
    return {};
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const filePath = `${CONFIG.CSV_OUTPUT_DIR}/idea-targets-${timestamp}.csv`;

  const rows = approvedTargets.map((t) => ({
    name: t.name,
    platform: t.platform,
    url: t.url,
    category: t.category,
    why_relevant: t.whyRelevant,
    follower_count: t.followerCount,
    outreach_draft: t.outreachDraft,
    outreach_type: t.outreachType,
    source_post_url: t.sourcePostUrl,
    source_post_title: t.sourcePostTitle,
  }));

  // Validate output path is within project root
  const absFilePath = resolve(filePath);
  const projectRoot = resolve('.');
  if (!absFilePath.startsWith(projectRoot + '/') && absFilePath !== projectRoot) {
    throw new Error(`CSV output path outside project root: ${absFilePath}`);
  }

  try {
    writeCsv(CSV_HEADERS, rows, filePath);
  } catch (err) {
    throw new Error(`Failed to write CSV to ${filePath}: ${err instanceof Error ? err.message : err}`);
  }

  console.log(
    `[exportCsv] Exported ${approvedTargets.length} targets to ${filePath}`
  );

  return { csvOutputPath: filePath };
}
