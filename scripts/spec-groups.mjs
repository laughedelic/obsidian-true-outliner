/**
 * The logical groups the e2e specs are split into for CI.
 *
 * A group is derived from a spec's NUMERIC PREFIX — `5x` is every
 * `e2e/specs/5*.e2e.ts` — so the split is a property of the file names, not a
 * list someone has to remember to update. Adding `56-whatever.e2e.ts` puts it
 * in the decorations group automatically; adding `70-whatever.e2e.ts` creates a
 * `7x` group and a CI check to match, because the workflow builds its matrix
 * from `--list-groups` rather than hardcoding one.
 *
 * Why groups rather than `wdio --shard x/y`, which would balance better: a
 * failing check should say WHAT broke before anyone opens a log. "e2e-desktop
 * (decorations)" does; "e2e-desktop (shard 3/4)" does not. The imbalance that
 * costs — the decorations group is ~2.5x the next one — is absorbed by running
 * the specs WITHIN a group in parallel (E2E_MAX_INSTANCES), which is the axis
 * that actually has headroom.
 *
 * LABELS is presentation only. A prefix missing from it still gets its own
 * group, named after the prefix; the map can go stale in the sense that a new
 * decade shows up as `7x` instead of a friendly name, but it can never drop a
 * spec from CI.
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SPEC_DIR = path.join(root, 'e2e', 'specs');

/** Decade prefix -> the name its CI check carries. */
const LABELS = {
  0: 'smoke',
  1: 'outline-mode',
  2: 'structural-commands',
  3: 'keyboard-grammar',
  4: 'shell',
  5: 'decorations',
  6: 'selection',
};

/**
 * Every spec grouped by decade, as `{ [groupName]: absolutePath[] }`, ordered
 * by prefix. Specs whose name does not start with two digits fall into
 * `ungrouped` — visible and run, rather than silently skipped.
 */
export function specGroups() {
  const groups = new Map();
  for (const file of readdirSync(SPEC_DIR).sort()) {
    if (!file.endsWith('.e2e.ts')) continue;
    const decade = /^(\d)\d-/.exec(file)?.[1];
    const name = decade === undefined ? 'ungrouped' : (LABELS[decade] ?? `${decade}x`);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(path.join(SPEC_DIR, file));
  }
  return Object.fromEntries(groups);
}
