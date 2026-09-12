// Textual conflicts between concurrently open PRs, simulated per hot file.
//
// For a pair where `a` landed while `b` was open: take the file as it stood
// just before `b` landed, reverse `a`'s change on it, and apply `b`'s change to
// the result. The hunks of `b` that no longer apply are the ones a rebase of
// `b` over `a` meets as conflicts. A pair is "not evaluable" when `a`'s change
// cannot be reversed there, because a later commit rewrote its lines. Works
// from squashed diffs, so a branch's intermediate states are not seen.
//
//   SEAMS_DIR=/tmp/seams node docs/research/prototypes/hot-file-seams/conflicts.mjs
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DIR, group } from './groups.mjs';
import { regionAt, regionsCSS, regionsTS } from './regions.mjs';

const ts = createRequire(join(process.cwd(), 'package.json'))('typescript');
const records = JSON.parse(readFileSync(join(DIR, 'heatmap.json'), 'utf8'));
const prs = JSON.parse(readFileSync(join(DIR, 'merged-prs.json'), 'utf8'));
const prByNum = new Map(prs.map((p) => [String(p.number), p]));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

const commitOf = new Map();
for (const row of git('log', '--format=%H %P %s', `-${process.env.N ?? 120}`, '--first-parent', process.env.REF ?? 'origin/main').trim().split('\n')) {
  const [sha, parent] = row.split(' ');
  const pr = row.match(/\(#(\d+)\)\s*$/)?.[1];
  if (pr) commitOf.set(pr, { sha, parent });
}
const filesOf = new Map();
for (const r of records) {
  if (!r.pr) continue;
  filesOf.set(r.pr, (filesOf.get(r.pr) ?? new Set()).add(r.file));
}

const scratch = join(DIR, 'apply');
function apply(file, content, patch, reverse) {
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(join(scratch, dirname(file)), { recursive: true });
  writeFileSync(join(scratch, file), content);
  writeFileSync(join(scratch, 'change.diff'), patch);
  const res = spawnSync('git', ['apply', '--reject', '--whitespace=nowarn', ...(reverse ? ['-R'] : []), 'change.diff'], { cwd: scratch });
  const rej = join(scratch, `${file}.rej`);
  return {
    ok: res.status === 0,
    rejected: existsSync(rej) ? readFileSync(rej, 'utf8') : '',
    result: existsSync(join(scratch, file)) ? readFileSync(join(scratch, file), 'utf8') : null,
  };
}

const nums = [...filesOf.keys()].filter((n) => prByNum.has(n) && commitOf.has(n));
const results = [];
for (const an of nums)
  for (const bn of nums) {
    const a = prByNum.get(an);
    const b = prByNum.get(bn);
    if (an === bn || !(a.mergedAt < b.mergedAt) || !(b.createdAt < a.mergedAt)) continue;
    const ca = commitOf.get(an);
    const cb = commitOf.get(bn);
    for (const file of filesOf.get(an)) {
      if (!filesOf.get(bn).has(file)) continue;
      const base = git('show', `${cb.parent}:${file}`);
      const reverted = apply(file, base, git('diff', ca.parent, ca.sha, '--', file), true);
      if (!reverted.ok || reverted.result === null) {
        results.push({ a: an, b: bn, file, verdict: 'not evaluable' });
        continue;
      }
      const replayed = apply(file, reverted.result, git('diff', cb.parent, cb.sha, '--', file), false);
      if (replayed.ok) {
        results.push({ a: an, b: bn, file, verdict: 'clean' });
        continue;
      }
      // A rejected hunk's old-side lines are in `base` coordinates.
      const regions = file.endsWith('.css') ? regionsCSS(base) : regionsTS(base, ts);
      const hunks = [...replayed.rejected.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@(.*)$/gm)].map((h) => {
        const start = +h[1];
        const len = h[2] === undefined ? 1 : +h[2];
        const body = replayed.rejected.slice(h.index + h[0].length).split(/\n(?=@@)/)[0];
        return {
          region: regionAt(regions, start + Math.floor(len / 2)),
          removed: (body.match(/^-/gm) ?? []).length,
          added: (body.match(/^\+/gm) ?? []).length,
        };
      });
      results.push({ a: an, b: bn, file, verdict: 'conflict', hunks });
    }
  }
writeFileSync(join(DIR, 'conflicts.json'), JSON.stringify(results, null, 1));

const byFile = new Map();
for (const r of results) {
  const e = byFile.get(r.file) ?? { pairs: 0, clean: 0, conflict: 0, 'not evaluable': 0 };
  e.pairs++;
  e[r.verdict]++;
  byFile.set(r.file, e);
}
const pairKeys = new Set(results.map((r) => `${r.a}->${r.b}`));
const conflicting = new Set(results.filter((r) => r.verdict === 'conflict').map((r) => `${r.a}->${r.b}`));
console.log(`${pairKeys.size} overlapping pairs shared a hot file; ${conflicting.size} met a conflict in at least one\n`);
console.log('file                               pairs clean conflict not-evaluable');
for (const [f, e] of [...byFile].sort((x, y) => y[1].conflict - x[1].conflict))
  console.log(`${f.padEnd(34)} ${String(e.pairs).padStart(5)} ${String(e.clean).padStart(5)} ${String(e.conflict).padStart(8)} ${String(e['not evaluable']).padStart(13)}`);
console.log('\nrejected hunks per conflict ([-removed +added] region {candidate group}):');
for (const r of results.filter((x) => x.verdict === 'conflict')) {
  console.log(`  #${r.a} → #${r.b}  ${r.file}  (${prByNum.get(r.a).title.slice(0, 40)} → ${prByNum.get(r.b).title.slice(0, 40)})`);
  for (const h of r.hunks) console.log(`      [-${h.removed} +${h.added}] ${h.region} {${group(r.file, h.region)}}`);
}
