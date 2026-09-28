import { describe, expect, it } from 'vitest';
import { parseCase } from '../.agents/skills/presenting-examples/notation.mjs';
import {
  beforeMessage,
  compareState,
  phaseMessage,
  recordedCase,
  type CaseContext,
} from '../e2e-tests/case-report';
import type { EditorState } from '../e2e-tests/state-drawing';

const state = (text: string, anchor: number, head = anchor, extra: Partial<EditorState> = {}): EditorState => ({
  text,
  ranges: [{ anchor, head }],
  main: 0,
  blockLines: [],
  focused: true,
  ...extra,
});

const source = (keys: string, ...columns: string[]) => `keys: ${keys}\n\n${columns.join('\n')}\n`;
const ctxOf = (src: string): CaseContext => ({ name: 'grammar/tab', platform: 'desktop', parsed: parseCase(src) });

describe('comparing a state with an expected column', () => {
  const expected = (lines: string) => parseCase(`=== before\nx\n=== expected\n${lines}\n`).results[0]!;

  it('finds nothing when text and caret are as drawn', () => {
    expect(compareState(expected('- a┃'), state('- a\n', 3))).toEqual([]);
  });

  it('names a text difference', () => {
    expect(compareState(expected('- a┃'), state('- b\n', 3))).toEqual(['text']);
  });

  it('names a caret one character off', () => {
    expect(compareState(expected('- a┃'), state('- a\n', 2))).toEqual(['caret']);
  });

  it('compares the head as well as the anchor of a selection', () => {
    const e = expected('- «a»┃');
    expect(compareState(e, state('- a\n', 2, 3))).toEqual([]);
    expect(compareState(e, state('- a\n', 3, 2))).toEqual(['selection']);
    // The same anchor with the head one character short: only the head differs.
    const wide = expected('«ab»┃');
    expect(compareState(wide, state('ab\n', 0, 2))).toEqual([]);
    expect(compareState(wide, state('ab\n', 0, 1))).toEqual(['selection']);
  });

  it('compares the block-selected lines when the column draws ▒', () => {
    const e = expected('- a\n▒- b');
    expect(compareState(e, state('- a\n- b\n', 4, 7, { blockLines: [1] }))).toEqual([]);
    expect(compareState(e, state('- a\n- b\n', 4, 7, { blockLines: [0, 1] }))).toEqual(['block selection']);
    expect(compareState(e, state('- a\n- b\n', 7))).toEqual(['block selection']);
  });

  it('compares nothing about the caret when the column draws none', () => {
    expect(compareState(expected('- a'), state('- a\n', 0))).toEqual([]);
  });
});

describe('the message of a failing case', () => {
  const ctx = ctxOf(source('⇥', '=== before', '- a', '- b┃', '=== expected', '- a', '\t- ┃b'));

  it('opens with one line naming the case, what differs and the platform', () => {
    const message = phaseMessage(ctx, 0, ['text', 'caret'], state('- a\n    - b\n', 13));
    expect(message.split('\n')[0]).toBe('case grammar/tab differs in text, caret (desktop)');
  });

  it('draws before, expected and actual under the keys and setup', () => {
    const message = phaseMessage(ctx, 0, ['caret'], state('- a\n\t- b\n', 8));
    expect(message.split('\n').slice(1)).toEqual([
      'keys: ⇥ · outline on · tabs off',
      ' before    expected ⇥    actual ⇥',
      '┆- a      ┆- a          ┆- a',
      '┆- b┃     ┆⏵   - ┃b     ┆⏵   - b┃',
    ]);
  });

  it('says when the expected column drew no caret, and still draws the actual one', () => {
    const c = ctxOf(source('⇥', '=== before', '- a┃', '=== expected', '- b'));
    const message = phaseMessage(c, 0, ['text'], state('- a\n', 3));
    expect(message).toContain('(expected draws no caret or selection: none was compared)');
    expect(message).toContain('┆- a┃');
  });

  it('draws the first phase that differs and no later one', () => {
    const c = ctxOf(
      source('⇥ | ⇧⇥ | ↓', '=== before', 'a┃', '=== after ⇥', 'b┃', '=== after ⇧⇥', 'c┃', '=== after ↓', 'd┃'),
    );
    const message = phaseMessage(c, 1, ['text'], state('x\n', 1));
    expect(message).toContain('expected ⇧⇥');
    expect(message).toContain('actual ⇧⇥');
    expect(message).not.toContain('after');
    expect(message).not.toContain('d┃');
    expect(message).not.toContain('b┃');
  });

  it('names an unreachable before, drawing what the editor holds beside what was drawn', () => {
    const c = ctxOf(source('', '=== before', '-┃ a', '=== expected', '-┃ a'));
    const message = beforeMessage(c, state('- a\n', 2));
    expect(message.split('\n')[0]).toBe('case grammar/tab differs in before (desktop)');
    expect(message).toContain(' before    held');
    expect(message).toContain('┆-┃ a     ┆- ┃a');
  });

  it('lists the columns it ignored', () => {
    const c = ctxOf(source('⇥', '=== before', 'a┃', '=== actual', 'x', '=== this PR', 'y', '=== expected', 'z'));
    expect(phaseMessage(c, 0, ['text'], state('a\n', 1)).split('\n')[0]).toContain('[ignored columns: actual, this PR]');
  });

  it('notes several ranges and a missing focus in the actual column', () => {
    const many = state('ab\n', 1, 1, { ranges: [{ anchor: 1, head: 1 }, { anchor: 2, head: 2 }], focused: false });
    const message = phaseMessage(ctx, 0, ['text'], many);
    expect(message).toContain('(actual: 2 ranges; the main one is drawn)');
    expect(message).toContain('(actual: the editor does not have focus)');
  });
});

describe('recording', () => {
  it('fills the result columns from the states, one per phase, under the keys line', () => {
    const parsed = parseCase(source('⇥ | ⇧⇥', '=== before', '- a', '- b┃'), { record: true });
    const out = recordedCase(parsed, [state('- a\n\t- b\n', 8), state('- a\n- b\n', 7)]);
    expect(out).toBe(
      ['keys: ⇥ | ⇧⇥', '', '=== before', '- a', '- b┃', '=== after ⇥', '- a', '\t- b┃', '=== after ⇧⇥', '- a', '- b┃', ''].join('\n'),
    );
    const again = parseCase(out);
    expect(again.results.map((r) => r.text)).toEqual(['- a\n\t- b\n', '- a\n- b\n']);
  });

  it('keeps the settings, the title and a clipboard that has no final newline', () => {
    const parsed = parseCase(
      'case: t\ntabs: on\nplatform: mobile\nkeys: ⌘V\n\n=== clipboard\nx┃∅\n=== before\na┃\n=== expected\nb\n',
    );
    const out = recordedCase(parsed, [state('ax\n', 2)]);
    expect(out.split('\n').slice(0, 8)).toEqual(['case: t', 'tabs: on', 'platform: mobile', 'keys: ⌘V', '', '=== clipboard', 'x∅', '=== before']);
    expect(parseCase(out).clipboard).toBe('x');
  });
});
