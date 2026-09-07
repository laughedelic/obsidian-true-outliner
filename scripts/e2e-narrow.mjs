/**
 * The dev-loop entry point for iterating on ONE e2e test: builds the plugin,
 * then invokes wdio directly against a single spec file (optionally further
 * narrowed to a single test by name), skipping `run-e2e.mjs`'s whole-group
 * dispatch. Reserve `run-e2e.mjs` (`npm run test:e2e[:mobile]`) for a final
 * check before pushing — see CLAUDE.md's "E2E testing" section for why.
 *
 *   node scripts/e2e-narrow.mjs <spec> [test-name-grep] [--mobile]
 *
 * `<spec>` is matched against `e2e/specs/*.e2e.ts` by substring on the
 * filename (case-insensitive) — `77`, `footer-controls`, and
 * `77-footer-controls` all resolve to the same file — or it can be a real
 * path to a spec file. An ambiguous substring lists every match and exits
 * rather than guessing.
 *
 * `[test-name-grep]` becomes `--mochaOpts.grep`, mocha's own substring/regex
 * match against full test titles (`describe > it`), so it works with no
 * changes to the specs themselves.
 *
 * This still runs the plugin build, the backlink-hub generator, and the vault
 * drift snapshot/restore that `run-e2e.mjs` runs — the lever here is `--spec`
 * targeting a single file instead of a whole group, not skipping that setup.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { binPath } from './bin-path.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specDir = path.join(root, 'e2e', 'specs');

function usage() {
  console.error(
    [
      'Usage: node scripts/e2e-narrow.mjs <spec> [test-name-grep] [--mobile]',
      '',
      '  <spec>            substring of a filename in e2e/specs, or a path to one',
      '  [test-name-grep]  mocha --mochaOpts.grep pattern (matches full test titles)',
      '  --mobile          run under wdio.mobile-emulation.conf.mts instead',
      '',
      'Examples:',
      '  node scripts/e2e-narrow.mjs 77-footer-controls',
      '  node scripts/e2e-narrow.mjs footer-controls "renders the footer"',
      '  npm run test:e2e:narrow -- 77 "renders the footer"',
    ].join('\n'),
  );
}

const rawArgs = process.argv.slice(2);
const mobile = rawArgs.includes('--mobile');
const positional = rawArgs.filter((a) => a !== '--mobile');
const [specArg, grep] = positional;

if (!specArg || rawArgs.includes('--help') || rawArgs.includes('-h')) {
  usage();
  process.exit(specArg ? 0 : 1);
}

/** Resolves `specArg` to exactly one absolute spec path, or exits with a
 * message — never silently picks among several matches. */
function resolveSpec(arg) {
  const direct = path.isAbsolute(arg) ? arg : path.join(root, arg);
  if (existsSync(direct) && direct.endsWith('.e2e.ts')) return direct;

  const files = readdirSync(specDir).filter((f) => f.endsWith('.e2e.ts'));
  const needle = arg.toLowerCase();
  const matches = files.filter((f) => f.toLowerCase().includes(needle));

  if (matches.length === 1) return path.join(specDir, matches[0]);
  if (matches.length === 0) {
    console.error(`[e2e:narrow] no spec matches ${JSON.stringify(arg)} in e2e/specs/`);
    process.exit(1);
  }
  console.error(
    `[e2e:narrow] ${JSON.stringify(arg)} matches ${matches.length} specs — narrow it further:\n` +
      matches.map((f) => `  ${f}`).join('\n'),
  );
  process.exit(1);
}

const specPath = resolveSpec(specArg);
console.log(`[e2e:narrow] spec: ${path.relative(root, specPath)}${grep ? `, grep: ${JSON.stringify(grep)}` : ''}`);

const run = (cmd, args, env) =>
  spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;

// Resolved before any setup step runs, so a missing install fails loudly and
// changes nothing — same reasoning as run-e2e.mjs. Resolving it after the
// drift snapshot would leave that snapshot stranded (unconsumed) if this
// throws, and a later run would then treat it as a valid baseline.
const wdio = binPath('wdio');

const build = run(process.execPath, ['esbuild.config.mjs', 'production', '--dev']);
if (build !== 0) process.exit(build);

const hub = run(process.execPath, ['scripts/gen-backlink-hub.mjs']);
if (hub !== 0) process.exit(hub);

const drift = (...args) => run(process.execPath, ['scripts/check-vault-drift.mjs', ...args]);
if (drift('--snapshot') !== 0) process.exit(1);

const wdioArgs = [
  'run',
  mobile ? 'e2e/wdio.mobile-emulation.conf.mts' : 'e2e/wdio.conf.mts',
  '--spec',
  specPath,
];
if (grep) wdioArgs.push('--mochaOpts.grep', grep);

let suite = 1;
try {
  suite = run(wdio, wdioArgs, mobile ? { OBSIDIAN_E2E_MOBILE: '1' } : {});
} finally {
  const cleanup = drift();
  process.exitCode = suite !== 0 ? suite : cleanup !== 0 ? 1 : 0;
}
