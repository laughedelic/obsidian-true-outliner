import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  setStillRootedResolver,
  setVisibleBoundsResolver,
  zoomAnchorField,
  zoomTo,
} from '../src/plugin/zoom-state';
import { parse } from '../src/parse';
import { resolveZoom } from '../src/zoom';

/**
 * `stillRooted`, wired for real (matching `zoom-scope.ts`'s own resolver body).
 * Answers "does a node start at this exact line" — the question a reviewed
 * comment on `zoom-state.ts` pointed out is the WRONG one for telling a
 * survived root apart from a different node that merely landed on its old
 * line (`outline-zoom` PR #69, review comment on `zoom-state.ts:69`).
 */
function realStillRooted(state: EditorState, anchor: number): boolean {
  if (anchor < 0 || anchor > state.doc.length) return false;
  const line = state.doc.lineAt(anchor).number - 1;
  const doc = parse(state.doc.toString());
  const scope = resolveZoom(doc, line);
  return scope !== null && scope.startLine === line;
}

describe('the deletion trigger does not depend on the outside-range trigger catching it first', () => {
  /**
   * `touchesOutside` (trigger 2) is bounded by whatever `visibleBounds`
   * reports, and in the real plugin that bound always ends one character
   * short of a following sibling — CM6's `Line.to` never includes its own
   * terminating newline, so consuming the separator that lets a sibling
   * slide onto the root's old line always also trips trigger 2, whichever
   * node ends up there. That coupling is a property of THIS bounds formula,
   * not of the deletion check itself — so this test wires a resolver that
   * DOESN'T have it: bounds generous enough to let the separator through,
   * isolating trigger 1a (the deletion check) from trigger 2 (the outside-
   * range check) so a change to either implementation cannot quietly stop
   * testing the other.
   */
  it('still exits, rather than retargets, when a generous outside-range bound lets the deletion through', () => {
    const D = '- one\n  - nested\n- two\n';
    const rootEnd = D.indexOf('- two'); // one past the root's own last line

    setVisibleBoundsResolver((state, anchor) => {
      if (anchor < 0 || anchor > state.doc.length) return null;
      const doc = parse(state.doc.toString());
      const scope = resolveZoom(doc, state.doc.lineAt(anchor).number - 1);
      if (!scope) return null;
      // Deliberately generous: extends past the real cover, all the way
      // through the separator before the next sibling — the one property
      // the production resolver does NOT have, and the one this test needs
      // to isolate trigger 1a.
      return { from: 0, to: rootEnd };
    });
    setStillRootedResolver(realStillRooted);

    let state = EditorState.create({ doc: D, extensions: [zoomAnchorField] });
    state = state.update({ effects: zoomTo.of(0) }).state;
    expect(state.field(zoomAnchorField)).toBe(0);

    // Deletes the root's own two lines, trailing newline included — `- two`
    // slides up to start exactly where `- one` did. A real node starts
    // there, so a resolver asking only "does a node start on this line"
    // would answer yes and retarget; the anchor must clear instead.
    const next = state.update({ changes: { from: 0, to: rootEnd, insert: '' } }).state;
    expect(next.doc.toString()).toBe('- two\n');
    expect(next.field(zoomAnchorField)).toBeNull();
  });

  it('negative control: without the deletion check, the same edit silently retargets', () => {
    // Same setup as above, but `stillRooted` alone — no deletion check —
    // answers the way `zoomAnchorField.update` would if trigger 1a were
    // removed: "does a node start here", full stop. This is what the review
    // comment described, reproduced directly against the resolver contract
    // rather than through `zoomAnchorField`'s own (now-fixed) reducer.
    const D = '- one\n  - nested\n- two\n';
    const rootEnd = D.indexOf('- two');
    const doc = parse(D);
    const before = resolveZoom(doc, 0)!;
    expect(before.root.lines[0]).toBe('- one');

    const after = parse(D.slice(rootEnd));
    const mappedLine = 0; // forward-mapped anchor after deleting [0, rootEnd)
    const retargeted = resolveZoom(after, mappedLine);
    // `stillRooted`'s own question, answered by hand: a node DOES start on
    // line 0 of the post-deletion document — just not the one that was
    // zoomed into.
    const wouldSurvive = retargeted !== null && retargeted.startLine === mappedLine;
    expect(wouldSurvive).toBe(true);
    expect(retargeted!.root.lines[0]).toBe('- two');
    expect(retargeted!.root.id).not.toBe(before.root.id);
  });
});
