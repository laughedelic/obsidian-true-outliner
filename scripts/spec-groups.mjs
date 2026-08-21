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
 * A single spec can be lifted out of its decade by giving LABELS its full
 * two-digit prefix, which is how a group gets subdivided without giving up the
 * derivation: the decade remains the fallback, so a later `56-*.e2e.ts` still
 * lands in decorations rather than nowhere.
 *
 * Why groups rather than `wdio --shard x/y`, which would balance better: a
 * failing check should say WHAT broke before anyone opens a log. "e2e-desktop
 * (decorations)" does; "e2e-desktop (shard 3/4)" does not. The imbalance that
 * costs — the decorations group is ~2.5x the next one — is absorbed by running
 * the specs WITHIN a group in parallel (E2E_MAX_INSTANCES), which is the axis
 * that actually has headroom.
 *
 * LABELS is naming and subdivision only. A prefix missing from it still gets a
 * group, named after its decade; the map can go stale in the sense that a new
 * decade shows up as `7x` instead of a friendly name, but it can never drop a
 * spec from CI.
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SPEC_DIR = path.join(root, 'e2e', 'specs');

/**
 * Prefix -> the name its CI check carries. A two-digit key wins over the
 * one-digit decade, which is how a spec earns a check of its own.
 */
const LABELS = {
  0: 'smoke',
  1: 'outline-mode',
  2: 'structural-commands',
  3: 'keyboard-grammar',
  4: 'shell',
  5: 'decorations',
  6: 'selection',
  // Split out of decorations because it is the longest single spec in the
  // suite (~124s solo), which made it the floor that group could not get
  // under however many instances it ran. It is also its own feature —
  // caret-derived accents rather than the base decoration layers.
  55: 'position-indicators',
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
    const prefix = /^(\d\d)-/.exec(file)?.[1];
    const decade = prefix?.[0];
    const name =
      prefix === undefined ? 'ungrouped' : (LABELS[prefix] ?? LABELS[decade] ?? `${decade}x`);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(path.join(SPEC_DIR, file));
  }
  return Object.fromEntries(groups);
}
