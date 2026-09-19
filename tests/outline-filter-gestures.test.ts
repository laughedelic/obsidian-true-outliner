/**
 * `docs/research/zoom-editing-boundary`'s gesture catalogue, walked under a
 * frozen match set.
 *
 * That catalogue asked what each gesture does to a ZOOM's single visible range.
 * The same gestures are re-asked here of a filter's anchors, because what
 * `outline-filter` D2 claims — that mapping alone gives the spec's visible set —
 * is true for some of them and not others, and which is which is what settled
 * the added-anchor rule (task 1.2).
 *
 * Modelled as the CHANGES each gesture dispatches, plus the caret each leaves
 * behind, rather than driven through a real editor: an anchor knows nothing
 * about keystrokes, only about the change set it is mapped through and where
 * the caret came to rest. The shapes come from the catalogue's own recorded
 * results, and the carets from where the gesture puts them.
 *
 * The findings table is in `docs/research/outline-filter-spike.md`.
 */

import { describe, expect, it } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { outlineStateExtension } from '../src/plugin/outline-state';
import {
  filterQuerySet,
  outlineFilterStateExtension,
  unguardedFilterVisibleSpans as filterVisibleSpans,
} from '../src/plugin/outline-filter-state';

/** The catalogue's LIST fixture, with the match given a name of its own. */
const LIST = ['- alpha', '- beta', '  - kid', '- gamma', ''].join('\n');

function filtered(doc: string, query: string): EditorState {
  const base = EditorState.create({
    doc,
    extensions: [
      outlineStateExtension({ outlineByDefault: true }),
      outlineFilterStateExtension(),
    ] as Extension,
  });
  return base.update({ effects: filterQuerySet.of(query) }).state;
}

function visibleLines(state: EditorState): string[] {
  const spans = filterVisibleSpans(state);
  if (!spans) return [];
  const lines = state.doc.toString().split('\n');
  return spans.flatMap((s) => lines.slice(s.fromLine, s.toLine));
}

/** Offsets of a line, by its exact text. */
function lineAt(state: EditorState, text: string): { from: number; to: number } {
  const lines = state.doc.toString().split('\n');
  const n = lines.indexOf(text);
  if (n < 0) throw new Error(`no line ${JSON.stringify(text)}`);
  return state.doc.line(n + 1);
}

/** Where a list item's own text begins, past its marker. */
function contentStart(state: EditorState, text: string): number {
  return lineAt(state, text).from + (/^\s*[-+*] /.exec(text)?.[0].length ?? 0);
}

/** A gesture: the changes it dispatches, and the caret it leaves behind. */
function gesture(
  state: EditorState,
  changes: { from: number; to?: number; insert?: string },
  head: number,
): EditorState {
  return state.update({ changes, selection: { anchor: head } }).state;
}

describe('the catalogue under a frozen match set: mapping is enough', () => {
  it('B1 — Delete at the end of a match pulls a hidden node in, and keeps the match', () => {
    const state = filtered(LIST, 'beta');
    expect(visibleLines(state)).toEqual(['- beta']);
    const from = lineAt(state, '- beta').to;
    const to = contentStart(state, '  - kid');
    expect(visibleLines(gesture(state, { from, to, insert: '' }, from))).toEqual(['- betakid']);
  });

  it('G1 — a paste inside a match leaves the anchor where it was', () => {
    const state = filtered(LIST, 'beta');
    const at = contentStart(state, '- beta');
    expect(visibleLines(gesture(state, { from: at, insert: 'pasted ' }, at + 7))).toEqual([
      '- pasted beta',
    ]);
  });

  it('X5 — typing into a match keeps it visible, and adds no anchor per keystroke', () => {
    const state = filtered(LIST, 'beta');
    const at = lineAt(state, '- beta').to;
    const typed = gesture(state, { from: at, insert: 'X' }, at + 1);
    expect(visibleLines(typed)).toEqual(['- betaX']);
    // The caret's line already carries one, so the rule declines to add another.
    expect(filterVisibleSpans(typed)).toHaveLength(1);
  });

  it('an edit ABOVE a match carries the anchor with it', () => {
    const state = filtered(LIST, 'beta');
    expect(visibleLines(gesture(state, { from: 0, insert: '- added\n' }, 8))).toEqual(['- beta']);
  });

  it('E2 — deleting a match with its subtree drops the anchor', () => {
    const state = filtered(LIST, 'beta');
    const from = lineAt(state, '- beta').from;
    const to = lineAt(state, '- gamma').from;
    // The caret lands where the deletion collapsed to, which holds no text the
    // gesture wrote, so nothing is re-anchored.
    expect(visibleLines(gesture(state, { from, to, insert: '' }, from))).toEqual([]);
  });
});

describe('the catalogue under a frozen match set: the added-anchor rule', () => {
  it('X6 — a split keeps the far half, which holds no anchor of its own', () => {
    // Enter in the middle of a match's text. The mapped anchor stays with the
    // first half; the caret is in the second, and that is what keeps it.
    const state = filtered(LIST, 'beta');
    const at = contentStart(state, '- beta') + 2;
    expect(visibleLines(gesture(state, { from: at, insert: '\n- ' }, at + 3))).toEqual([
      '- be',
      '- ta',
    ]);
  });

  it('X2 — Enter at the end of a match keeps the node it creates', () => {
    const state = filtered(LIST, 'beta');
    const at = lineAt(state, '- beta').to;
    expect(visibleLines(gesture(state, { from: at, insert: '\n- fresh' }, at + 8))).toEqual([
      '- beta',
      '- fresh',
    ]);
  });

  it('A1 — a Backspace merge into a hidden node keeps the node carrying the text', () => {
    // The whole of `\n- ` goes, and the mapped anchor with it. Without the rule
    // the view empties on a keystroke that only joined two lines, while the
    // reader's text sits in a node the filter has no anchor for.
    const state = filtered(LIST, 'beta');
    const from = lineAt(state, '- alpha').to;
    const to = contentStart(state, '- beta');
    const merged = gesture(state, { from, to, insert: '' }, from);
    expect(merged.doc.toString()).toContain('- alphabeta');
    expect(visibleLines(merged)).toEqual(['- alphabeta']);
  });

  it('R7 — Mod-Backspace clearing the last match renders the note whole', () => {
    // The one row the rule cannot rescue, and it does not try: the marker goes
    // with the text, so the line is blank and no node owns it. With no anchor
    // left the filter has nothing to show, and the note comes back rather than
    // leaving an editor with no line in it.
    const state = filtered(LIST, 'beta');
    const line = lineAt(state, '- beta');
    const cleared = gesture(state, { from: line.from, to: line.to, insert: '' }, line.from);
    expect(filterVisibleSpans(cleared)).toBeNull();
  });
});
