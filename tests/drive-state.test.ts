import { execFileSync } from 'node:child_process';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { drawColumns, stateMarkup, stateNotes } from '../scripts/drive-state.ts';
import { readDocument } from '../scripts/notation.ts';

const caret = (at: number) => ({ anchor: at, head: at });
const draw = (doc: string, ranges: { anchor: number; head: number }[], blockLines: number[] = [], main = 0) =>
  stateMarkup(doc, ranges, main, blockLines);

describe('stateMarkup', () => {
  it('puts the caret at the end of a line', () => {
    expect(draw('- a\n- b\n', [caret(3)])).toBe('- a┃\n- b');
  });

  it('marks the end of the document after the last text without a final newline', () => {
    expect(draw('- a\n- b', [caret(7)])).toBe('- a\n- b┃∅');
    expect(draw('- a\n- b', [caret(1)])).toBe('-┃ a\n- b∅');
  });

  it('leaves the end of the document to the reader after a single final newline', () => {
    expect(draw('- a\n', [caret(4)])).toBe('- a\n┃∅');
    expect(draw('- a\n', [caret(1)])).toBe('-┃ a');
  });

  it('draws an empty document', () => {
    expect(draw('', [caret(0)])).toBe('┃∅');
  });

  it('draws a selection inside one line, with the caret at its head', () => {
    expect(draw('- a big b', [{ anchor: 4, head: 7 }])).toBe('- a «big»┃ b∅');
    expect(draw('- a big b', [{ anchor: 7, head: 4 }])).toBe('- a ┃«big» b∅');
  });

  it('draws a selection across lines as one « and one »', () => {
    // "- one\n- two\n- three": from "ne" to the "th" of "three"
    expect(draw('- one\n- two\n- three', [{ anchor: 3, head: 16 }])).toBe('- o«ne\n- two\n- th»┃ree∅');
    expect(draw('- a\n- b\n- c\n', [{ anchor: 2, head: 9 }])).toBe('- «a\n- b\n-»┃ c');
    expect(draw('- a\n- b\n- c\n', [{ anchor: 9, head: 2 }])).toBe('- ┃«a\n- b\n-» c');
  });

  it('draws the main range and leaves the others out', () => {
    const ranges = [caret(3), { anchor: 4, head: 7 }];
    expect(draw('- a\n- b', ranges, [], 1)).toBe('- a\n«- b»┃∅');
    expect(draw('- a\n- b', ranges, [], 0)).toBe('- a┃\n- b∅');
  });

  it('opens a block-selected line with ▒ and draws no caret or selection', () => {
    expect(draw('- a\n- b\n', [{ anchor: 4, head: 8 }], [1])).toBe('- a\n▒- b');
    expect(draw('- a\n- b', [{ anchor: 0, head: 7 }], [0, 1])).toBe('▒- a\n▒- b∅');
  });

  it('leaves tabs and trailing spaces for the layout to draw', () => {
    expect(draw('- a\n\t- b ', [caret(9)])).toBe('- a\n\t- b ┃∅');
  });
});

describe('stateNotes', () => {
  it('says nothing for one range', () => {
    expect(stateNotes([caret(0)])).toEqual([]);
  });

  it('counts the ranges when there are several', () => {
    expect(stateNotes([caret(1), caret(5), caret(6)])).toEqual(['3 ranges; the main one is drawn']);
  });
});

describe('what stateMarkup prints reads back as a column', () => {
  // The alphabet has no notation glyphs; it does have the newlines and tabs that end and
  // indent lines.
  const documents = fc
    .array(fc.constantFrom('a', 'b', ' ', '-', '\t', '\n'), { maxLength: 30 })
    .map((chars) => chars.join(''));
  const cases = documents.chain((doc) =>
    fc.record({
      doc: fc.constant(doc),
      anchor: fc.integer({ min: 0, max: doc.length }),
      head: fc.integer({ min: 0, max: doc.length }),
    }),
  );

  /** The drawing this file replaced: every line carries its own «…», so a selection across lines
   * states several. */
  function perLine(doc: string, range: { anchor: number; head: number }): string {
    const from = Math.min(range.anchor, range.head);
    const to = Math.max(range.anchor, range.head);
    let start = 0;
    const lines = doc.split('\n').map((text) => {
      const s = Math.max(start, from) - start;
      const e = Math.min(start + text.length, to) - start;
      const out = s < e ? `${text.slice(0, s)}«${text.slice(s, e)}»${text.slice(e)}` : text;
      start += text.length + 1;
      return out;
    });
    return lines.join('\n');
  }

  const reads = (markup: string, doc: string, range: { anchor: number; head: number }): boolean => {
    try {
      const read = readDocument(markup.split('\n'));
      return read.text === doc && read.selection?.anchor === range.anchor && read.selection.head === range.head;
    } catch {
      return false;
    }
  };

  it('gives back the text and the range', () => {
    fc.assert(
      fc.property(cases, ({ doc, anchor, head }) => {
        const range = { anchor, head };
        expect(reads(draw(doc, [range]), doc, range)).toBe(true);
      }),
    );
  });

  it('is a property the per-line drawing fails', () => {
    expect(() =>
      fc.assert(
        fc.property(cases, ({ doc, anchor, head }) => {
          const range = { anchor, head };
          expect(reads(perLine(doc, range), doc, range)).toBe(true);
        }),
      ),
    ).toThrow();
  });

  it('reads back a state with several ranges as its main range', () => {
    const markup = draw('- a\n- b\n- c\n', [caret(1), { anchor: 2, head: 9 }, caret(5)], [], 1);
    expect(readDocument(markup.split('\n'))).toEqual({
      text: '- a\n- b\n- c\n',
      selection: { anchor: 2, head: 9 },
      blockLines: [],
    });
  });
});

describe('drawColumns', () => {
  const layout = 'scripts/layout.ts';
  const cases: Record<string, { header: string; text: string }[]> = {
    'one column': [{ header: 'state', text: '- a┃\n\t- b \n∅' }],
    'before and after': [
      { header: 'before', text: '- a\n▒- b\n∅' },
      { header: 'after', text: '- a┃\n∅' },
    ],
    'a selection, tabs, spaces and three columns': [
      { header: 'clipboard', text: '- x\n  - y' },
      { header: 'before', text: '- «big»┃ c\n\t- d  \n  \n∅' },
      { header: 'actual', text: '\t\t- e┃\n\n' },
    ],
  };

  it.each(Object.entries(cases))('matches layout.ts: %s', (_name, columns) => {
    const stdin = columns.map((c) => `=== ${c.header}\n${c.text}\n`).join('\n');
    const expected = execFileSync(process.execPath, [layout, '--columns'], { input: stdin, encoding: 'utf8' }).replace(/\n$/, '');
    expect(drawColumns(columns)).toBe(expected);
  });

  it('draws a block-selected line with ▒ in place of the edge', () => {
    expect(drawColumns([{ header: 'state', text: '- a\n▒- b\n∅' }])).toBe(' state\n┆- a\n▒- b\n┆∅');
  });
});
