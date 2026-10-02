import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { OutlineDoc } from '../src/model';
import { parse } from '../src/parse';
import type { OpOutput } from '../src/ops';
import { applications, emptyTally, firstSeamContinued, generateNotes, tallyOne } from './seam-oracle';

/**
 * The seam oracle (`created-seams-are-separated`, design D11), captured at
 * `finalize`'s encode: the last encode an operation runs is of the tree it
 * wrote, with the surgery's node ids.
 */
const encoded = vi.hoisted(() => ({ last: undefined as OutlineDoc | undefined, pass: true }));
vi.mock('../src/encode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/encode')>();
  return {
    ...actual,
    encode: (doc: OutlineDoc) => {
      encoded.last = doc;
      return actual.encode(doc);
    },
  };
});

/** The edit-site pass, switched off to measure today's operations. */
vi.mock('../src/edit-site', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/edit-site')>();
  return {
    ...actual,
    separateEditSite: (before: OutlineDoc, surgery: OutlineDoc) =>
      encoded.pass ? actual.separateEditSite(before, surgery) : surgery,
  };
});

const NOTES = Number(process.env.SEAM_ORACLE_NOTES ?? 60);

function sweep(seed: number, pass: boolean) {
  encoded.pass = pass;
  const tally = emptyTally();
  for (const note of generateNotes(seed, NOTES, 8)) {
    const doc = parse(note);
    for (const { name, run } of applications(doc)) {
      tally.applications++;
      encoded.last = undefined;
      const result = run() as { ok: boolean; value?: OpOutput };
      if (!result.ok || !encoded.last || !result.value) continue;
      tallyOne(tally, name, doc, encoded.last, result.value.doc);
    }
  }
  return tally;
}

/**
 * The rows of `docs/research/lazy-continuation-at-seams`'s tables, flush: a
 * line is continued where CommonMark or reading mode puts it inside the block
 * above.
 */
describe('the reader model', () => {
  const rows: [string, string, boolean][] = [
    ['> q', 'para', true],
    ['> q', 'a | b', true],
    ['> q', '<span>x</span>', true],
    ['> q', '<div>x</div>', false],
    ['> q', '2. x', true],
    ['> q', '# heading', false],
    ['> q', '```\nk\n```', false],
    ['> q', '- x', false],
    ['> q', '1. x', false],
    ['> [!note] c', 'para', true],
    ['> [!note] c', '2. x', true],
    ['- item', 'para', true],
    ['- item', '<div>x</div>', true],
    ['- item', '> quote', true],
    ['- item', '# heading', false],
    ['- item', '2. x', false],
    ['1. item', 'para', true],
    ['para', '> quote', false],
    ['# H', 'para', false],
  ];
  it.each(rows)('%s above %s', (block, next, expected) => {
    expect(firstSeamContinued(`${block}\n${next}\n`)).toBe(expected);
  });

  it('continues nothing across a blank line', () => {
    for (const [block, next] of rows) expect(firstSeamContinued(`${block}\n\n${next}\n`)).toBe(false);
  });
});

describe('the seam oracle', () => {
  const today = sweep(1, false);
  const passed = sweep(1, true);
  if (process.env.SEAM_ORACLE_OUT) {
    writeFileSync(process.env.SEAM_ORACLE_OUT, JSON.stringify({ today, passed }, null, 2));
  }

  it('finds seams at the edit site that a reader continues without the pass', () => {
    expect(today.continuedAtSite).toBeGreaterThan(0);
    expect(today.awayChanged).toBeGreaterThan(0);
  });

  it('leaves no seam at the edit site that a reader continues', () => {
    expect(passed.continuedAtSite).toBe(0);
  });

  it('leaves every seam away from the edit site as written, save what the parse requires', () => {
    expect(passed.awayChanged).toBe(passed.awayFloor + passed.away255 + passed.awayIdFloor);
  });

  it('turns no list tight or loose, moves no id and writes no indented code that today does not', () => {
    expect(passed.looseFlips).toBeLessThanOrEqual(today.looseFlips);
    expect(passed.idMoves).toBeLessThanOrEqual(today.idMoves);
    expect(passed.indentedCode).toBe(0);
  });
});
