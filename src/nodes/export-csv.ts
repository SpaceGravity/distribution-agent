// exportCsv node — Exports approved targets to CSV

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
  'status',
  'source_post_url',
  'source_post_title',
];

export async function exportCsv(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  // Export all candidate targets (non-rejected) — CSV is produced before user review
  const candidates = state.ideaTargets.filter(
    (t) => t.status === 'approved' || t.status === 'pending'
  );

  if (candidates.length === 0) {
    console.warn('[exportCsv] No candidate targets to export.');
    return {};
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const filePath = `${CONFIG.CSV_OUTPUT_DIR}/idea-targets-${timestamp}.csv`;

  const rows = candidates.map((t) => ({
    name: t.name,
    platform: t.platform,
    url: t.url,
    category: t.category,
    why_relevant: t.whyRelevant,
    follower_count: t.followerCount,
    status: t.status,
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
    `[exportCsv] Exported ${candidates.length} targets to ${filePath}`
  );

  return { csvOutputPath: filePath };
}
