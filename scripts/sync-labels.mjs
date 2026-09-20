#!/usr/bin/env node
/**
 * Syncs the repository's labels to `.github/labels.yml`.
 *
 * The GitHub API creates a label implicitly when one is added to an issue, but
 * only as a grey swatch with no description — so a set left to that path loses
 * both the colour families the axes are read by and the sentence saying what
 * each value means. This reconciles the two: it creates what is missing,
 * updates a colour or description that has drifted, renames an existing label
 * named in `aliases` rather than replacing it (which would drop it from every
 * issue carrying it), and deletes what the file no longer declares.
 *
 * A delete takes the label off every issue that has it, so `--dry-run` reports
 * the plan without making it. `--check` runs offline and only asserts that every
 * label `.github/labeler.yml` can apply is one this file declares, which is what
 * `npm run lint` calls.
 */

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const checkOnly = process.argv.includes('--check');

const read = (rel) => yaml.load(readFileSync(path.join(root, rel), 'utf8'));
const declared = read('.github/labels.yml');
const declaredNames = new Set(declared.map((l) => l.name));

const applied = Object.keys(read('.github/labeler.yml'));
const undeclared = applied.filter((name) => !declaredNames.has(name));
if (undeclared.length > 0) {
  console.error(`.github/labeler.yml applies labels .github/labels.yml does not declare: ${undeclared.join(', ')}`);
  process.exit(1);
}
if (checkOnly) {
  console.log(`.github/labels.yml: ${declared.length} labels, ${applied.length} of them applied by paths.`);
  process.exit(0);
}

const repo = process.env.GITHUB_REPOSITORY ?? 'laughedelic/obsidian-true-outliner';

/**
 * Every call goes through `gh api` rather than an HTTP client, so nothing here
 * handles credentials: a runner's token and a cloud session's injected proxy
 * header both reach GitHub the same way, and neither is read by this file. `gh`
 * is on the runner image and in `scripts/agent-setup.sh`.
 */
const api = (method, urlPath, body) =>
  new Promise((resolve, reject) => {
    const args = ['api', '-X', method, urlPath];
    if (body !== undefined) args.push('--input', '-');
    const child = execFile('gh', args, { maxBuffer: 16 << 20 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`gh api -X ${method} ${urlPath}: ${stderr || err.message}`));
      resolve(stdout.trim() === '' ? null : JSON.parse(stdout));
    });
    if (body !== undefined) child.stdin.end(JSON.stringify(body));
  });

const existing = [];
for (let page = 1; ; page++) {
  const batch = await api('GET', `repos/${repo}/labels?per_page=100&page=${page}`);
  existing.push(...batch);
  if (batch.length < 100) break;
}
const byName = new Map(existing.map((l) => [l.name, l]));

const plan = [];
const keep = new Set();

for (const want of declared) {
  const from = (want.aliases ?? []).find((a) => byName.has(a) && !byName.has(want.name));
  const have = byName.get(want.name) ?? (from ? byName.get(from) : undefined);
  keep.add(want.name);
  if (from) keep.add(from);

  if (!have) {
    plan.push({ verb: 'create', name: want.name, run: () =>
      api('POST', `repos/${repo}/labels`, { name: want.name, color: want.color, description: want.description ?? '' }) });
    continue;
  }
  const drift = have.name !== want.name
    || have.color !== want.color
    || (have.description ?? '') !== (want.description ?? '');
  if (drift) {
    const verb = have.name !== want.name ? `rename ${have.name} ->` : 'update';
    plan.push({ verb, name: want.name, run: () =>
      api('PATCH', `repos/${repo}/labels/${encodeURIComponent(have.name)}`, {
        new_name: want.name, color: want.color, description: want.description ?? '',
      }) });
  }
}

for (const have of existing) {
  if (keep.has(have.name)) continue;
  plan.push({ verb: 'delete', name: have.name, run: () =>
    api('DELETE', `repos/${repo}/labels/${encodeURIComponent(have.name)}`) });
}

if (plan.length === 0) {
  console.log(`${existing.length} labels, all matching .github/labels.yml`);
  process.exit(0);
}

for (const step of plan) console.log(`${dryRun ? 'would ' : ''}${step.verb} ${step.name}`);
if (dryRun) process.exit(0);
for (const step of plan) await step.run();
console.log(`${plan.length} changes applied`);
