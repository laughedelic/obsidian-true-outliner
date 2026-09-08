import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  setChangeEscapesResolver,
  setVisibleBoundsResolver,
  zoomAnchorField,
  zoomTo,
} from '../src/plugin/zoom-state';
import { parse } from '../src/parse';
import { resolveZoom } from '../src/zoom';

describe('the deletion trigger does not depend on the escape trigger catching it first', () => {
  /**
   * Trigger 1a and the escape trigger beside it can each catch a whole-subtree
   * deletion, and a test that leaves both wired cannot say which one did. So
   * this one disables the other: an escape resolver that never reports an
   * escape, plus bounds generous enough that nothing about the range can be
   * doing the work either. What is left is trigger 1a alone.
   */
  it('still exits, rather than retargets, with the escape trigger disabled', () => {
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
    setChangeEscapesResolver(() => false);

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

  it('negative control: nothing else in the field can catch this deletion', () => {
    // Why trigger 1a cannot be folded into the escape predicate. After the
    // deletion, `- two` occupies the root's old line, and BOTH of the questions
    // the predicate could ask about identity answer "unchanged":
    //
    //   - does a node start on that line?  yes — `- two` does
    //   - does it hold the root's position in the tree? yes — `- one` was the
    //     first top-level node and `- two` is now the first top-level node
    //
    // Only "was the whole cover removed" separates a deleted root from a
    // surviving one here, which is why it is asked first and asked about the
    // CHANGE rather than about the after-state.
    const D = '- one\n  - nested\n- two\n';
    const rootEnd = D.indexOf('- two');
    const doc = parse(D);
    const before = resolveZoom(doc, 0)!;
    expect(before.root.lines[0]).toBe('- one');

    const after = parse(D.slice(rootEnd));
    const mappedLine = 0; // forward-mapped anchor after deleting [0, rootEnd)
    const retargeted = resolveZoom(after, mappedLine);
    expect(retargeted).not.toBeNull();
    expect(retargeted!.startLine).toBe(mappedLine);
    expect(retargeted!.path).toEqual(before.path);
    // A different node, all the same.
    expect(retargeted!.root.lines[0]).toBe('- two');
    expect(retargeted!.root.id).not.toBe(before.root.id);
  });
});
