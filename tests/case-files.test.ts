import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawDocument, parseCase, readDocument } from '../scripts/notation.ts';

/**
 * Every drawn case file under e2e-tests/cases/ is checked here, without Obsidian: it parses (its
 * keys are ones the runner presses), it sits under a capability of openspec/specs/, and each
 * drawn column reads back as itself, which a glyph in the text that the notation draws with would
 * break.
 */

const ROOT = path.join(__dirname, '..');
const CASES = path.join(ROOT, 'e2e-tests', 'cases');
const CAPABILITIES = path.join(ROOT, 'openspec', 'specs');

function caseFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? caseFiles(full) : entry.endsWith('.case') ? [full] : [];
  });
}

/** What is wrong with one case file, one sentence each. */
export function problems(file: string, source: string, cases = CASES, capabilities = CAPABILITIES): string[] {
  const found: string[] = [];
  const capability = path.relative(cases, file).split(path.sep)[0] ?? '';
  if (!existsSync(path.join(capabilities, capability))) {
    found.push(`${capability} is not a capability under openspec/specs/`);
  }
  let parsed;
  try {
    parsed = parseCase(source);
  } catch (e) {
    return [...found, (e as Error).message];
  }
  const columns = [
    ['before', parsed.beforeLines],
    ...parsed.results.map((r): [string, string[]] => [r.header, r.lines]),
  ] as [string, string[]][];
  for (const [name, lines] of columns) {
    const read = readDocument(lines);
    const drawn = readDocument(
      drawDocument({ text: read.text, ranges: read.selection ? [read.selection] : [], blockLines: read.blockLines }),
    );
    if (JSON.stringify(drawn) !== JSON.stringify(read)) found.push(`"${name}" does not read back as itself once drawn`);
  }
  return found;
}

describe('drawn case files', () => {
  const files = caseFiles(CASES);

  it('has case files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${path.relative(CASES, file)} is well formed`, () => {
      expect(problems(file, readFileSync(file, 'utf8'))).toEqual([]);
    });
  }

  it('refuses a file under a directory that names no capability', () => {
    const file = path.join(CASES, 'no-such-capability', 'x.case');
    expect(problems(file, '=== before\na┃\n=== expected\na┃\n')).toEqual([
      'no-such-capability is not a capability under openspec/specs/',
    ]);
  });

  it('refuses a file that does not parse, naming the line', () => {
    const file = path.join(CASES, 'outline-mode', 'x.case');
    expect(problems(file, 'tabs: yes\n=== before\na\n=== expected\na\n').join()).toContain('line 1');
  });
});
