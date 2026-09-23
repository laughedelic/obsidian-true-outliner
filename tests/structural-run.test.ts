/**
 * The shared command funnel (`selection-structural-ops`): what every entry
 * point reaches through, and the one place the document and the after-state
 * are decided.
 *
 * The comparison these cases exist for is between ENTRY POINTS, so they run
 * the funnel twice over the same starting document — once naming the move as a
 * drop does, by a destination, and once naming it as the palette's own command
 * does — and assert the two answers agree. A funnel each entry point half
 * reproduced would pass a per-path test and fail this one, which is the
 * divergence the capability exists to close.
 */

import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { walkNodes, type OutlineDoc } from '../src/model';
import { moveGroupsDown, moveSubtreesTo } from '../src/ops';
import { changesToSpec, mapCursorForward } from '../src/plugin/dispatch';
import { offsetInLines, planStructural } from '../src/plugin/structural-run';

/*  0 | - one
    1 | - two
    2 |   - child
    3 | - three                                                              */
const DOC = ['- one', '- two', '  - child', '- three', ''].join('\n');

/** `- two` moved past `- three`, and nothing else touched. */
const MOVED = ['- one', '- three', '- two', '  - child', ''].join('\n');

function byLine(doc: OutlineDoc, line: string): number {
  for (const node of walkNodes(doc)) {
    if (node.lines[0] === line) return node.id;
  }
  throw new Error(`no node with line: ${line}`);
}

/** The funnel asked for the same move of `- two`'s subtree, named either way. */
function movedTwo(name: 'as a drop' | 'as the command') {
  const opDoc = parse(DOC);
  return planStructural({
    text: DOC,
    opDoc,
    groups: [[byLine(opDoc, '- two')]],
    // A structural operation over a cover keeps the cover: the run that moved
    // is the run that is selected afterwards.
    wasCover: true,
    op:
      name === 'as a drop'
        ? // The destination a gesture resolves: the top-level seam below
          // `- three`, which is the place the command reaches by name.
          (doc, ids) => moveSubtreesTo(doc, ids, { parentId: 'root', index: 3 })
        : (doc, ids) => moveGroupsDown(doc, ids),
    caret: { kind: 'subject' },
  });
}

describe('one funnel, three entry points', () => {
  it('a drop and the command that names the same move agree', () => {
    const drop = movedTwo('as a drop');
    const command = movedTwo('as the command');
    if (!drop.ok || !command.ok) throw new Error('both should be accepted');

    // The same document, byte for byte.
    expect(drop.newLines.join('\n')).toBe(MOVED);
    expect(command.newLines.join('\n')).toBe(MOVED);

    // And the same selection: the cover of the run in its new place, which is
    // what both paths dispatch.
    // The run now ends the document, so its cover reaches the start of the
    // empty line its own terminating newline makes.
    expect(drop.from).toEqual({ line: 2, ch: 0 });
    expect(drop.to).toEqual({ line: 4, ch: 0 });
    expect({ from: drop.from, to: drop.to }).toEqual({ from: command.from, to: command.to });
  });

  it('the changeset alone does not carry the after-state', () => {
    // Negative control for the case above. Dispatching the changeset without
    // the funnel's selection leaves the editor to map the pre-operation
    // selection forward — which produces the SAME buffer and a DIFFERENT
    // selection, so a comparison that read only the document would pass while
    // the entry points disagreed about where the reader is left.
    const drop = movedTwo('as a drop');
    if (!drop.ok) throw new Error('should be accepted');
    const lines = DOC.split('\n');

    // Same buffer: the changeset is the whole of the document change,
    // applied the way the adapter dispatches it.
    const start = EditorState.create({ doc: DOC });
    const applied = start.update({ changes: changesToSpec(start.doc, drop.changes) }).state.doc;
    expect(applied.toString()).toBe(MOVED);
    expect(drop.newLines.join('\n')).toBe(MOVED);

    // The cover as it stood before the move — `- two` through its own child —
    // mapped forward through that very changeset. Both ends land where the
    // run used to begin, because the change deletes it from there: mapping
    // describes what happened to the TEXT, and a move deletes its subject.
    const mapped = [
      { line: 1, ch: 0 },
      { line: 2, ch: '  - child'.length },
    ].map((pos) => mapCursorForward(lines, drop.changes, pos));
    const dispatched = [drop.from, drop.to!].map((pos) => offsetInLines(drop.newLines, pos));
    expect(mapped).not.toEqual(dispatched);
  });

  it('a refusal comes back as its own reason, not as a rewrite', () => {
    const opDoc = parse(DOC);
    const outcome = planStructural({
      text: DOC,
      opDoc,
      groups: [[byLine(opDoc, '- two')]],
      wasCover: true,
      // Into its own child: a run cannot land inside itself.
      op: (doc, ids) => moveSubtreesTo(doc, ids, { parentId: byLine(doc, '  - child'), index: 0 }),
      caret: { kind: 'subject' },
    });
    expect(outcome).toEqual({ ok: false, reason: 'not-expressible-under-target' });
  });
});
