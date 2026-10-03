/**
 * Checks that every Markdown file under `docs/research/` opens with a YAML front-matter block
 * carrying a non-empty `type`, the one key the Open Knowledge Format requires of a document, and a
 * non-empty `description`, which we require on top of it because it replaces the summary the index
 * gave each note.
 *
 * A note is a file with that block and nothing else: there is no index to keep in step, so adding
 * a note touches only the note itself.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'docs', 'research');

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** What is wrong with a file's front matter, or `undefined` when it conforms. */
function problemWith(text: string): string | undefined {
  const block = BLOCK.exec(text);
  if (!block) return 'no front-matter block at the top of the file';

  let data: unknown;
  try {
    data = parse(block[1] ?? '');
  } catch (error) {
    return `front matter does not parse: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) return 'front matter is not a mapping';
  for (const key of ['type', 'description']) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value !== 'string' || value.trim() === '') return `front matter has no non-empty \`${key}\``;
  }
  return undefined;
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.md'))
  .sort();

const problems = files.flatMap((file) => {
  const problem = problemWith(readFileSync(path.join(dir, file), 'utf8'));
  return problem === undefined ? [] : [`${file}: ${problem}`];
});

if (problems.length > 0) {
  console.error('docs/research/ front matter is incomplete:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nEvery Markdown file here opens with a `---` block holding at least `type: research` and a `description`.');
  process.exit(1);
}

console.log(`docs/research/: ${files.length} files, all with a type and a description.`);
