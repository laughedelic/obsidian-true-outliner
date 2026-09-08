import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { escapesZoom } from '../src/plugin/zoom-enforce';
import { footprintOf, visibleBoundsOf } from '../src/plugin/zoom-state';
import { computeVerdict, type EditFact } from '../src/enforce';
import { parse } from '../src/parse';
import { resolveZoom } from '../src/zoom';

/**
 * The seam where a zoom refusal is substituted for a verdict
 * (`outline-zoom`, design D3).
 *
 * `escapesZoom` takes the scope rather than resolving it, which is what makes
 * it reachable here at all — resolving needs `editorInfoField`, and nothing
 * else in the function does.
 */
const LIST = '- alpha\n- beta\n  - beta child\n- gamma\n';

/** A transaction over `LIST`, and the pieces `escapesZoom` reads from one. */
function change(spec: { from: number; to: number; insert: string }) {
  const state = EditorState.create({ doc: LIST });
  const tr = state.update({ changes: spec });
  return { startState: { doc: state.doc }, changes: tr.changes, newDoc: tr.newDoc };
}

const scopeOf = (line: number) => {
  const scope = resolveZoom(parse(LIST), line);
  if (!scope) throw new Error('no scope');
  return scope;
};

describe('escapesZoom', () => {
  const before = parse(LIST);

  it('judges a PASS verdict, not only a rewrite', () => {
    // The verdict layer leaves plenty of shapes alone; a pass still lands in the
    // document, so it is still judged. Here the raw change deletes the hidden
    // `- alpha` above the zoom root.
    const tr = change({ from: 0, to: 8, insert: '' });
    expect(escapesZoom(tr, scopeOf(1), before, { kind: 'pass' })).toBe(true);
  });

  it('leaves an in-scope PASS alone', () => {
    const tr = change({ from: 14, to: 14, insert: 'X' }); // typed into the root
    expect(escapesZoom(tr, scopeOf(1), before, { kind: 'pass' })).toBe(false);
  });

  it('does nothing when no zoom is active', () => {
    const tr = change({ from: 0, to: 8, insert: '' });
    expect(escapesZoom(tr, null, before, { kind: 'pass' })).toBe(false);
  });

  describe('an existing veto keeps its own reason', () => {
    it('returns before consulting anything else', () => {
      // MECHANISM, not outcome. A veto verdict must short-circuit, so this
      // hands it a transaction whose every field throws: reaching any of them
      // fails the test loudly instead of returning a plausible `false`.
      const exploding = new Proxy({} as never, {
        get() {
          throw new Error('escapesZoom looked at the transaction for an existing veto');
        },
      });
      expect(
        escapesZoom(exploding, scopeOf(1), before, { kind: 'veto', reason: 'no-following-neighbor' }),
      ).toBe(false);
    });

    it('is what leaves the first-node Backspace its own cue', () => {
      // The zoom root IS the document's first node, so `node-edit-enforcement`
      // vetoes the merge for having no predecessor. The zoom check must not
      // relabel it: the user is told nothing is above to join with, which is
      // true and more useful than "that would leave the zoomed view".
      const edit: EditFact = {
        from: { line: 0, ch: 1 },
        to: { line: 0, ch: 2 },
        insert: '',
        cursorBefore: { line: 0, ch: 2 },
      };
      const verdict = computeVerdict('boundary-crossing-edit', before, edit);
      expect(verdict).toEqual({ kind: 'veto', reason: 'no-following-neighbor' });
      expect(escapesZoom(change({ from: 1, to: 2, insert: '' }), scopeOf(0), before, verdict)).toBe(
        false,
      );
    });
  });
});

describe('footprintOf: clause 0 is about the cover AND nothing else', () => {
  it('reports onlyCoverRemoved for a deletion of exactly the cover', () => {
    const state = EditorState.create({ doc: LIST });
    const scope = scopeOf(1);
    const bounds = visibleBoundsOf(state.doc, scope);
    const anchor = state.doc.line(scope.startLine + 1).from;
    // The root's own two lines and the break that ends them — which lands one
    // past `bounds.to`, since CM6's `Line.to` stops before its own newline.
    const tr = state.update({ changes: { from: bounds.from, to: bounds.to + 1, insert: '' } });
    expect(footprintOf(tr.changes, tr.newDoc, bounds, anchor).onlyCoverRemoved).toBe(true);
  });

  it('does NOT report it when the same transaction also takes hidden content', () => {
    const state = EditorState.create({ doc: LIST });
    const scope = scopeOf(1);
    const bounds = visibleBoundsOf(state.doc, scope);
    const anchor = state.doc.line(scope.startLine + 1).from;
    // Two ranges: the cover, and `- alpha` above it, which the zoom hides.
    const tr = state.update({
      changes: [
        { from: 0, to: 8, insert: '' },
        { from: bounds.from, to: bounds.to + 1, insert: '' },
      ],
    });
    expect(footprintOf(tr.changes, tr.newDoc, bounds, anchor).onlyCoverRemoved).toBe(false);
  });
});
