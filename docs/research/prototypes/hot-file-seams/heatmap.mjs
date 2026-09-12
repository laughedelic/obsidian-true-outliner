// Per-region churn of the hot files over the last N first-parent commits of
// REF. Each hunk is credited to the regions of the side it touches: added
// lines to the file as the commit left it, removed lines to the file as its
// parent held it. Writes `heatmap.json` into SEAMS_DIR.
//
//   SEAMS_DIR=/tmp/seams REF=3e994a5 N=120 node docs/research/prototypes/hot-file-seams/heatmap.mjs
//
// Hot files are matched by pattern against each commit's own file list, so a
// path a seam introduces — a stylesheet part, a settings slice, a feature's
// e2e helpers — is measured at a later REF without editing this list.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { regionsCSS, regionsTS, regionAt } from './regions.mjs';

const ts = createRequire(join(process.cwd(), 'package.json'))('typescript');
const DIR = process.env.SEAMS_DIR ?? join(tmpdir(), 'hot-file-seams');
const N = Number(process.env.N ?? 120);
const REF = process.env.REF ?? 'origin/main';
export const HOT_FILE_PATTERNS = [
  /^e2e\/(helpers|footer|folding)\.ts$/,
  /^src\/plugin\/(decorations|main|keymap|backlinks-footer|mode-registry)\.ts$/,
  /^src\/plugin\/settings(\/[^/]+)?\.ts$/,
  /^src\/ops\.ts$/,
  /^styles\.css$/,
  /^styles\/[^/]+\.css$/,
];
export const isHotFile = (file) => HOT_FILE_PATTERNS.some((re) => re.test(file));
// Methods long enough that crediting the whole member says nothing.
const SPLIT_METHODS = new Set(['onload', 'display']);

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

const cache = new Map();
function regionsAt(sha, file) {
  const key = `${sha}:${file}`;
  if (!cache.has(key)) {
    const src = git('show', key);
    cache.set(key, src === null ? null : file.endsWith('.css') ? regionsCSS(src) : regionsTS(src, ts, SPLIT_METHODS));
  }
  return cache.get(key);
}

const log = git('log', '--format=%H%x09%P%x09%ad%x09%s', '--date=short', `-${N}`, '--first-parent', REF)
  .trim()
  .split('\n');
const records = [];
for (const row of log) {
  const [sha, parents, date, subject] = row.split('\t');
  const parent = parents.split(' ')[0];
  if (!parent) continue;
  const conventional = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:/);
  const pr = subject.match(/\(#(\d+)\)\s*$/)?.[1] ?? null;
  const files = (git('diff', '--name-only', '--no-renames', parent, sha) ?? '').split('\n').filter(isHotFile);
  for (const file of files) {
    const diff = git('diff', '-U0', '--no-renames', parent, sha, '--', file);
    if (!diff) continue;
    const regions = {};
    const credit = (name) => (regions[name] = (regions[name] ?? 0) + 1);
    for (const h of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
      const [a, b, c, d] = [+h[1], h[2] === undefined ? 1 : +h[2], +h[3], h[4] === undefined ? 1 : +h[4]];
      for (let l = a; l < a + b; l++) credit(regionAt(regionsAt(parent, file), l));
      for (let l = c; l < c + d; l++) credit(regionAt(regionsAt(sha, file), l));
    }
    records.push({ sha: sha.slice(0, 8), date, subject, type: conventional?.[1] ?? null, scope: conventional?.[2] ?? null, pr, file, regions });
  }
}
mkdirSync(DIR, { recursive: true });
writeFileSync(join(DIR, 'heatmap.json'), JSON.stringify(records, null, 1));
console.log(`${records.length} (commit, file) records from ${log.length} commits → ${join(DIR, 'heatmap.json')}`);
