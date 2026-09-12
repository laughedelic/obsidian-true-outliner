// Textual conflicts between concurrently open PRs, simulated per hot file as
// the three-way merge a rebase performs.
//
// For a pair where `a` landed while `b` was open, three snapshots of the file
// are reconstructed from squashed diffs: the base — `b`'s pre-image with `a`
// reversed out of it — and the two sides, `a` applied to it (which is `b`'s
// pre-image itself) and `b` applied to it (`b`'s result with `a` reversed
// out). `git merge-file` then merges the two sides over the base with the
// algorithm a rebase uses, so an edit that is merely near another's merges
// cleanly and only overlapping or touching hunks conflict.
//
// Reversing `a` requires one line of context (`-C1`), so a neighbouring edit
// does not count as one. When `a` cannot be reversed out of `b`'s RESULT, `b`
// changed `a`'s own lines or the line beside them — the overlap a merge
// reports as a conflict — and the pair counts as one, placed from the hunks
// that failed. When `a` cannot be reversed out of `b`'s pre-image, a change
// between the two rewrote `a`'s lines and the pair is not evaluable. Squashed
// diffs mean a branch's intermediate states are not seen: what is measured is
// the overlap of what each PR finally changed.
//
//   SEAMS_DIR=/tmp/seams REF=3e994a5 node docs/research/prototypes/hot-file-seams/conflicts.mjs
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

const scratch = join(DIR, 'merge');
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
const tmp = (name, content) => {
  const p = join(scratch, name);
  writeFileSync(p, content);
  return p;
};

/** `content` with `patch` reversed out of it: the result, or the hunks that
 * could not be reversed because their lines are no longer there. */
function reversed(content, patch) {
  const file = tmp('reverse.txt', content);
  rmSync(`${file}.rej`, { force: true });
  const res = spawnSync('git', ['apply', '-R', '-C1', '--reject', '--whitespace=nowarn', '-p0', '-'], {
    cwd: scratch,
    input: patch.replaceAll(/^(---|\+\+\+) [ab]\/.*$/gm, (m, sign) => `${sign} reverse.txt`),
    encoding: 'utf8',
  });
  // A patch that created the file reverses to no file at all.
  if (res.status === 0 && existsSync(file)) return { result: readFileSync(file, 'utf8') };
  return { rejected: existsSync(`${file}.rej`) ? readFileSync(`${file}.rej`, 'utf8') : '' };
}

function merge(base, ours, theirs) {
  const res = spawnSync('git', ['merge-file', '-p', '-L', 'b', '-L', 'base', '-L', 'a', tmp('theirs.txt', theirs), tmp('base.txt', base), tmp('ours.txt', ours)], { encoding: 'utf8' });
  return { conflicts: res.status, merged: res.stdout };
}

const regionsOf = (file, src) => (file.endsWith('.css') ? regionsCSS(src) : regionsTS(src, ts));

/** The region holding the first substantive line of `lines`, looked up in the
 * first of the snapshots that contains it. */
function place(file, lines, ...snapshots) {
  const probe = lines.find((l) => l.trim().length > 3) ?? lines[0];
  for (const src of snapshots) {
    const at = src.split('\n').indexOf(probe);
    if (at >= 0) return regionAt(regionsOf(file, src), at + 1);
  }
  return '(unplaced)';
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
      const patchA = git('diff', ca.parent, ca.sha, '--', file);
      const withA = git('show', `${cb.parent}:${file}`);
      const withBoth = git('show', `${cb.sha}:${file}`);
      const base = reversed(withA, patchA).result;
      if (base === undefined) {
        results.push({ a: an, b: bn, file, verdict: 'not evaluable' });
        continue;
      }
      const sideB = reversed(withBoth, patchA);
      if (sideB.result === undefined) {
        // `b` changed lines `a` introduced (or the line beside them): each
        // hunk of `a` that no longer reverses is one conflict.
        const hunks = [];
        for (const h of sideB.rejected.split(/\n(?=@@ )/).slice(1)) {
          const added = h.split('\n').filter((l) => l.startsWith('+')).map((l) => l.slice(1));
          hunks.push({ region: place(file, added, withBoth, withA), kind: 'b edited a’s lines' });
        }
        results.push({ a: an, b: bn, file, verdict: 'conflict', hunks });
        continue;
      }
      const { conflicts, merged } = merge(base, withA, sideB.result);
      if (conflicts === 0) {
        results.push({ a: an, b: bn, file, verdict: 'clean' });
        continue;
      }
      const hunks = [];
      for (const m of merged.matchAll(/^<<<<<<< b\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> a\n/gm)) {
        const [bSide, aSide] = [m[1].split('\n').slice(0, -1), m[2].split('\n').slice(0, -1)];
        const region = bSide.length ? place(file, bSide, sideB.result, withBoth) : place(file, aSide, withA);
        hunks.push({ region, kind: 'touching hunks', addedByB: bSide.length, addedByA: aSide.length });
      }
      results.push({ a: an, b: bn, file, verdict: 'conflict', hunks });
    }
  }
rmSync(scratch, { recursive: true, force: true });
writeFileSync(join(DIR, 'conflicts.json'), JSON.stringify(results, null, 1));

const byFile = new Map();
for (const r of results) {
  const e = byFile.get(r.file) ?? { pairs: 0, clean: 0, conflict: 0, 'not evaluable': 0, hunks: 0 };
  e.pairs++;
  e[r.verdict]++;
  if (r.hunks) e.hunks += r.hunks.length;
  byFile.set(r.file, e);
}
const pairKeys = new Set(results.map((r) => `${r.a}->${r.b}`));
const conflicting = new Set(results.filter((r) => r.verdict === 'conflict').map((r) => `${r.a}->${r.b}`));
const total = [...byFile.values()].reduce((n, e) => n + e.hunks, 0);
console.log(`${pairKeys.size} overlapping pairs shared a hot file; ${conflicting.size} met a conflict in at least one; ${total} conflicts in all\n`);
console.log('file                               pairs clean conflict not-evaluable  conflicts');
for (const [f, e] of [...byFile].sort((x, y) => y[1].conflict - x[1].conflict))
  console.log(`${f.padEnd(34)} ${String(e.pairs).padStart(5)} ${String(e.clean).padStart(5)} ${String(e.conflict).padStart(8)} ${String(e['not evaluable']).padStart(13)} ${String(e.hunks).padStart(10)}`);
console.log('\nconflicts (region {candidate group} — kind):');
for (const r of results.filter((x) => x.verdict === 'conflict')) {
  console.log(`  #${r.a} → #${r.b}  ${r.file}  (${prByNum.get(r.a).title.slice(0, 40)} → ${prByNum.get(r.b).title.slice(0, 40)})`);
  for (const h of r.hunks) console.log(`      ${h.region} {${group(r.file, h.region)}} — ${h.kind}${h.kind === 'touching hunks' ? ` (+${h.addedByB} b, +${h.addedByA} a)` : ''}`);
}
