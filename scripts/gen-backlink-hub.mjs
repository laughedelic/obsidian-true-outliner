/**
 * Generates the hub-scale backlink fixture: many notes all referencing one target.
 *
 *   node scripts/gen-backlink-hub.mjs [--notes 120] [--refs 400]
 *
 * The small diagnostic fixtures in `test-vault/Backlinks/` are tracked, because each
 * isolates one structural case and reviewing a diff of them is meaningful. This one is
 * not: it is several hundred near-identical notes whose only property is bulk, and a
 * tracked copy would be noise in every diff forever. Generating it keeps the corpus
 * reproducible (fixed seed, no randomness) without carrying it in the repository.
 *
 * Output goes to `test-vault/Backlinks/Hub/`, which .gitignore excludes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'test-vault', 'Backlinks', 'Hub');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const noteCount = arg('notes', 120);
const refTotal = arg('refs', 400);

/** The target every generated note points at — a real, tracked vault note. */
const TARGET = 'Aurora Dashboard';

/**
 * Deterministic pseudo-random: the corpus has to be byte-identical across runs and
 * machines, or "the same fixture every time" (docs/research/07, ground rule 2) is a
 * claim rather than a fact. Mulberry32 with a fixed seed.
 */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20260828);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

const OPENERS = [
  'Long day. The list actually shrank for once.',
  'Mostly meetings. Notes are thin.',
  'Deep work morning, interruptions after lunch.',
  'Travel day — wrote this on the train.',
  'Quiet one. Cleared the inbox and little else.',
];
const LEAVES = [
  'checked the severity sort against the recordings',
  'timestamp-on-hover still needs a touch fallback',
  'triage view is behind the flag now',
  'PII review of the alarm-name field is still open',
  'shop-floor tablets are the real test surface',
];

/** Reference kinds, so the hub exercises classification at scale, not only volume. */
const REFS = [
  () => `[[${TARGET}]]`,
  () => `[[${TARGET}#Current sprint]]`,
  () => `[[${TARGET}|the dashboard]]`,
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Spread refTotal references over noteCount notes as evenly as the division allows,
// so per-note counts vary but the total is exactly what was asked for.
const perNote = Array.from({ length: noteCount }, (_, i) =>
  Math.floor(refTotal / noteCount) + (i < refTotal % noteCount ? 1 : 0),
);

let written = 0;
for (let i = 0; i < noteCount; i++) {
  const day = String((i % 28) + 1).padStart(2, '0');
  const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
  const name = `2025-${month}-${day} (${i + 1}).md`;

  const lines = [pick(OPENERS), ''];
  for (let r = 0; r < perNote[i]; r++) {
    // Vary depth so the projection has chains of different lengths to squash.
    const depth = r % 4;
    lines.push('- work');
    for (let d = 1; d <= depth; d++) lines.push(`${'\t'.repeat(d)}- ${pick(LEAVES)}`);
    lines.push(`${'\t'.repeat(depth + 1)}- ${pick(LEAVES)} ${pick(REFS)()}`);
    lines.push('');
    written++;
  }
  fs.writeFileSync(path.join(outDir, name), lines.join('\n'), 'utf8');
}

console.log(
  `[gen-backlink-hub] wrote ${noteCount} notes / ${written} references to ${TARGET} in ${path.relative(root, outDir)}`,
);
