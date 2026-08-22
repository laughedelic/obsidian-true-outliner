/**
 * Where a structural operation leaves the caret, asserted at the DISPATCH
 * level — the grammar planner's `plan.selection` and the enforcement layer's
 * `verdict.cursor` — because those are the positions that actually reach the
 * editor, and the ones `caret-placement-policy` changes.
 *
 * Written before the policy existed, pinning the OLD answers (tasks.md 1.2),
 * then flipped as each rule landed (6.2, 7.1, 7.2). Each expectation names
 * what it now pins and what it used to say, so the flip reads as an edit to a
 * stated claim rather than as a number quietly changing.
 *
 * Positions are asserted through the resulting LINE TEXT wherever a bare
 * `{line, ch}` would be ambiguous. That is not decoration: the measured
 * next/previous alternation produces the SAME `{2,0}` for opposite reasons
 * (delete a middle node → the FOLLOWING node; delete the last → the
 * PRECEDING one), so coordinates alone cannot express what is being pinned.
 */

import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { computeVerdict, type EditFact, type Verdict } from '../src/enforce';
import { applyEdits } from '../src/result';
import { planKey, type GrammarKey, plannedCaret } from '../src/plugin/grammar';

const pos = (line: number, ch: number) => ({ line, ch });

function byLine(doc: OutlineDoc, line: string): OutlineNode {
  for (const node of walkNodes(doc)) {
    if (node.lines[0] === line) return node;
  }
  throw new Error(`no node with line: ${line}`);
}

/** The rewritten text plus the line the verdict's cursor lands on. */
function verdictLanding(md: string, verdict: Verdict): { text: string; line: string; ch: number } {
  if (verdict.kind !== 'rewrite') throw new Error(`expected rewrite, got ${verdict.kind}`);
  const lines = applyEdits(md === '' ? [] : md.split('\n'), verdict.edits);
  return { text: lines.join('\n'), line: lines[verdict.cursor.line] ?? '', ch: verdict.cursor.ch };
}

/** Delete the exact whole-subtree cover of one node, through the enforcement
 * path — the only dispatch site that produces a structural deletion. */
function deleteNode(md: string, firstLine: string): { text: string; line: string; ch: number } {
  const doc = parse(md);
  const node = byLine(doc, firstLine);
  const start = startLineOf(doc, node);
  const last = node.lines[node.lines.length - 1] ?? '';
  const edit: EditFact = {
    from: pos(start, 0),
    to: pos(start + node.lines.length - 1, last.length),
    insert: '',
  };
  return verdictLanding(md, computeVerdict('boundary-crossing-edit', doc, edit));
}

function startLineOf(doc: OutlineDoc, target: OutlineNode): number {
  let line = doc.preamble.length;
  let found = -1;
  const walk = (node: OutlineNode): void => {
    if (found !== -1) return;
    if (node.id === target.id) {
      found = line;
      return;
    }
    line += node.lines.length + node.trailingGap.length;
    node.children.forEach(walk);
  };
  doc.children.forEach(walk);
  return found;
}

/** The grammar planner's dispatched caret, as `{line, ch}` in the new text. */
function grammarLanding(
  md: string,
  cursor: { line: number; ch: number },
  key: GrammarKey,
): { line: string; ch: number; offset: number } {
  const outcome = planKey(md, cursor, key);
  if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
  const lines = md.split('\n');
  const offsets: number[] = [];
  let acc = 0;
  for (const line of lines) {
    offsets.push(acc);
    acc += line.length + 1;
  }
  const toOffset = (p: { line: number; ch: number }): number => (offsets[p.line] ?? 0) + p.ch;
  let out = md;
  for (const change of [...outcome.plan.changes].sort((a, b) => toOffset(b.from) - toOffset(a.from))) {
    out = out.slice(0, toOffset(change.from)) + change.text + out.slice(toOffset(change.to));
  }
  // Offset → line/ch in the NEW text.
  const newLines = out.split('\n');
  const offset = plannedCaret(outcome.plan);
  let remaining = offset;
  for (const line of newLines) {
    if (remaining <= line.length) return { line, ch: remaining, offset };
    remaining -= line.length + 1;
  }
  throw new Error('selection past end of text');
}

describe('the deletion caret lands at the preceding node’s content end', () => {
  const md = '# Heading\n\nmiddle\n\nlast paragraph\n';

  it('deleting a MIDDLE node', () => {
    const { text, line, ch } = deleteNode(md, 'middle');
    expect(text).toBe('# Heading\n\nlast paragraph\n');
    // Was `last paragraph` at ch 0 — the FOLLOWING node — before
    // `caret-placement-policy`.
    expect({ line, ch }).toEqual({ line: '# Heading', ch: 9 });
  });

  it('deleting the LAST node uses the same rule, not the opposite one', () => {
    const { text, line, ch } = deleteNode(md, 'last paragraph');
    expect(text).toBe('# Heading\n\nmiddle\n');
    // The alternation this change removes: both cases previously produced
    // `{2,0}` for OPPOSITE reasons — the following node here, the preceding
    // node above. Now both name the preceding node's content end.
    expect({ line, ch }).toEqual({ line: 'middle', ch: 6 });
  });

  it('deleting the FIRST node falls through to the following node', () => {
    const { text, line, ch } = deleteNode('first para\n\nsecond para\n', 'first para');
    expect(text).toBe('second para\n');
    // Unchanged: with no predecessor the rule already fell through here.
    expect({ line, ch }).toEqual({ line: 'second para', ch: 0 });
  });

  it('a heading parent is the predecessor of its own first child', () => {
    const { line, ch } = deleteNode('# H\n\nonly child\n', 'only child');
    // Was `{0,2}` — the heading's content START under `contentColumnCh`,
    // which swallows the `# `. Now its content END.
    expect({ line, ch }).toEqual({ line: '# H', ch: 3 });
  });

  it('the predecessor can be a deep descendant, i.e. the visually previous line', () => {
    const { line, ch } = deleteNode('# H\n\n- a\n  - a1\n\nafter\n', 'after');
    // Was `- a` at ch 2 — the previous SIBLING's content start.
    expect({ line, ch }).toEqual({ line: '  - a1', ch: 6 });
  });
});

