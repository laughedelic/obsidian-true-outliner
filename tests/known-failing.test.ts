import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collapseRecords, renderStepSummary, type KnownFailingEntry } from '../scripts/known-failing.ts';
import { entriesOf } from '../scripts/known-failing-summary.ts';

const entry = (over: Partial<KnownFailingEntry> = {}): KnownFailingEntry => ({
  case: 'structural-operations/renumber',
  issue: 228,
  platform: 'desktop',
  differs: ['text'],
  drawing: ' before    expected ⏎\n┆1. a┃    ┆1. a',
  ...over,
});
const line = (e: KnownFailingEntry) => JSON.stringify(e);

describe('collecting the workers\' records', () => {
  it('reads one entry per line', () => {
    const a = entry();
    const b = entry({ case: 'structural-operations/other', issue: 255, platform: 'mobile', differs: ['text', 'caret'] });
    expect(collapseRecords(`${line(a)}\n${line(b)}\n`)).toEqual([a, b]);
  });

  it('collects the records of two workers, each read on its own', () => {
    const one = collapseRecords(`${line(entry())}\n`);
    const two = collapseRecords(`${line(entry({ issue: 255 }))}\n`);
    expect([...one, ...two].map((e) => e.issue)).toEqual([228, 255]);
  });

  it('skips a line a killed worker left half-written, and keeps the entries around it', () => {
    const half = line(entry({ issue: 9 })).slice(0, 30);
    const text = `${line(entry())}\n${half}\n${line(entry({ issue: 255 }))}\n${half}`;
    expect(collapseRecords(text).map((e) => e.issue)).toEqual([228, 255]);
  });

  it('skips a line that is JSON and not an entry', () => {
    expect(collapseRecords('{"case":"x"}\n[]\nnull\n42\n')).toEqual([]);
  });

  it('reads nothing from an empty file', () => {
    expect(collapseRecords('')).toEqual([]);
  });
});

describe('the step summary', () => {
  it('lists each case with its issue linked, and folds the drawing under the table', () => {
    const out = renderStepSummary(
      [
        entry({ case: 'structural-operations/b', issue: 255, differs: ['text', 'caret'], drawing: 'two' }),
        entry({ drawing: 'one' }),
      ],
      'owner/repo',
    );
    expect(out).toBe(
      [
        '### Known-failing cases still failing',
        '',
        'These cases wait on an open issue and passed because they still differ as recorded.',
        '',
        '| case | issue | platform | differs |',
        '|---|---|---|---|',
        '| `structural-operations/b` | [#255](https://github.com/owner/repo/issues/255) | desktop | text, caret |',
        '| `structural-operations/renumber` | [#228](https://github.com/owner/repo/issues/228) | desktop | text |',
        '',
        '<details><summary>structural-operations/b (#255, desktop)</summary>',
        '',
        '```',
        'two',
        '```',
        '',
        '</details>',
        '',
        '<details><summary>structural-operations/renumber (#228, desktop)</summary>',
        '',
        '```',
        'one',
        '```',
        '',
        '</details>',
        '',
      ].join('\n'),
    );
  });

  it('names the issue without a link when there is no repository', () => {
    expect(renderStepSummary([entry()])).toContain('| `structural-operations/renumber` | #228 | desktop | text |');
  });

  it('renders nothing for no entries', () => {
    expect(renderStepSummary([], 'owner/repo')).toBe('');
  });

  it('fences a drawing that holds backticks with a longer fence', () => {
    const out = renderStepSummary([entry({ drawing: 'a ``` b' })]);
    expect(out).toContain('````\na ``` b\n````');
  });

  it('escapes markup in a case name where it sits in HTML', () => {
    expect(renderStepSummary([entry({ case: 'a<b>&c' })])).toContain('<summary>a&lt;b&gt;&amp;c (#228, desktop)</summary>');
  });

  it('keeps a pipe in a case name inside its cell', () => {
    expect(renderStepSummary([entry({ case: 'a|b' })])).toContain('| `a\\|b` |');
  });
});

describe('reading a summary file', () => {
  it('takes the knownFailing list, and an empty one from a summary without it', () => {
    expect(entriesOf(JSON.stringify({ failures: [], knownFailing: [entry()] }))).toEqual([entry()]);
    expect(entriesOf(JSON.stringify({ failures: [] }))).toEqual([]);
    expect(entriesOf('not json')).toEqual([]);
    // An entry of another shape is left out, so a summary from another version renders what it can.
    expect(entriesOf(JSON.stringify({ knownFailing: [entry(), { case: 'x' }, null, 3] }))).toEqual([entry()]);
  });

  it('prints the summary of a file, and nothing for a run with none or a file that is not there', () => {
    const script = path.join(__dirname, '..', 'scripts', 'known-failing-summary.ts');
    const dir = mkdtempSync(path.join(tmpdir(), 'known-failing-'));
    const run = (file: string) =>
      execFileSync('node', [script, file], { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo' } });

    const some = path.join(dir, 'some.json');
    writeFileSync(some, JSON.stringify({ knownFailing: [entry()] }));
    expect(run(some)).toContain('[#228](https://github.com/owner/repo/issues/228)');

    const none = path.join(dir, 'none.json');
    writeFileSync(none, JSON.stringify({ failures: [], knownFailing: [] }));
    expect(run(none)).toBe('');
    expect(run(path.join(dir, 'missing.json'))).toBe('');
  });
});
