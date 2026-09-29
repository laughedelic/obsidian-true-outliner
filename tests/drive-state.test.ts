import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { drawColumns, stateMarkup } from '../scripts/drive-state.ts';

const none = new Set<number>();
const caret = (at: number) => ({ anchor: at, head: at });

describe('stateMarkup', () => {
  it('puts the caret at the end of a line', () => {
    expect(stateMarkup('- a\n- b\n', [caret(3)], none)).toBe('- a┃\n- b\n∅');
  });

  it('marks the end of the document after the last text without a final newline', () => {
    expect(stateMarkup('- a\n- b', [caret(7)], none)).toBe('- a\n- b┃∅');
    expect(stateMarkup('- a\n- b', [caret(1)], none)).toBe('-┃ a\n- b∅');
  });

  it('puts the end of the document on a line of its own after a final newline', () => {
    expect(stateMarkup('- a\n', [caret(4)], none)).toBe('- a\n┃∅');
    expect(stateMarkup('- a\n', [caret(1)], none)).toBe('-┃ a\n∅');
  });

  it('draws an empty document', () => {
    expect(stateMarkup('', [caret(0)], none)).toBe('┃∅');
  });

  it('underlines a selection inside one line, with the caret at its head', () => {
    expect(stateMarkup('- a big b', [{ anchor: 4, head: 7 }], none)).toBe('- a «big»┃ b∅');
    expect(stateMarkup('- a big b', [{ anchor: 7, head: 4 }], none)).toBe('- a ┃«big» b∅');
  });

  it('underlines the part of each line a selection covers', () => {
    // "- one\n- two\n- three": from "ne" to the "th" of "three"
    expect(stateMarkup('- one\n- two\n- three', [{ anchor: 3, head: 16 }], none)).toBe(
      '- o«ne»\n«- two»\n«- th»┃ree∅',
    );
  });

  it('draws every range', () => {
    expect(stateMarkup('- a\n- b', [caret(3), { anchor: 4, head: 7 }], none)).toBe('- a┃\n«- b»┃∅');
  });

  it('opens a block-selected line with ▒ and draws no caret or underline on it', () => {
    expect(stateMarkup('- a\n- b\n', [{ anchor: 4, head: 8 }], new Set([1]))).toBe('- a\n▒- b\n∅');
    expect(stateMarkup('- a\n- b', [{ anchor: 0, head: 7 }], new Set([0, 1]))).toBe('▒- a\n▒- b∅');
  });

  it('leaves tabs and trailing spaces for the layout to draw', () => {
    expect(stateMarkup('- a\n\t- b ', [caret(9)], none)).toBe('- a\n\t- b ┃∅');
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
    const expected = execFileSync(process.execPath, [layout], { input: stdin, encoding: 'utf8' }).replace(/\n$/, '');
    expect(drawColumns(columns)).toBe(expected);
  });

  it('draws a block-selected line with ▒ in place of the edge', () => {
    expect(drawColumns([{ header: 'state', text: '- a\n▒- b\n∅' }])).toBe(' state\n┆- a\n▒- b\n┆∅');
  });
});
