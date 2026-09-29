// Pulls every fenced block that holds a drawn column edge (`┆` or `▒` at a line start) out of the
// issue and comment bodies in <bodies-dir>/<name>.md, writes each to <out>/<name>-<n>.txt, and
// reads it back into columns with `layout.ts --read` (<out>/<name>-<n>.cols).
//
//   node extract.mjs <bodies-dir> <out-dir>
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const [bodies, out] = process.argv.slice(2);
if (!bodies || !out) throw new Error('usage: node extract.mjs <bodies-dir> <out-dir>');
const layout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../scripts/layout.ts');
mkdirSync(out, { recursive: true });

let total = 0;
let unread = 0;
for (const file of readdirSync(bodies).filter((f) => f.endsWith('.md')).sort()) {
  const name = file.replace(/\.md$/, '');
  let inside = false;
  let fence = '';
  let buffer = [];
  let n = 0;
  for (const line of readFileSync(path.join(bodies, file), 'utf8').split('\n')) {
    const opens = /^(`{3,})/.exec(line);
    if (!inside && opens) {
      inside = true;
      fence = opens[1];
      buffer = [];
    } else if (inside && line.trim() === fence) {
      inside = false;
      if (!buffer.some((l) => l.startsWith('┆') || l.startsWith('▒'))) continue;
      n++;
      total++;
      const block = `${buffer.join('\n')}\n`;
      writeFileSync(path.join(out, `${name}-${n}.txt`), block);
      try {
        writeFileSync(path.join(out, `${name}-${n}.cols`), execFileSync('node', [layout, '--read'], { input: block, encoding: 'utf8' }));
      } catch (e) {
        unread++;
        console.log(`${name}-${n}: not read: ${String(e.stderr ?? e).split('\n')[0]}`);
      }
    } else if (inside) buffer.push(line);
  }
  console.log(`${name}: ${n} drawn block(s)`);
}
console.log(`${total} blocks, ${unread} not read`);
