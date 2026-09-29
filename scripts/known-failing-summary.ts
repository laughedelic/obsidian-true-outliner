/**
 * Renders the known-failing cases of a run as Markdown, for CI's step summary and for reading after
 * a local run.
 *
 *   node scripts/known-failing-summary.ts [e2e-summary.json] >> "$GITHUB_STEP_SUMMARY"
 *
 * The list is `knownFailing` in `.obsidian-cache/e2e-summary.json`, which the launcher's
 * `onComplete` writes (`e2e-tests/wdio.shared.mts`, `writeFailureSummary`). A run with none, and a
 * run that wrote no summary, print nothing, so a job that ran no case file adds no section.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { renderStepSummary, type KnownFailingEntry } from './known-failing.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The `knownFailing` list of a summary file's text; empty when the file holds none or is not JSON. */
export function entriesOf(summaryText: string): KnownFailingEntry[] {
  try {
    const summary = JSON.parse(summaryText) as { knownFailing?: KnownFailingEntry[] };
    return Array.isArray(summary.knownFailing) ? summary.knownFailing : [];
  } catch {
    return [];
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? path.join(root, '.obsidian-cache', 'e2e-summary.json');
  if (existsSync(file)) {
    process.stdout.write(renderStepSummary(entriesOf(readFileSync(file, 'utf-8')), process.env.GITHUB_REPOSITORY));
  }
}
