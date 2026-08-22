/**
 * The logical groups the e2e specs are split into for CI.
 *
 * A group is derived from a spec's numeric prefix, so adding a spec never
 * requires editing this file or the workflow: the CI matrix is built from
 * `--list-groups`. An unrecognised decade still gets its own group, named
 * after the prefix, rather than being dropped from the run.
 *
 * Groups rather than `wdio --shard x/y` — which would balance better — so
 * that a failing check names what broke. Within-group imbalance is absorbed
 * by E2E_MAX_INSTANCES instead.
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SPEC_DIR = path.join(root, 'e2e', 'specs');

/** Prefix -> check name. A two-digit key wins over its decade, which is how a
 * single spec is lifted into a group of its own. */
const LABELS = {
  0: 'smoke',
  1: 'outline-mode',
  2: 'structural-commands',
  3: 'keyboard-grammar',
  4: 'shell',
  5: 'decorations',
  6: 'selection',
  // Its own group: the longest spec in the suite, and its own feature.
  55: 'position-indicators',
};

/**
 * Every spec as `{ [groupName]: absolutePath[] }`, ordered by prefix. A spec
 * not starting with two digits lands in `ungrouped`, so it still runs.
 */
export function specGroups() {
  const groups = new Map();
  for (const file of readdirSync(SPEC_DIR).sort()) {
    if (!file.endsWith('.e2e.ts')) continue;
    const prefix = /^(\d\d)-/.exec(file)?.[1];
    const decade = prefix?.[0];
    const name =
      prefix === undefined ? 'ungrouped' : (LABELS[prefix] ?? LABELS[decade] ?? `${decade}x`);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(path.join(SPEC_DIR, file));
  }
  return Object.fromEntries(groups);
}
