// CSV writer — RFC 4180 compliant serialization
// No external library needed

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Escape a CSV field per RFC 4180.
 * Wraps in double-quotes if the field contains commas, quotes, or newlines.
 */
export function escapeCsvField(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Write rows to a CSV file with the given headers.
 */
export function writeCsv(
  headers: string[],
  rows: Record<string, string | number | null>[],
  filePath: string
): void {
  mkdirSync(dirname(filePath), { recursive: true });

  const headerLine = headers.map(escapeCsvField).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvField(row[h] ?? null)).join(',')
  );

  const content = [headerLine, ...dataLines].join('\n') + '\n';
  writeFileSync(filePath, content, 'utf-8');
}
