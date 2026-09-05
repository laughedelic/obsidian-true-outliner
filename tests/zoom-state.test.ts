import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { zoomAnchorField, zoomCleared, zoomTo } from '../src/plugin/zoom-state';
import { parse } from '../src/parse';
import { resolveZoom } from '../src/zoom';

const DOC = `# Top

## Mid

- one
  - nested
`;

/** Offset of the first line containing `needle`. */
function offsetOf(text: string, needle: string): number {
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l.includes(needle));
  if (idx < 0) throw new Error(`no line containing ${JSON.stringify(needle)}`);
  return lines.slice(0, idx).reduce((acc, l) => acc + l.length + 1, 0);
}

function stateAt(text: string, needle: string): EditorState {
  const base = EditorState.create({ doc: text, extensions: [zoomAnchorField] });
  return base.update({ effects: zoomTo.of(offsetOf(text, needle)) }).state;
}

/** The node a state's anchor currently resolves to, by first line. */
function rootHeadOf(state: EditorState): string | null {
  const anchor = state.field(zoomAnchorField);
  if (anchor === null) return null;
  const scope = resolveZoom(parse(state.doc.toString()), state.doc.lineAt(anchor).number - 1);
  return scope ? (scope.root.lines[0] ?? '') : null;
}

describe('zoomAnchorField: the one piece of mapped state', () => {
  it('holds the anchor a zoomTo effect sets, and clears on zoomCleared', () => {
    const state = stateAt(DOC, '## Mid');
    expect(state.field(zoomAnchorField)).toBe(offsetOf(DOC, '## Mid'));
    const cleared = state.update({ effects: zoomCleared.of(null) }).state;
    expect(cleared.field(zoomAnchorField)).toBeNull();
  });

  it('starts with no zoom', () => {
    const state = EditorState.create({ doc: DOC, extensions: [zoomAnchorField] });
    expect(state.field(zoomAnchorField)).toBeNull();
  });

  it('follows an insertion ABOVE the root', () => {
    const state = stateAt(DOC, '## Mid');
    const next = state.update({ changes: { from: 0, insert: 'Added above.\n\n' } }).state;
    expect(rootHeadOf(next)).toBe('## Mid');
  });

  it('is unmoved by an insertion BELOW the root', () => {
    const state = stateAt(DOC, '## Mid');
    const next = state.update({
      changes: { from: state.doc.length, insert: '\nAdded below.\n' },
    }).state;
    expect(next.field(zoomAnchorField)).toBe(state.field(zoomAnchorField));
    expect(rootHeadOf(next)).toBe('## Mid');
  });

  it('follows an insertion INSIDE the root own text', () => {
    const state = stateAt(DOC, '## Mid');
    const anchor = state.field(zoomAnchorField)!;
    // After the `## `, so the root's own line grows without moving.
    const next = state.update({ changes: { from: anchor + 3, insert: 'New ' } }).state;
    expect(next.doc.toString()).toContain('## New Mid');
    expect(rootHeadOf(next)).toBe('## New Mid');
  });

  it('survives a deletion above the root', () => {
    const state = stateAt(DOC, '## Mid');
    const next = state.update({ changes: { from: 0, to: offsetOf(DOC, '## Mid') } }).state;
    expect(rootHeadOf(next)).toBe('## Mid');
  });

  it('a zoomTo in the same transaction as a change wins over mapping', () => {
    const state = stateAt(DOC, '## Mid');
    const target = offsetOf(DOC, '- one');
    const next = state.update({
      changes: { from: 0, insert: 'x' },
      effects: zoomTo.of(target),
    }).state;
    expect(next.field(zoomAnchorField)).toBe(target);
  });
});

describe('forward association is load-bearing, not a preference', () => {
  /**
   * The claim an earlier draft of design D1 got wrong: that the `assoc`
   * argument could not change which node resolves, because the anchor is only
   * ever consumed as "which line is this".
   *
   * Both halves are asserted. First that the two associations genuinely
   * DISAGREE on this input, so the choice is observable — a test that only
   * checked the forward answer would still pass if `mapPos`'s behaviour changed
   * such that association stopped mattering, and would then be asserting
   * nothing. Second that the forward one is the correct answer, which is what
   * fails if the source is switched back to CodeMirror's default of -1.
   */
  it('an inserted newline at the root line start splits the two associations', () => {
    const state = stateAt(DOC, '## Mid');
    const anchor = state.field(zoomAnchorField)!;
    const tr = state.update({ changes: { from: anchor, insert: 'Pasted.\n' } });

    const forward = tr.changes.mapPos(anchor, 1);
    const backward = tr.changes.mapPos(anchor, -1);
    expect(forward).not.toBe(backward);

    const text = tr.state.doc.toString();
    const lineOf = (pos: number): string => tr.state.doc.lineAt(pos).text;
    expect(text).toContain('Pasted.');
    // The negative control, stated as an assertion rather than left implicit:
    // backward association lands on the INSERTED line.
    expect(lineOf(backward)).toBe('Pasted.');
    expect(lineOf(forward)).toBe('## Mid');

    // And the field itself uses the forward one.
    expect(tr.state.field(zoomAnchorField)).toBe(forward);
    expect(rootHeadOf(tr.state)).toBe('## Mid');
  });

  it('a plain insertion with no newline resolves the same either way', () => {
    const state = stateAt(DOC, '## Mid');
    const anchor = state.field(zoomAnchorField)!;
    const tr = state.update({ changes: { from: anchor, insert: '> ' } });
    const forward = tr.changes.mapPos(anchor, 1);
    const backward = tr.changes.mapPos(anchor, -1);
    expect(tr.state.doc.lineAt(forward).number).toBe(tr.state.doc.lineAt(backward).number);
  });
});
