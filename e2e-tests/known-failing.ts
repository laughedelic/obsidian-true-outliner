/**
 * Where a `known-failing` case that still fails leaves its record. A worker appends one line per
 * case to its own file, as the ambient monitors do (`./monitors.ts`), and the launcher's
 * `writeFailureSummary` collects them into the summary's `knownFailing` list. A passing case
 * leaves the JSON reporter with no message, so the drawing cannot travel that way.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { collapseRecords, type KnownFailingEntry } from '../scripts/known-failing.ts';

/** Reset per invocation by `resetE2eReports`, so a run never reports a previous run's cases. */
export const KNOWN_FAILING_RECORD_DIR = path.join(process.cwd(), '.obsidian-cache', 'known-failing');

/** Appends `entry` to this worker's record. A record that cannot be written costs the report, not the case. */
export async function recordKnownFailing(entry: KnownFailingEntry): Promise<void> {
  try {
    await fsp.mkdir(KNOWN_FAILING_RECORD_DIR, { recursive: true });
    const worker = process.env.WDIO_WORKER_ID ?? 'launcher';
    await fsp.appendFile(path.join(KNOWN_FAILING_RECORD_DIR, `${worker}.jsonl`), JSON.stringify(entry) + '\n');
  } catch (e) {
    console.warn(`[e2e] could not write a known-failing record: ${String(e)}`);
  }
}

/** Every entry the workers of this invocation recorded, in file-name order. */
export async function collectKnownFailing(): Promise<KnownFailingEntry[]> {
  let names: string[];
  try {
    names = (await fsp.readdir(KNOWN_FAILING_RECORD_DIR)).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return [];
  }
  const entries: KnownFailingEntry[] = [];
  for (const name of names) {
    entries.push(...collapseRecords(await fsp.readFile(path.join(KNOWN_FAILING_RECORD_DIR, name), 'utf-8')));
  }
  return entries;
}
