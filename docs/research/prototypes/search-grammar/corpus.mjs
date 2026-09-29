/**
 * The measured corpus: `test-vault`, parsed by the plugin's own parser.
 *
 * The parser is TypeScript and this is a script, so `src/parse.ts` is bundled
 * with esbuild — already a dev dependency — and imported from memory. That
 * keeps the measurement running against the REAL parse rather than a second
 * reading of markdown written for the occasion.
 *
 * Run `node scripts/gen-backlink-hub.ts` first: the hub fixture is generated
 * rather than tracked, and it is most of the corpus by node count.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

async function loadParse() {
  const built = await esbuild.build({
    entryPoints: [path.join(root, 'src/parse.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const source = built.outputFiles[0].text;
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return (await import(url)).parse;
}

function markdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

/**
 * Every node in the vault, with the two texts a query can be answered against:
 * its OWN text (what `matchNodes` reads) and the first lines of its ancestors
 * (what a structural term reads). `first` is the node's first line, which is
 * what a lineage row shows.
 */
export async function loadCorpus({ exclude } = {}) {
  const parse = await loadParse();
  const vault = path.join(root, 'test-vault');
  const files = markdownFiles(vault).filter((f) => !exclude || !f.includes(exclude));
  const nodes = [];
  let bytes = 0;

  for (const file of files) {
    const md = fs.readFileSync(file, 'utf8');
    bytes += Buffer.byteLength(md);
    const doc = parse(md);
    const rel = path.relative(vault, file);
    const walk = (children, lineage) => {
      for (const node of children) {
        const text = node.lines.join('\n');
        nodes.push({
          path: rel,
          kind: node.kind,
          text,
          first: node.lines[0] ?? '',
          lineage: lineage.slice(),
          depth: lineage.length,
          children: node.children.length,
        });
        walk(node.children, [...lineage, node.lines[0] ?? '']);
      }
    };
    walk(doc.children, []);
  }

  return { files, nodes, bytes, parse };
}

/** Deterministic pick of `count` items, evenly spaced through `items`. */
export function sample(items, count) {
  if (items.length <= count) return items.slice();
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

/** Wall-clock milliseconds for `runs` repetitions of `fn`, per repetition. */
export function timed(fn, runs) {
  fn();
  const start = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - start) / runs;
}