describe('a deletion and a merge agree at the same seam', () => {
  /**
   * The argument for the deletion convention: `node-edit-enforcement` already
   * requires a merge to land "immediately after the surviving node's own
   * original last line of content". That IS the preceding node's content end.
   * Both gestures act on the boundary between two nodes, so both should leave
   * the caret in the same place — and until this change only the merge did.
   */
  const md = 'first para\n\nsecond para\n';

  it('both land at the first paragraph’s content end', () => {
    const deleted = deleteNode(md, 'second para');

    // A Backspace at the second paragraph's first character: the merge shape.
    const doc = parse(md);
    const merged = verdictLanding(
      md,
      computeVerdict('boundary-crossing-edit', doc, {
        // The newline ending the gap line, with the caret at the second
        // paragraph's first character — the Backspace-merge shape.
        from: pos(1, 0),
        to: pos(2, 0),
        insert: '',
        cursorBefore: pos(2, 0),
      }),
    );

    expect(deleted.ch).toBe('first para'.length);
    expect(merged.ch).toBe('first para'.length);
    expect(deleted.line).toBe('first para');
    expect(merged.line).toBe('first parasecond para');
  });
});

describe('a deletion next to a table keeps the caret out of the table', () => {
  const TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

  it('control: deleting the TABLE itself lands on the following node', () => {
    const { line, ch } = deleteNode(`${TABLE}\n\nlast paragraph\n`, '| a | b |');
    expect({ line, ch }).toEqual({ line: 'last paragraph', ch: 0 });
  });

  it('deleting the node after a table steps past it rather than landing inside', () => {
    // The reported defect: the caret landed at `| a | b |` ch 0 (inside the
    // table), Obsidian mounted the nested cell editor, and undo was stranded.
    // The preceding-node convention alone does NOT fix it — it gives
    // `| 1 | 2 |` ch 9, still inside — which is why the atom guard is a
    // separate rule.
    const { line, ch } = deleteNode(`${TABLE}\n\nmid\n\ntail\n`, 'mid');
    expect({ line, ch }).toEqual({ line: 'tail', ch: 0 });
  });

  it('with nothing following, it steps BACKWARD past the table', () => {
    const { line, ch } = deleteNode(`intro\n\n${TABLE}\n\nlast\n`, 'last');
    expect({ line, ch }).toEqual({ line: 'intro', ch: 5 });
  });

  it('residual: a table with no non-capturing neighbour leaves the seam standing', () => {
    // Documented rather than silently handled — deleting the only other node
    // leaves nowhere outside the table to go.
    const { line } = deleteNode(`${TABLE}\n\nlast paragraph\n`, 'last paragraph');
    expect(line).toBe('| 1 | 2 |');
  });
});

describe('one content-start definition after a move', () => {
  it('a moved HEADING lands at column 0, where Home lands', () => {
    const { line, ch } = grammarLanding('## Alpha\n\n## Beta\n', pos(0, 0), 'move-down');
    // Was ch 3, past the `## `. `content-space-caret` states a heading's `#`
    // is ordinary content, so ch 3 disagreed with both the caret spec and
    // Home on the same line.
    expect({ line, ch }).toEqual({ line: '## Alpha', ch: 0 });
  });

  it('a moved list item whose text starts with `#` lands before the hash', () => {
    const { line, ch } = grammarLanding('- # title\n- second\n', pos(0, 2), 'move-down');
    // Was ch 4 — past BOTH the list marker and the `#`. The `#` is the item's
    // own content.
    expect({ line, ch }).toEqual({ line: '- # title', ch: 2 });
  });

  it('a moved ordinary list item is unaffected', () => {
    const { line, ch } = grammarLanding('- alpha\n- beta\n', pos(0, 2), 'move-down');
    // Control: the two content-start definitions agree here, so the
    // unification must NOT move this one.
    expect({ line, ch }).toEqual({ line: '- alpha', ch: 2 });
  });
});

/**
 * The boundary `caret-placement-policy` gained with
 * `selection-aware-structural-ops`: the procedure answers the caret question
 * exactly when the dispatch HAS a caret to place. A block-cover operand states
 * a selection instead and does not consult it.
 */
describe('a block-cover dispatch states a selection, not a caret', () => {
  const RUN = '- p\n- a\n- b\n';

  function planWith(from: { line: number; ch: number }, to: { line: number; ch: number }) {
    return planKey(RUN, to, 'indent', undefined, to, undefined, from);
  }

  it('a cover operand yields a range', () => {
    // The exact cover of `- a`..`- b`, ending on the gap the last root owns.
    const outcome = planWith({ line: 1, ch: 0 }, { line: 3, ch: 0 });
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    expect(typeof outcome.plan.selection).not.toBe('number');
  });

  it('a caret operand yields the caret the policy computes, unchanged', () => {
    const withRange = planKey(RUN, { line: 2, ch: 3 }, 'indent');
    if (!withRange || !('plan' in withRange)) throw new Error('expected a plan');
    // Same shape as before this capability existed: a bare offset, and the
    // mapped column rather than the node's content start.
    expect(typeof withRange.plan.selection).toBe('number');
  });
});
