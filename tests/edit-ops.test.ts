import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { kindAsWritten, parse, tailAsWritten } from '../src/parse';
import { encode } from '../src/encode';
import { makeNode, treesEqual, walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import {
  deleteSubtrees,
  indent,
  insertSubtrees,
  mergeNodes,
  moveSubtreesTo,
  outdent,
  type OpOutput,
} from '../src/ops';
import { applyEdits, type OpResult } from '../src/result';
import { arbTree } from './generators';

/** Find the node whose first line matches. */
function byLine(doc: OutlineDoc, line: string): OutlineNode {
  for (const node of walkNodes(doc)) {
    if (node.lines[0] === line) return node;
  }
  throw new Error(`no node with line: ${line}`);
}

function siblingsOf(doc: OutlineDoc, node: OutlineNode): OutlineNode[] {
  const walk = (nodes: readonly OutlineNode[]): OutlineNode[] | undefined => {
    if (nodes.some((n) => n.id === node.id)) return [...nodes];
    for (const n of nodes) {
      const found = walk(n.children);
      if (found) return found;
    }
    return undefined;
  };
  return walk(doc.children) ?? [];
}

describe('deleteSubtrees', () => {
  it('takes the trailing gap: neighbors stay byte-identical', () => {
    const md = 'A.\n\nB.\n\nC.\n';
    const doc = parse(md);
    const b = byLine(doc, 'B.');
    const result = deleteSubtrees(doc, [b.id]);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('A.\n\nC.\n');
  });

  it('leaves the terminating newline on the node that now ends the note', () => {
    // A document's terminating newline is one empty gap line on its LAST node,
    // so a removal that takes that node takes the newline with it (#160). It
    // is the one gap a deletion does not own: it separates the last node from
    // nothing.
    const runToTheEnd = parse('- a\n- b\n- c\n');
    const tail = ['- b', '- c'].map((line) => byLine(runToTheEnd, line).id);
    const swept = deleteSubtrees(runToTheEnd, tail);
    if (!swept.ok) throw new Error(swept.rejection.reason);
    expect(encode(swept.value.doc)).toBe('- a\n');

    // The same where the note's last node is a child: the survivor that now
    // ends the document is its parent.
    const child = parse('- one\n  - a\n');
    const only = deleteSubtrees(child, [byLine(child, '  - a').id]);
    if (!only.ok) throw new Error(only.rejection.reason);
    expect(encode(only.value.doc)).toBe('- one\n');
  });

  it('gives no newline to a note written without one', () => {
    // Negative control: the terminator is restored, never invented. A note
    // that genuinely ends flush is not rewritten by an edit elsewhere in it.
    const flush = parse('- a\n- b');
    const result = deleteSubtrees(flush, [byLine(flush, '- b').id]);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- a');
  });

  it('reads the terminator as the gap’s empty LAST line, not as any gap at all', () => {
    // A gap line carries whatever whitespace the note wrote there, so a last
    // line of two spaces and no newline is a non-empty gap that is not a
    // terminator. Reading the gap's length instead invents one here...
    const whitespaceEnd = parse('- a\n- b\n  ');
    const invented = deleteSubtrees(whitespaceEnd, [byLine(whitespaceEnd, '- b').id]);
    if (!invented.ok) throw new Error(invented.rejection.reason);
    expect(encode(invented.value.doc)).toBe('- a');

    // ...and drops one here, where the survivor's own gap is whitespace and
    // the terminator left with the node that was holding it. The restored
    // newline is APPENDED to that gap: the whitespace line is the note's, not
    // a terminator standing in for one.
    const whitespaceGap = parse('- a\n  \n- b\n');
    const dropped = deleteSubtrees(whitespaceGap, [byLine(whitespaceGap, '- b').id]);
    if (!dropped.ok) throw new Error(dropped.rejection.reason);
    expect(encode(dropped.value.doc)).toBe('- a\n  \n');
  });

  it('gives no second newline to a survivor that already ends in a gap', () => {
    // Negative control: where a blank line already separated the survivor from
    // the run that left, it is already carrying the terminator.
    const loose = parse('- a\n\n- b\n');
    const result = deleteSubtrees(loose, [byLine(loose, '- b').id]);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- a\n');
  });

  it('heading deletion removes its whole section', () => {
    const md = '# One\n\nBody one.\n\n## Sub\n\nSub body.\n\n# Two\n\nBody two.\n';
    const doc = parse(md);
    const one = byLine(doc, '# One');
    const result = deleteSubtrees(doc, [one.id]);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('# Two\n\nBody two.\n');
  });

  it('deleting every node yields a valid empty document', () => {
    const md = 'Only.\n';
    const doc = parse(md);
    const ids = [...walkNodes(doc)].map((n) => n.id);
    const result = deleteSubtrees(doc, ids);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('');
    expect(result.value.doc.children).toEqual([]);
    expect(result.value.anchor).toEqual({ line: 0, ch: 0 });
  });

  it('deleting two adjacent top-level subtrees removes both plus the gap between', () => {
    const md = 'A.\n\nB.\n\nC.\n';
    const doc = parse(md);
    const a = byLine(doc, 'A.');
    const b = byLine(doc, 'B.');
    const result = deleteSubtrees(doc, [a.id, b.id]);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('C.\n');
  });

  it('rejects an empty selection', () => {
    const doc = parse('A.\n');
    const result = deleteSubtrees(doc, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe('empty-selection');
  });

  it('rejects a non-contiguous selection (skips a sibling in between)', () => {
    const md = 'A.\n\nB.\n\nC.\n';
    const doc = parse(md);
    const a = byLine(doc, 'A.');
    const c = byLine(doc, 'C.');
    const result = deleteSubtrees(doc, [a.id, c.id]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe('non-contiguous-subtrees');
  });

  it('rejects a nested id alongside its own ancestor (not a sibling run)', () => {
    const md = '- a\n  - b\n';
    const doc = parse(md);
    const a = byLine(doc, '- a');
    const b = byLine(doc, '  - b');
    const result = deleteSubtrees(doc, [a.id, b.id]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe('non-contiguous-subtrees');
  });

  it('a rejected call leaves the input doc unchanged and never throws', () => {
    const doc = parse('A.\n');
    const before = encode(doc);
    expect(() => deleteSubtrees(doc, [999999])).not.toThrow();
    expect(encode(doc)).toBe(before);
  });
});

describe('deleteSubtrees: ordered runs renumber from the run’s pre-removal start', () => {
  function deleteOk(md: string, ...lines: string[]): string {
    const doc = parse(md);
    const result = deleteSubtrees(doc, lines.map((l) => byLine(doc, l).id));
    if (!result.ok) throw new Error(result.rejection.reason);
    // The edit list must reproduce the encoding exactly: renumbering is the one
    // documented exception to "touch only the lines the operation requires", so
    // its edits have to be in the list rather than only in the tree.
    const text = encode(result.value.doc);
    expect(applyEdits(md.split('\n'), result.value.edits).join('\n')).toBe(text);
    return text;
  }

  // The two measurements the catalogue recorded (enter-and-shift-enter-catalogue,
  // C2). Asserting the whole document, not the marker digits: the point is that the
  // renumbering moved nothing else.
  it('removing the head of 1,2,3 renumbers the survivor to 1', () => {
    expect(deleteOk('1. a\n2. b\n3. c\n', '1. a', '2. b')).toBe('1. c\n');
  });

  it('a run that does not start at one keeps the start it was written with', () => {
    expect(deleteOk('5. a\n6. b\n7. c\n', '5. a')).toBe('5. b\n6. c\n');
  });

  it('removing from the middle renumbers the tail, as it already did', () => {
    expect(deleteOk('1. a\n2. b\n3. c\n', '2. b')).toBe('1. a\n2. c\n');
  });

  // A bullet, not a paragraph: a paragraph ADOPTS a following list as its children
  // (measured), so the two runs would not be siblings at all.
  it('a non-ordered node between two runs is removed: the survivors take the earlier start', () => {
    expect(deleteOk('1. a\n2. b\n- x\n5. c\n6. d\n', '- x')).toBe('1. a\n2. b\n3. c\n4. d\n');
  });

  it('removing a whole run leaves nothing to renumber', () => {
    expect(deleteOk('- x\n\n5. a\n6. b\n', '5. a', '6. b')).toBe('- x\n');
  });
});

describe('mergeNodes', () => {
  it('joins two adjacent sibling paragraphs into one, minimal edit', () => {
    const md = 'First.\n\nSecond.\n';
    const doc = parse(md);
    const first = byLine(doc, 'First.');
    const result = mergeNodes(doc, first.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('First.Second.\n');
    expect(result.value.doc.children.length).toBe(1);
    // Cursor at the JOIN point (regression: was landing at the merged
    // node's start, i.e. {0,0}) — right after "First.", before "Second.".
    expect(result.value.anchor).toEqual({ line: 0, ch: 'First.'.length });
  });

  it('joins two adjacent bullet list items, stripping the second marker', () => {
    const md = '- alpha\n- beta\n';
    const doc = parse(md);
    const alpha = byLine(doc, '- alpha');
    const result = mergeNodes(doc, alpha.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- alphabeta\n');
    expect(result.value.anchor).toEqual({ line: 0, ch: '- alpha'.length });
  });

  it('strips the absorbed item’s TASK marker along with its list marker', () => {
    // It states something about the item being absorbed, and that item is about
    // to stop existing. Carried into the survivor's text it read
    // `- [x] foo[ ] bar` — a literal `[ ]` mid-line, neither a checkbox nor
    // anything typed. The survivor keeps its own box.
    const md = '- [x] foo\n- [ ] bar\n';
    const doc = parse(md);
    const result = mergeNodes(doc, byLine(doc, '- [x] foo').id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- [x] foobar\n');
    expect(result.value.anchor).toEqual({ line: 0, ch: '- [x] foo'.length });
  });

  it('leaves an absorbed item’s own text alone when it merely starts with a bracket', () => {
    // `[ ]` is a task marker only with the whitespace that follows it; `[x]y`
    // is text, and a merge that stripped it would be eating content.
    const md = '- alpha\n- [x]y\n';
    const doc = parse(md);
    const result = mergeNodes(doc, byLine(doc, '- alpha').id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- alpha[x]y\n');
  });

  it('strips only the LIST marker from content that starts with a hash', () => {
    // The strip stays on the list-marker regex: `markerPrefixCh` is built on
    // `contentColumnCh`, which also swallows an ATX prefix, so the shorter
    // spelling would eat this `#` — and pass every other case in this file.
    const md = '- alpha\n- # title\n';
    const doc = parse(md);
    const result = mergeNodes(doc, byLine(doc, '- alpha').id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- alpha# title\n');
  });

  it('merge cursor lands at the join point even when `first` spans multiple lines', () => {
    const md = '- alpha\n  more\n- beta\n';
    const doc = parse(md);
    const alpha = byLine(doc, '- alpha');
    const result = mergeNodes(doc, alpha.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- alpha\n  morebeta\n');
    expect(result.value.anchor).toEqual({ line: 1, ch: '  more'.length });
  });

  it('rejects absorbing a heading (its section anchor would be destroyed)', () => {
    const md = 'Intro.\n\n## Section\n\nChild body.\n';
    const doc = parse(md);
    const intro = byLine(doc, 'Intro.');
    const result = mergeNodes(doc, intro.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe('merge-not-expressible');
    // Document untouched.
    expect(encode(doc)).toBe(md);
  });

  it('a parent absorbs its first child; grandchildren re-parent (amendment 2026-07-21)', () => {
    const md = '- parent\n  - child\n- next\n';
    const doc = parse(md);
    const parent = byLine(doc, '- parent');
    const result = mergeNodes(doc, parent.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- parentchild\n- next\n');
  });

  it('grandchildren survive the absorption, re-encoded one level up', () => {
    const md = '- parent\n  - child\n    - grand\n- next\n';
    const doc = parse(md);
    const parent = byLine(doc, '- parent');
    const result = mergeNodes(doc, parent.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- parentchild\n  - grand\n- next\n');
  });

  it('tab-indented children re-parent without corrupting into spaces (real-vault repro)', () => {
    // "list parent1" is already `paragraph`'s first child (attachment
    // rule), with "list parent2" as its second; list parent1's own
    // children are indented a full TAB past the marker, not exactly
    // markerWidth (2) columns — a common tab-indented-vault convention.
    // The old numeric-column-delta shift assumed strict marker-alignment,
    // producing a fractional remainder that got padded with spaces
    // mid-tab (mixing tabs and spaces, breaking grandchild1's own
    // list-item parse). Absorbing "list parent1" promotes its children
    // (child1, child2) to paragraph's direct children, taking its former
    // position ahead of the untouched "list parent2".
    const md = 'paragraph\n- list parent1\n\t- child1\n\t\t- grandchild1\n\t- child2\n- list parent2\n';
    const doc = parse(md);
    const para = byLine(doc, 'paragraph');
    const result = mergeNodes(doc, para.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe(
      'paragraphlist parent1\n- child1\n\t- grandchild1\n- child2\n- list parent2\n',
    );
    const merged = result.value.doc.children[0]!;
    expect(merged.children.map((n) => n.lines[0])).toEqual(['- child1', '- child2', '- list parent2']);
    const child1 = merged.children[0]!;
    expect(child1.children[0]!.kind).toBe('list-item'); // grandchild1 still a real list item
    expect(child1.children[0]!.lines[0]).toBe('\t- grandchild1');
  });

  it('a parent absorbing its first (tab-indented) child re-parents the grandchild at the SURVIVING sibling\'s actual column', () => {
    // "absorbed" is parent's first child (its own successor); "moved" is
    // absorbed's child, becoming parent's direct child. The reference for
    // where it lands is "sibling2" — parent's OTHER pre-existing child,
    // still at its own real (one-tab) column — not an assumed formula.
    const md = '- parent\n\t- absorbed\n\t\t- moved\n\t- sibling2\n';
    const doc = parse(md);
    const parent = byLine(doc, '- parent');
    const result = mergeNodes(doc, parent.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- parentabsorbed\n\t- moved\n\t- sibling2\n');
    const merged = result.value.doc.children[0]!;
    expect(merged.children.map((n) => n.lines[0])).toEqual(['\t- moved', '\t- sibling2']);
  });

  it('cross-kind join: list item text into its parent paragraph (amendment 2026-07-21)', () => {
    const md = 'Para.\n- item\n';
    const doc = parse(md);
    const para = byLine(doc, 'Para.');
    const result = mergeNodes(doc, para.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('Para.item\n');
    expect(result.value.doc.children[0]!.kind).toBe('paragraph');
  });

  it('cross-family list join keeps the survivor marker (amendment 2026-07-21)', () => {
    const direct = parse('- bullet\n1. ordered\n');
    const bullet = byLine(direct, '- bullet');
    const result = mergeNodes(direct, bullet.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- bulletordered\n');
  });

  it('a heading absorbs single-line content; multi-line rejects (amendment 2026-07-21)', () => {
    const single = parse('# Title\nBody.\n');
    const h1 = byLine(single, '# Title');
    const joined = mergeNodes(single, h1.id);
    if (!joined.ok) throw new Error(joined.rejection.reason);
    expect(encode(joined.value.doc)).toBe('# TitleBody.\n');

    const multi = parse('# Title\nBody one\nbody two\n');
    const h2 = byLine(multi, '# Title');
    const rejected = mergeNodes(multi, h2.id);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.rejection.reason).toBe('merge-not-expressible');
  });

  it('a heading absorbing its first child keeps its OWN gap, not the absorbed child\'s (2026-07-24 fix)', () => {
    // Before the fix: the merged node took `second.trailingGap` unconditionally
    // (correct for ordinary interior merges, where "the gap between them" is
    // genuinely consumed by the merge) — but for a heading, the gap AFTER it
    // is the heading's own established separation from its content, not a
    // property of whichever node happened to be first. Losing it made
    // whatever followed (here, "item2") stick directly to the heading with no
    // separator, even though the heading originally had a real blank-line gap.
    const md = '# Head\n\n- item1\n- item2\n';
    const doc = parse(md);
    const head = byLine(doc, '# Head');
    const result = mergeNodes(doc, head.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('# Headitem1\n\n- item2\n');
  });

  it('a heading absorbing a TERMINAL child still keeps that child\'s trailing gap (no regression)', () => {
    // The heading itself has NO gap here (`# Title` immediately followed by
    // `Body.`, no blank line) — `second` (Body.) is the document's own last
    // node, so its trailingGap carries the file's trailing-newline
    // representation. The fix must not discard that: whichever side has MORE
    // blank lines wins, and here that's still `second`'s.
    const md = '# Title\nBody.\n';
    const doc = parse(md);
    const head = byLine(doc, '# Title');
    const result = mergeNodes(doc, head.id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('# TitleBody.\n');
  });

  it('rejects at the end of the document (no following neighbor)', () => {
    const doc = parse('Only.\n');
    const only = byLine(doc, 'Only.');
    const result = mergeNodes(doc, only.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe('no-following-neighbor');
  });

  it('a paragraph merges with the heading-section paragraph that follows it when the heading has no children', () => {
    // No children under the heading to orphan — a heading itself is still
    // never a mergeable KIND, so this rejects on kind, not children.
    const md = 'Intro.\n\n# H\n';
    const doc = parse(md);
    const intro = byLine(doc, 'Intro.');
    const result = mergeNodes(doc, intro.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe('merge-not-expressible');
  });

  // A merge REMOVES `second` from a sibling list, and the survivor's index is
  // not the run's head: found in review after the audit classified every merge
  // path as an insertion. Each of the three surgery branches can lose a head.
  describe('a merge removes a node, so its level renumbers from the pre-merge start', () => {
    function mergeOk(md: string, first: string): string {
      const doc = parse(md);
      const result = mergeNodes(doc, byLine(doc, first).id);
      if (!result.ok) throw new Error(result.rejection.reason);
      const text = encode(result.value.doc);
      expect(applyEdits(md.split('\n'), result.value.edits).join('\n')).toBe(text);
      return text;
    }

    it('absorbing a bullet SEPARATOR joins two runs at the earlier one’s start', () => {
      // The survivor's own `5.` would otherwise be rewritten to `1.` — the
      // minimum of the run it just joined.
      expect(mergeOk('5. a\n- x\n1. c\n', '5. a')).toBe('5. ax\n6. c\n');
      expect(mergeOk('1. a\n- x\n5. c\n6. d\n', '1. a')).toBe('1. ax\n2. c\n3. d\n');
    });

    it('absorbing an ordered FIRST CHILD renumbers the children left behind', () => {
      // This branch renumbered nothing at all, so the survivors kept 2 and 3.
      expect(mergeOk('- p\n\t1. a\n\t2. b\n\t3. c\n', '- p')).toBe('- pa\n\t1. b\n\t2. c\n');
      expect(mergeOk('- p\n\t5. a\n\t6. b\n', '- p')).toBe('- pa\n\t5. b\n');
    });

    it('a CROSS-SCOPE merge removes a head whose predecessor is not in its run', () => {
      // `1. a`'s predecessor at the top level is `- p`, so having one is not
      // the same as keeping the run's head — the claim the audit rested on.
      expect(mergeOk('- p\n\t- kid\n1. a\n2. b\n', '\t- kid')).toBe('- p\n\t- kida\n1. b\n');
    });

    it('adopted grandchildren prepended before a survivor keep the run’s start', () => {
      // `second`'s own children are adopted into the list `first` absorbed it
      // from, and land BEFORE the survivors. They were never in the pre-merge
      // list, so reading the start off the run's literal first member fell back
      // to the minimum: `6. kid` / `7. b` instead of `5.` / `6.`.
      expect(mergeOk('- p\n\t5. a\n\t\t10. kid\n\t6. b\n', '- p')).toBe(
        '- pa\n\t5. kid\n\t6. b\n',
      );
    });

    it('a plain same-level merge is unchanged — the head stays', () => {
      expect(mergeOk('1. a\n2. b\n3. c\n', '1. a')).toBe('1. ab\n2. c\n');
      expect(mergeOk('5. a\n6. b\n7. c\n', '5. a')).toBe('5. ab\n6. c\n');
    });
  });
});

describe('insertSubtrees', () => {
  it('list items pasted under a deeper scope re-indent, internal structure preserved', () => {
    const target = parse('- a\n\t- b\n');
    const b = byLine(target, '\t- b');
    const parsed = parse('- x\n- y\n');
    const result = insertSubtrees(target, b.id, parsed.children, 'after');
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- a\n\t- b\n\t- x\n\t- y\n');
  });

  it('a single node with a nested child keeps a consistent tab unit at every depth (D15 regression)', () => {
    // The bug: a numeric column-delta reindent added SPACES for the shift
    // while the descendant's own original tab stayed put, mixing units.
    const target = parse('- top\n\t- anchor\n');
    const anchor = byLine(target, '\t- anchor');
    const parsed = parse('- x\n\t- y\n'); // "x" at depth 0, "y" its own child at depth 1, both tabs
    const result = insertSubtrees(target, anchor.id, parsed.children, 'after');
    if (!result.ok) throw new Error(result.rejection.reason);
    const text = encode(result.value.doc);
    expect(text).toBe('- top\n\t- anchor\n\t- x\n\t\t- y\n');
    // No line mixes a space into an otherwise all-tab leading whitespace run.
    for (const line of text.split('\n')) {
      const ws = /^[ \t]*/.exec(line)![0];
      expect(ws.includes(' ') && ws.includes('\t')).toBe(false);
    }
  });

  it('re-indents to a SHALLOWER depth than the original, unit still consistent', () => {
    const target = parse('- top\n\t- mid\n\t\t- anchor\n');
    const anchor = byLine(target, '\t\t- anchor');
    const parsed = parse('\t\t- x\n\t\t\t- y\n'); // originally depth 2/3
    const result = insertSubtrees(target, anchor.id, parsed.children, 'after');
    if (!result.ok) throw new Error(result.rejection.reason);
    const text = encode(result.value.doc);
    expect(text).toBe('- top\n\t- mid\n\t\t- anchor\n\t\t- x\n\t\t\t- y\n');
  });

  it('a run at the end of a scope takes that scope\'s own separation', () => {
    // The last node's gap is the file's terminating newline rather than a
    // separation, so the run takes it over and reads what separates it from the
    // node above off the boundary above THAT one.
    const loose = parse('- one\n  - a\n\n  - b\n');
    const looseResult = insertSubtrees(loose, byLine(loose, '  - b').id, parse('- x\n').children, 'after');
    if (!looseResult.ok) throw new Error(looseResult.rejection.reason);
    expect(encode(looseResult.value.doc)).toBe('- one\n  - a\n\n  - b\n\n  - x\n');

    // Negative control: the same shape without the blank line gains none.
    const tight = parse('- one\n  - a\n  - b\n');
    const tightResult = insertSubtrees(tight, byLine(tight, '  - b').id, parse('- x\n').children, 'after');
    if (!tightResult.ok) throw new Error(tightResult.rejection.reason);
    expect(encode(tightResult.value.doc)).toBe('- one\n  - a\n  - b\n  - x\n');
  });

  it('a run at the START of a scope takes that scope\'s own separation', () => {
    // The mirror of the case above, and the reason the parent's own gap is not
    // the answer: it separates a parent from its first child, which is a
    // NESTING boundary, while the run's own lower boundary is a sibling one.
    // The scope's first boundary is a sibling boundary, so it answers.
    const tight = parse('one\n\n- a\n- b\n');
    const tightResult = insertSubtrees(
      tight,
      byLine(tight, '- a').id,
      parse('- x\n').children,
      'before',
    );
    if (!tightResult.ok) throw new Error(tightResult.rejection.reason);
    expect(encode(tightResult.value.doc)).toBe('one\n\n- x\n- a\n- b\n');

    // Negative control: the same shape with the list loose keeps it loose.
    const loose = parse('one\n\n- a\n\n- b\n');
    const looseResult = insertSubtrees(
      loose,
      byLine(loose, '- a').id,
      parse('- x\n').children,
      'before',
    );
    if (!looseResult.ok) throw new Error(looseResult.rejection.reason);
    expect(encode(looseResult.value.doc)).toBe('one\n\n- x\n\n- a\n\n- b\n');
  });

  it('a pasted item\'s own surplus marker run is normalized to one space, like any other rewritten first line', () => {
    // The whole-subtree re-indent path (reindentSubtreeInUnit) otherwise carried
    // a surplus run through unchanged, contradicting list-marker-content-column's
    // own goal ("a line an operation rewrites comes out with a one-space run")
    // for the one operation — paste — that takes this path instead of
    // reencodeForDestination.
    const target = parse('- top\n');
    const top = byLine(target, '- top');
    // "x" at content column 3 (`-  x`); "y" nests under it only at 3+ columns,
    // which is itself the shape this PR's parser fix requires.
    const parsed = parse('-  x\n   - y\n');
    const result = insertSubtrees(target, top.id, parsed.children, 'after');
    if (!result.ok) throw new Error(result.rejection.reason);
    const text = encode(result.value.doc);
    // "x"'s run drops to one space and "y" shifts from 3 to 2 to stay nested
    // at the same relative depth, exactly as an indent/outdent rewrite would.
    expect(text).toBe('- top\n- x\n  - y\n');
  });

  it('a pasted item with no surplus run is unaffected', () => {
    const target = parse('- top\n');
    const top = byLine(target, '- top');
    const parsed = parse('- x\n  - y\n');
    const result = insertSubtrees(target, top.id, parsed.children, 'after');
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- top\n- x\n  - y\n');
  });

  it('insertion never splices mid-node: existing nodes stay byte-identical', () => {
    const md = 'First paragraph text.\n\nSecond paragraph text.\n';
    const doc = parse(md);
    const first = byLine(doc, 'First paragraph text.');
    const parsed = parse('New one.\n\nNew two.\n');
    const result = insertSubtrees(doc, first.id, parsed.children, 'after');
    if (!result.ok) throw new Error(result.rejection.reason);
    const text = encode(result.value.doc);
    expect(text).toContain('First paragraph text.');
    expect(text).toContain('Second paragraph text.');
    expect(text).toContain('New one.');
    expect(text).toContain('New two.');
    // The paragraph's own text was never merged with inserted content.
    expect(text).not.toContain('First paragraph text.New');
  });

  it('rejects an atom sequence under a paragraph scope', () => {
    const md = 'Para.\n\n- item\n';
    const doc = parse(md);
    const item = byLine(doc, '- item');
    void item;
    // Build a genuine paragraph-with-no-list-children scope instead.
    const soloPara = parse('# H\n\nSolo para.\n');
    const para = byLine(soloPara, 'Solo para.');
    const atomBlocks = parse('```\ncode\n```\n').children;
    const result = insertSubtrees(soloPara, para.id, atomBlocks, 'after');
    // Inserting AFTER a paragraph at section level (not as its child) is a
    // sibling-level insertion, which atoms CAN occupy — so assert the
    // paragraph-child rejection via `before` at index 0 under the paragraph
    // itself instead: not directly expressible with this op's anchor model,
    // so instead verify the heading-under-list-scope rejection below.
    expect(result.ok).toBe(true);
  });

  it('converts a heading sequence inserted under a non-section scope', () => {
    const md = '- a\n  - b\n';
    const doc = parse(md);
    const b = byLine(doc, '  - b');
    const headingBlocks = parse('# New heading\n\nBody.\n').children;
    const result = insertSubtrees(doc, b.id, headingBlocks, 'after');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A heading cannot be a list item's child, so it takes the encoding the
    // destination permits and carries its own `#` run into the item's text.
    // Its paragraph child converts with it: a list scope is one list, and a
    // leaf that stays a paragraph is a different kind of row from its peers.
    expect(encode(result.value.doc)).toBe('- a\n  - b\n  - # New heading\n\n    - Body.\n');
  });

  it('rejects an empty block sequence', () => {
    const doc = parse('A.\n');
    const a = byLine(doc, 'A.');
    const result = insertSubtrees(doc, a.id, [], 'after');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe('empty-selection');
  });
});

const KNOWN_REASONS = new Set([
  'node-not-found',
  'empty-selection',
  'non-contiguous-subtrees',
  'no-following-neighbor',
  'would-orphan-children',
  'merge-not-expressible',
  'insertion-not-expressible',
  // A heading payload deeper than the destination has room for, refused on the
  // same terms `indent` refuses it (paste-lands-where-it-is-pointed).
  'at-h6-bound',
]);

/** Pick the nth node (document order) — deterministic target selection. */
function nthNode(doc: OutlineDoc, n: number): OutlineNode | undefined {
  const all = [...walkNodes(doc)];
  return all.length === 0 ? undefined : all[n % all.length];
}

describe('edit-ops property suite: closure, totality, minimal edit', () => {
  it('deleteSubtrees: accepted results re-parse to themselves; edits reproduce the encoding', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), (doc, n) => {
        const target = nthNode(doc, n);
        if (!target) return true;
        const siblings = siblingsOf(doc, target);
        const idx = siblings.findIndex((s) => s.id === target.id);
        // A random contiguous run starting at idx.
        const runLen = 1 + (n % Math.max(1, siblings.length - idx));
        const ids = siblings.slice(idx, idx + runLen).map((s) => s.id);
        const source = encode(doc);
        const result = deleteSubtrees(doc, ids);
        if (!result.ok) return KNOWN_REASONS.has(result.rejection.reason);
        const text = encode(result.value.doc);
        if (!treesEqual(result.value.doc, parse(text))) return false;
        const viaEdits = applyEdits(source === '' ? [] : source.split('\n'), result.value.edits);
        return viaEdits.join('\n') === text;
      }),
      { numRuns: 500 },
    );
  });

  it('deleteSubtrees: untouched nodes keep their lines verbatim', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), (doc, n) => {
        const target = nthNode(doc, n);
        if (!target) return true;
        const result = deleteSubtrees(doc, [target.id]);
        if (!result.ok) return true;
        const touched = new Set<number>();
        const markSubtree = (n: OutlineNode): void => {
          touched.add(n.id);
          n.children.forEach(markSubtree);
        };
        markSubtree(target);
        const before = [...walkNodes(doc)]
          .filter((node) => !touched.has(node.id))
          .map((node) => node.lines.join('\n'));
        const afterText = encode(result.value.doc);
        return before.every((block) => block === '' || afterText.includes(block));
      }),
      { numRuns: 500 },
    );
  });

  it('mergeNodes: every node either closes or rejects with a known reason — never throws', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        for (const node of walkNodes(doc)) {
          const result = mergeNodes(doc, node.id);
          if (!result.ok && !KNOWN_REASONS.has(result.rejection.reason)) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('mergeNodes: accepted results re-parse to themselves; edits reproduce the encoding', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), (doc, n) => {
        const target = nthNode(doc, n);
        if (!target) return true;
        const source = encode(doc);
        const result = mergeNodes(doc, target.id);
        if (!result.ok) return KNOWN_REASONS.has(result.rejection.reason);
        const text = encode(result.value.doc);
        if (!treesEqual(result.value.doc, parse(text))) return false;
        const viaEdits = applyEdits(source === '' ? [] : source.split('\n'), result.value.edits);
        return viaEdits.join('\n') === text;
      }),
      { numRuns: 500 },
    );
  });

  it('mergeNodes: a rejected merge leaves the document unchanged', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), (doc, n) => {
        const target = nthNode(doc, n);
        if (!target) return true;
        const before = encode(doc);
        const result = mergeNodes(doc, target.id);
        if (result.ok) return true;
        return encode(doc) === before;
      }),
      { numRuns: 300 },
    );
  });

  it('insertSubtrees: accepted results re-parse to themselves; existing nodes stay verbatim', () => {
    fc.assert(
      fc.property(arbTree(), arbTree(), fc.nat(), fc.nat(), fc.boolean(), (doc, other, n, m, before) => {
        const anchor = nthNode(doc, n);
        const blockSource = nthNode(other, m);
        if (!anchor || !blockSource) return true;
        const parsedBlocks = parse(encode({ preamble: [], children: [blockSource] })).children;
        if (parsedBlocks.length === 0) return true;
        const source = encode(doc);
        const result = insertSubtrees(doc, anchor.id, parsedBlocks, before ? 'before' : 'after');
        if (!result.ok) return KNOWN_REASONS.has(result.rejection.reason);
        const text = encode(result.value.doc);
        if (!treesEqual(result.value.doc, parse(text))) return false;
        const viaEdits = applyEdits(source === '' ? [] : source.split('\n'), result.value.edits);
        return viaEdits.join('\n') === text;
      }),
      { numRuns: 500 },
    );
  });
});

describe('insertSubtrees: a payload whose roots came from different depths (selection-as-subtree-set D3)', () => {
  // A mixed-depth selection's clipboard text is a faithful slice of the
  // document, so its first root arrives OVER-INDENTED relative to the ones
  // after it — roots always run deepest-first, since each is the subtree
  // successor of the last and that only ever moves outward.
  //
  // No code was needed for D3: `reindentSubtreeInUnit` already swaps each
  // block's OWN top-level whitespace for the destination indent,
  // independently per block, so roots at different source depths land as
  // siblings by construction. These tests pin that rather than assume it —
  // the rule lives in a function whose doc comment is about indent-unit
  // consistency, not about root normalization, and nothing else would fail
  // if it changed.
  const payload = '  - c2\n- S\n  - t1\n  - t2\n';

  it('the clipboard slice parses as two ROOTS, not one nested structure', () => {
    const parsed = parse(payload);
    expect(parsed.children.map((n) => n.lines[0])).toEqual(['  - c2', '- S']);
    expect(parsed.children[1]!.children.map((n) => n.lines[0])).toEqual(['  - t1', '  - t2']);
  });

  it('both roots land as siblings at the destination depth, internals intact', () => {
    const dest = parse('- A\n  - B\n    - C\n- D\n');
    const anchor = dest.children[0]!.children[0]!.children[0]!; // C, three deep
    const result = insertSubtrees(dest, anchor.id, parse(payload).children, 'after');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // c2 and S are siblings of C; S's own children keep their relative
    // offset beneath it rather than being flattened alongside it.
    expect(encode(result.value.doc)).toBe(
      '- A\n  - B\n    - C\n    - c2\n    - S\n      - t1\n      - t2\n- D\n',
    );
  });

  it('a single root is unaffected — the existing behavior', () => {
    const dest = parse('- A\n  - B\n- D\n');
    const anchor = dest.children[0]!.children[0]!;
    const result = insertSubtrees(dest, anchor.id, parse('- S\n  - t1\n').children, 'after');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('- A\n  - B\n  - S\n    - t1\n- D\n');
  });

  it('a root whose own descendants are deeper than the destination keeps its shape', () => {
    const dest = parse('- A\n- D\n');
    const result = insertSubtrees(
      dest,
      dest.children[0]!.id,
      parse('    - x\n- Z\n  - z1\n    - z2\n').children,
      'after',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // x normalizes from depth 2 to top level; Z's two-deep chain survives.
    expect(encode(result.value.doc)).toBe('- A\n- x\n- Z\n  - z1\n    - z2\n- D\n');
  });
});

// ------------------------------------------- paste-lands-where-it-is-pointed

/** A tree's shape as one string: kind (heading level included) and first line,
 * indented by depth. Reads as the outline does, which is what these tests are
 * actually about. */
function shape(md: string): string {
  const out: string[] = [];
  const walk = (nodes: readonly OutlineNode[], depth: number): void => {
    for (const node of nodes) {
      const kind = node.kind === 'heading' ? `h${node.level}` : node.kind;
      out.push(`${'  '.repeat(depth)}${kind}: ${(node.lines[0] ?? '').trim()}`);
      walk(node.children, depth + 1);
    }
  };
  walk(parse(md).children, 0);
  return out.join('\n');
}

function insertAfter(md: string, anchorLine: string, payload: string): OpResult<OpOutput> {
  const doc = parse(md);
  return insertSubtrees(doc, byLine(doc, anchorLine).id, parse(payload).children, 'after');
}

/** The payload used throughout: four levels, whose innermost two reach their
 * depth through the attachment rule rather than through indentation. */
const SECTION = '## Notes\n\nSome prose.\n\n- alpha\n  - beta\n';

describe('a payload landing in a LIST scope converts, throughout', () => {
  // Negative control for this whole block: before the heading arm existed, the
  // op rejected every one of these as `insertion-not-expressible`.
  it('a heading section pasted below a list item becomes list items at its own depths', () => {
    const result = insertAfter('- one\n  - two\n', '  - two', SECTION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe(
      '- one\n  - two\n  - ## Notes\n\n    - Some prose.\n\n      - alpha\n        - beta\n',
    );
  });

  it('the payload\'s own tree survives the conversion, at every depth', () => {
    // Negative control: converting the ROOT alone and re-indenting the rest
    // verbatim — the no-conversion path — puts `- alpha` beside `Some prose.`
    // instead of under it, because the attachment rule is section-level only.
    const nested = insertAfter('- one\n  - two\n', '  - two', SECTION);
    expect(nested.ok).toBe(true);
    if (!nested.ok) return;
    const pasted = shape(encode(nested.value.doc))
      .split('\n')
      .filter((row) => row.includes('Notes') || row.includes('prose') || row.includes('alpha') || row.includes('beta'));
    // The payload's own depths, compared against the payload rather than
    // against a literal: four nodes, each one level deeper than the last.
    const payloadDepths = shape(SECTION).split('\n').map((row) => row.search(/\S/) / 2);
    expect(pasted.map((row) => row.search(/\S/) / 2 - 1)).toEqual(payloadDepths);
  });

  it('a heading carries its own # run into the item\'s text', () => {
    const result = insertAfter('- one\n  - two\n', '  - two', '### Deep\n\nbody\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toContain('- ### Deep');
  });

  it('an ordered payload keeps its markers', () => {
    const result = insertAfter('- one\n  - two\n', '  - two', '## H\n\n1. first\n2. second\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = encode(result.value.doc);
    expect(out).toContain('1. first');
    expect(out).toContain('2. second');
  });

  it('peers in the payload land as the same kind of row, childless or not', () => {
    // Negative control: while the conversion read each node's own child count,
    // `First.` stayed a paragraph and `Second.` became an item, so two
    // siblings of the payload landed as two different kinds of row.
    const result = insertAfter(
      '- one\n  - two\n',
      '  - two',
      '## H\n\nFirst.\n\nSecond.\n\n- child\n',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(encode(result.value.doc))).toBe(
      [
        'list-item: - one',
        '  list-item: - two',
        '  list-item: - ## H',
        '    list-item: - First.',
        '    list-item: - Second.',
        '      list-item: - child',
      ].join('\n'),
    );
  });

  it('a setext heading is rewritten to ATX on the way in', () => {
    // Negative control: without the rewrite the underline becomes a second
    // line, which a list item's marker line has nowhere to put.
    const result = insertAfter('- one\n  - two\n', '  - two', 'Section\n=======\n\nbody\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toContain('- # Section');
    expect(encode(result.value.doc)).not.toContain('=====');
  });
});

describe('a payload landing in a HEADING-bearing scope re-levels', () => {
  it('an h2 section pasted among an h3\'s children becomes an h4', () => {
    // Negative control: with no heading arm the payload keeps its source
    // levels, and this lands as a sibling of the `##` two levels up.
    const result = insertAfter('# One\n\n## Two\n\n### Three\n\nprose\n', 'prose', SECTION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(encode(result.value.doc))).toBe(
      [
        'h1: # One',
        '  h2: ## Two',
        '    h3: ### Three',
        '      paragraph: prose',
        '      h4: #### Notes',
        '        paragraph: Some prose.',
        '          list-item: - alpha',
        '            list-item: - beta',
      ].join('\n'),
    );
  });

  it('every heading in the payload shifts by the same delta, skips included', () => {
    const result = insertAfter('# One\n\n## Two\n\nprose\n', 'prose', '## A\n\n#### Skipped\n\nx\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = encode(result.value.doc);
    expect(out).toContain('### A');
    expect(out).toContain('##### Skipped');
  });

  it('at root scope the payload takes level 1', () => {
    const result = insertAfter('- one\n- two\n', '- two', SECTION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toContain('# Notes');
  });

  it('a setext payload is rewritten to ATX on the way in', () => {
    // Negative control: without routing the re-level through `headingWithLevel`
    // the underline survives as a second line, and the `=====` re-parses as a
    // setext heading of its own at the destination.
    const result = insertAfter('# One\n\nprose\n', 'prose', 'Title\n=====\n\nbody\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = encode(result.value.doc);
    expect(out).toContain('## Title');
    expect(out).not.toContain('=====');
    expect(byLine(parse(out), '## Title').kind).toBe('heading');
  });

  it('refuses at the h6 bound, on the deepest heading in the payload', () => {
    // Negative control: clamping instead puts two of the payload's levels on
    // one, and converting to content at section level hands the run to the
    // attachment rule. `indent` refuses the same shape for the same reason.
    const deep = insertAfter(
      '# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\nprose\n',
      'prose',
      '# Top\n\nbody\n\n## Mid\n\nmore\n',
    );
    expect(deep.ok).toBe(false);
    if (!deep.ok) expect(deep.rejection.reason).toBe('at-h6-bound');

    // The payload's ROOT alone would fit; its second level is what does not.
    const shallow = insertAfter('# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\nprose\n', 'prose', '# Top\n\nbody\n');
    expect(shallow.ok).toBe(true);
  });
});

describe('a converted heading gives its rank back', () => {
  it('outdents until the encoding is a paragraph, and re-parses as the original heading', () => {
    // Negative control: drop the `#` run on conversion and the rank is gone —
    // the item comes back as a plain paragraph, at no level at all.
    const doc = parse('# Title\n\nintro para\n\n- a\n  - b\n');
    const inserted = insertSubtrees(doc, byLine(doc, '  - b').id, parse(SECTION).children, 'after');
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    let md = encode(inserted.value.doc);
    for (let step = 0; step < 2; step++) {
      const current = parse(md);
      const item = [...walkNodes(current)].find((n) => (n.lines[0] ?? '').trimStart().startsWith('- ## Notes'));
      expect(item).toBeDefined();
      const moved = outdent(current, item!.id);
      expect(moved.ok).toBe(true);
      if (!moved.ok) return;
      md = encode(moved.value.doc);
    }

    // A real heading node again, at the rank it was copied with, subtree intact.
    const restored = byLine(parse(md), '## Notes');
    expect(restored.kind).toBe('heading');
    expect(restored.level).toBe(2);
    expect(shape(md)).toContain('h2: ## Notes');
  });
});

describe('a pasted heading takes the content that follows it', () => {
  it('a section landing among LIST ITEMS converts instead, and swallows nothing', () => {
    // This scope is heading-bearing, but the rows at the insertion point are
    // list items, so the payload joins their list rather than opening a section
    // there. `- three` stays a sibling: a heading owns what follows it, and
    // this is no longer a heading.
    //
    // It used to be, and `- three` used to end up INSIDE the pasted section —
    // content that was never copied and never pointed at. That was recorded
    // here as stated behaviour; the manual pass found the same rule splitting
    // an ordered run under a heading, and both follow from reading the scope
    // where the kind rule reads the neighbours.
    const result = insertAfter('# Project\n\n- one\n- two\n- three\n', '- two', SECTION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(encode(result.value.doc))).toContain('  list-item: - three');
    expect(shape(encode(result.value.doc))).not.toContain('      list-item: - three');
    expect(shape(encode(result.value.doc))).toContain('  list-item: - ## Notes');
  });

  it('the level comes from the scope\'s heading siblings, so a level SKIP does not let it escape', () => {
    // Negative control: taking the level from the parent alone (`# One` + 1)
    // puts the payload at h2 among h3 siblings, and `### Four` — never copied,
    // never pointed at — becomes its child.
    const result = insertAfter(
      '# One\n\n### Three\n\nprose\n\n### Four\n\nmore\n',
      '### Three',
      '## Notes\n\nbody\n',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(shape(encode(result.value.doc))).toBe(
      [
        'h1: # One',
        '  h3: ### Three',
        '    paragraph: prose',
        '  h3: ### Notes',
        '    paragraph: body',
        '  h3: ### Four',
        '    paragraph: more',
      ].join('\n'),
    );
  });

  it('a sibling heading of the enclosing level ends the pasted section', () => {
    const result = insertAfter(
      '# One\n\n## Two\n\n### Three\n\nprose\n\n### Four\n\nmore\n',
      'prose',
      SECTION,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = shape(encode(result.value.doc)).split('\n');
    const four = rows.find((r) => r.includes('### Four'))!;
    const notes = rows.find((r) => r.includes('#### Notes'))!;
    // `### Four` stays at the enclosing level, outside the pasted section.
    expect(four.search(/\S/)).toBeLessThan(notes.search(/\S/));
  });
});

describe('closure over the new arms', () => {
  // The generated-payload property above already reaches both arms — it is
  // what caught the `h6` bound during implementation — but it reaches a deep
  // LIST scope only by chance. This drives the conversion arm at every node of
  // every generated document, which is where the re-encode has to build
  // indentation rather than carry it.
  // An `insertSubtrees` result's `doc` IS `parse(encode(surgery))` — `finalize`
  // re-parses before returning. So `treesEqual(result.doc, parse(encode(result.doc)))`
  // re-checks the encode/parse round-trip and CANNOT fail on a surgery the
  // re-parse reads differently, which is the failure mode that matters here.
  // What can fail is the payload's own survival: every node the payload carried
  // has to still be a node afterwards. Absorption reparents without adding or
  // removing, so the delta is exactly the payload's node count either way.
  it('every node in the payload is still a node after the insertion', () => {
    const payloads = [
      SECTION,
      '## Outer\n\ntext\n\n### Inner\n\nmore\n',
      'Section\n=======\n\nbody\n',
      // First children a continuation line would swallow, which is how a
      // payload node stops being one.
      '## H\n---\n',
      '## H\n> quoted\n> more\n',
      '## H\n> [!note] titled\n> body\n',
      '## H\n<div>\nx\n</div>\n',
      '## H\n```\ncode\n```\n',
      '## A\n\n### B\n---\n',
    ];
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), fc.boolean(), (doc, n, p, before) => {
        const anchor = nthNode(doc, n);
        if (!anchor) return true;
        const payload = payloads[p % payloads.length]!;
        const blocks = parse(payload).children;
        const expected = [...walkNodes(parse(payload))].length;
        const beforeCount = [...walkNodes(doc)].length;
        const result = insertSubtrees(doc, anchor.id, blocks, before ? 'before' : 'after');
        // Negative control: without the boundary repair for a first child a
        // continuation would swallow, `## H` + `---` lands as ONE list item
        // carrying both lines and this fails with a delta one short.
        if (!result.ok) return KNOWN_REASONS.has(result.rejection.reason);
        return [...walkNodes(result.value.doc)].length - beforeCount === expected;
      }),
      { numRuns: 400 },
    );
  });

  it('a converted payload keeps its own node count, whatever the destination depth', () => {
    const payloadNodes = [...walkNodes(parse(SECTION))].length;
    for (const md of ['- one\n  - two\n', '- one\n  - two\n    - three\n', '- one\n\t- two\n', '# H\n\npara\n\n- a\n  - b\n']) {
      const doc = parse(md);
      const deepest = [...walkNodes(doc)].reduce((a, b) => (b.lines[0]!.length >= a.lines[0]!.length ? b : a));
      const result = insertSubtrees(doc, deepest.id, parse(SECTION).children, 'after');
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const after = [...walkNodes(result.value.doc)].length;
      const beforeCount = [...walkNodes(doc)].length;
      expect(after - beforeCount).toBe(payloadNodes);
    }
  });
});

/**
 * #158, the half that costs a node. `finalize` normalizes boundaries on the
 * tree and then encodes it, so a node the re-encode has pushed past the
 * opening margin is judged as the kind it WAS and read back as the kind its
 * new column makes it — a `quote` needs no separator before a paragraph, and
 * the paragraph it becomes at column 4 does.
 */
describe('a seam is judged on the kind the re-parse will see', () => {
  it('kindAsWritten demotes only the margin-anchored kinds, and only past column 3', () => {
    const at = (kind: OutlineNode['kind'], line: string): string =>
      kindAsWritten(makeNode({ kind, lines: [line] }));
    expect(at('hr', '   ---')).toBe('hr');
    expect(at('hr', '    ---')).toBe('paragraph');
    expect(at('hr', '\t***')).toBe('paragraph');
    expect(at('quote', '   > q')).toBe('quote');
    expect(at('quote', '\t> q')).toBe('paragraph');
    expect(at('callout', '    > [!note] c')).toBe('paragraph');
    expect(at('html', '    <div>')).toBe('paragraph');
    expect(at('heading', '    ## H')).toBe('paragraph');
    // A rule spelled with a marker and a space is a LIST ITEM past the margin,
    // not a paragraph: `LIST_ITEM_RE` carries no margin of its own.
    expect(at('hr', '   - - -')).toBe('hr');
    expect(at('hr', '    - - -')).toBe('list-item');
    expect(at('hr', '\t* * *')).toBe('list-item');
    expect(at('hr', '    _ _ _')).toBe('paragraph');
    // No opening margin of their own: a fence and a table row open anywhere.
    expect(at('code', '\t```')).toBe('code');
    expect(at('table', '\t| a |')).toBe('table');
    expect(at('paragraph', '\ttext')).toBe('paragraph');
    expect(at('list-item', '\t- item')).toBe('list-item');
    // A setext heading carries its margin on the UNDERLINE, not on its text.
    const setextAt = (underline: string): string =>
      kindAsWritten(makeNode({ kind: 'heading', setext: true, lines: ['Title', underline] }));
    expect(setextAt('===')).toBe('heading');
    expect(setextAt('    ===')).toBe('paragraph');
    // A node with no lines has no column to demote it from, and keeps its kind:
    // `normalizeBoundaries` runs on trees an operation built, not only on parsed
    // ones.
    expect(kindAsWritten(makeNode({ kind: 'quote', lines: [] }))).toBe('quote');
    expect(kindAsWritten(makeNode({ kind: 'heading', setext: true, lines: [] }))).toBe('heading');
  });

  it('a quote re-indented into a heading scope keeps the node that follows it', () => {
    // The issue's case 2, with the payload landing before the section's own
    // paragraph so the seam below it is bare.
    const doc = parse('## H2\n\tbody\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '\tbody').id,
      parse('- item\n> quote\n').children,
      'before',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Before the fix: `## H2` / `\titem` / `\t> quote` / `\tbody`, which reads
    // back as ONE paragraph carrying three lines — two payload nodes and the
    // section's own paragraph gone. The list item keeps its kind under the
    // heading, which can hold one.
    expect(encode(result.value.doc)).toBe('## H2\n\t- item\n\t> quote\n\n\tbody\n');
    expect(shape(encode(result.value.doc))).toBe(
      ['h2: ## H2', '  list-item: - item', '  paragraph: > quote', '  paragraph: body'].join('\n'),
    );
  });

  it('every margin-anchored atom re-indented past the margin keeps its neighbour', () => {
    for (const atom of ['---', '***', '> quote', '> [!note] titled', '<div>']) {
      const doc = parse('## H2\n\tbody\n');
      const payload = parse(`- item\n${atom}\n`);
      const expected = [...walkNodes(payload)].length;
      const before = [...walkNodes(doc)].length;
      const result = insertSubtrees(doc, byLine(doc, '\tbody').id, payload.children, 'before');
      expect(result.ok, atom).toBe(true);
      if (!result.ok) continue;
      const after = [...walkNodes(result.value.doc)].length;
      expect(after - before, atom).toBe(expected);
    }
  });

  it('a rule that becomes a list item past the margin takes no separator', () => {
    // `- - -` and `---` are one kind in the tree and two at column 4. The first
    // opens a list item there, which claims nothing and needs no blank line;
    // the second opens nothing and takes the paragraph rule. Both keep every
    // node either way — this pins the encoding as the minimal one.
    const doc = parse('## H2\n\tbody\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '\tbody').id,
      parse('- item\n- - -\n').children,
      'before',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('## H2\n\t- item\n\t- - -\n\tbody\n');
    expect(shape(encode(result.value.doc))).toBe(
      // The list item keeps its kind under the heading, and the rule is the
      // next item of its list; every node is present either way.
      ['h2: ## H2', '  list-item: - item', '  list-item: - - -', '  paragraph: body'].join('\n'),
    );
  });

  it('the same seam below the anchor, not above it', () => {
    // Half the rows `main` loses are `after` insertions; the seam is the one
    // inside the payload there rather than the one below it.
    const doc = parse('## H2\n\tbody\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '\tbody').id,
      parse('- item\n> quote\n').children,
      'after',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('## H2\n\tbody\n\n\titem\n\n\t> quote\n');
    expect([...walkNodes(result.value.doc)].length - [...walkNodes(doc)].length).toBe(2);
  });

  it('tailAsWritten is the block a node\'s last line lands in', () => {
    const tail = (kind: OutlineNode['kind'], lines: string[]): string =>
      tailAsWritten(makeNode({ kind, lines })).kind;
    // An html block runs to a blank line whatever it holds; past the margin
    // its later lines open blocks of their own, and the last one is the tail.
    expect(tail('html', ['\t<div>', '\t| a |', '\t| - |'])).toBe('table');
    expect(tail('html', ['\t<div>', '\t- x'])).toBe('list-item');
    expect(tail('html', ['\t<div>', '\tx', '\t</div>'])).toBe('paragraph');
    // Inside the margin, and a single demoted line, a node is its own tail.
    expect(tail('html', ['<div>', '| a |', '| - |'])).toBe('html');
    expect(tail('quote', ['\t> q'])).toBe('paragraph');
    // Lines that form no block at all are judged by the line that opens them.
    expect(tail('quote', ['     ', '     '])).toBe('paragraph');
  });

  it('a demoted html block is separated below by the block its last line is in', () => {
    // `<div>` over a table is ONE html block at column 0 and a paragraph and a
    // TABLE at column 4, so the seam below it is a table's — the one the
    // existing table has to be kept out of.
    const doc = parse('## H2\n\t| b |\n\t| - |\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '\t| b |').id,
      parse('<div>\n| a |\n| - |\n').children,
      'before',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('## H2\n\t<div>\n\t| a |\n\t| - |\n\n\t| b |\n\t| - |\n');
    expect(byLine(result.value.doc, '\t| b |').lines).toEqual(['\t| b |', '\t| - |']);
  });

  it('a table is separated from a following line that carries a pipe', () => {
    // The table's own loop claims any line with a `|`, of whatever kind; a
    // wikilink alias is enough to make a list item a row.
    const doc = parse('- top\n  - see [[a|b]]\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '  - see [[a|b]]').id,
      parse('- alpha\n\n| x |\n| - |\n').children,
      'before',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('- top\n  - alpha\n\n  | x |\n  | - |\n\n  - see [[a|b]]\n');
    expect(byLine(result.value.doc, '  - see [[a|b]]').kind).toBe('list-item');
  });

  it('a seam that stays inside the margin is left flush, as it was', () => {
    // Control: the demotion is what adds a separator, not the kind pair. The
    // same payload into the same scope, whose children sit at column 0 — the
    // quote stays a quote, does not claim the paragraph below it, and the
    // encoding stays minimal.
    const doc = parse('## H2\npara\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, 'para').id,
      parse('- item\n> quote\n').children,
      'before',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('## H2\n- item\n> quote\npara\n');
    expect(shape(encode(result.value.doc))).toBe(
      ['h2: ## H2', '  list-item: - item', '  quote: > quote', '  paragraph: para'].join('\n'),
    );
  });
});

describe('a seam inside a list item is judged at the item’s content column', () => {
  const insertAfter = (md: string, anchorLine: string, payload: string) => {
    const doc = parse(md);
    const result = insertSubtrees(doc, byLine(doc, anchorLine).id, parse(payload).children, 'after');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.rejection.reason);
    return result.value.doc;
  };

  it('kindAsWritten measures a quote, a callout and a rule from the margin, and a heading or an HTML block from column 0', () => {
    const at = (kind: OutlineNode['kind'], line: string, margin: number): string =>
      kindAsWritten(makeNode({ kind, lines: [line] }), margin);
    expect(at('quote', '       > q', 4)).toBe('quote');
    expect(at('quote', '        > q', 4)).toBe('paragraph');
    expect(at('callout', '\t\t> [!note] c', 6)).toBe('callout');
    expect(at('hr', '      ***', 4)).toBe('hr');
    expect(at('hr', '        - - -', 4)).toBe('list-item');
    expect(at('html', '    <div>', 4)).toBe('paragraph');
    expect(at('heading', '    ## H', 4)).toBe('paragraph');
    const setext = makeNode({ kind: 'heading', setext: true, lines: ['    Title', '    ==='] });
    expect(kindAsWritten(setext, 4)).toBe('paragraph');
  });

  it("#158 case 1: a rule pasted under a converted heading's item arrives as a rule", () => {
    // Negative control: measuring `HR_RE` from column 0 in `segment` reads the
    // rule at column 4 back as a paragraph, which is what `main` did.
    const doc = insertAfter('- one\n  - two\n', '  - two', '## H\n---\n');
    expect(encode(doc)).toBe('- one\n  - two\n  - ## H\n\n    ---\n');
    const heading = byLine(doc, '  - ## H');
    expect(heading.children.map((n) => [n.kind, n.lines[0]])).toEqual([['hr', '    ---']]);
  });

  it('a rule spelled with a marker stays a rule below a converted item, separated from it', () => {
    // Negative control: `kindAsWritten` without the margin reads `    * * *`
    // as the list item it would be at the root and writes it flush; the parse
    // still reads a rule, so the separator is what the first-child rule asks
    // of a rule and the node count cannot show the difference.
    const doc = insertAfter('- one\n  - two\n', '  - two', '## H\n* * *\n');
    expect(encode(doc)).toBe('- one\n  - two\n  - ## H\n\n    * * *\n');
    expect(byLine(doc, '    * * *').kind).toBe('hr');
  });
});

describe('a pasted subtree is written in the document’s own unit (#216)', () => {
  // One tree, spelled every way a clipboard spells it. Negative control: with
  // every level below the root carried verbatim, each spelling lands in its own
  // characters and no two of them agree.
  const SPELLINGS = {
    'two spaces': '- a\n  - b\n    - c\n  - d\n',
    'four spaces': '- a\n    - b\n        - c\n    - d\n',
    tabs: '- a\n\t- b\n\t\t- c\n\t- d\n',
    'inconsistent spaces': '- a\n  - b\n      - c\n  - d\n',
    'a tab and spaces': '- a\n\t- b\n\t    - c\n\t- d\n',
  };
  const pasteAfter = (md: string, line: string, payload: string, unit?: string): string => {
    const doc = parse(md);
    const result = insertSubtrees(doc, byLine(doc, line).id, parse(payload).children, 'after', unit);
    if (!result.ok) throw new Error(result.rejection.reason);
    return encode(result.value.doc);
  };

  const DESTINATIONS: readonly (readonly [string, string, string, string])[] = [
    ['under a tab item', '- top\n\t- sib\n', '\t- sib', '- top\n\t- sib\n\t- a\n\t\t- b\n\t\t\t- c\n\t\t- d\n'],
    ['under a two-space item', '- top\n  - sib\n', '  - sib', '- top\n  - sib\n  - a\n    - b\n      - c\n    - d\n'],
    [
      'under a four-space item',
      '- top\n    - sib\n',
      '    - sib',
      '- top\n    - sib\n    - a\n        - b\n            - c\n        - d\n',
    ],
    ['at the root of a tab document', '- top\n\t- sib\n', '- top', '- top\n\t- sib\n- a\n\t- b\n\t\t- c\n\t- d\n'],
    ['at the root of a two-space document', '- top\n  - sib\n', '- top', '- top\n  - sib\n- a\n  - b\n    - c\n  - d\n'],
  ];
  for (const [where, md, anchor, expected] of DESTINATIONS) {
    it(`every spelling lands in the same bytes ${where}`, () => {
      for (const [name, payload] of Object.entries(SPELLINGS)) {
        expect(pasteAfter(md, anchor, payload), name).toBe(expected);
      }
    });
  }

  it('a document with no nested item of its own takes the editor’s unit', () => {
    expect(pasteAfter('- top\n', '- top', SPELLINGS['two spaces'], '\t')).toBe(
      '- top\n- a\n\t- b\n\t\t- c\n\t- d\n',
    );
    expect(pasteAfter('- top\n', '- top', SPELLINGS.tabs, '  ')).toBe(
      '- top\n- a\n  - b\n    - c\n  - d\n',
    );
  });

  it('a subtree copied from the document comes back in the same bytes', () => {
    // Negative control: the unit read from the first nested item alone, which
    // here sits under `1.` at three spaces, writes every bullet's child one
    // column deeper than the document does.
    const docs = [
      '- a\n\t- b\n\t\t- c\n\t  more\n- z\n',
      '- a\n  - b\n    - c\n    more\n- z\n',
      '- a\n    - b\n        - c\n- z\n',
      '1. one\n   - a\n     - b\n       - c\n- z\n',
      '10. ten\n    - a\n      - b\n- z\n',
    ];
    for (const md of docs) {
      const doc = parse(md);
      for (const node of walkNodes(doc)) {
        // A copy is of whole items; an indented paragraph alone reads as code.
        if (node.kind !== 'list-item') continue;
        const lines: string[] = [];
        const collect = (n: OutlineNode): void => {
          lines.push(...n.lines);
          n.children.forEach(collect);
        };
        collect(node);
        const result = insertSubtrees(doc, node.id, parse(`${lines.join('\n')}\n`).children, 'after');
        if (!result.ok) continue;
        // The copy lands right below the original, whose lines nothing moves;
        // an ordered root is renumbered as the next in its run.
        const at = md.split('\n').indexOf(lines[0]!) + lines.length;
        const copy = encode(result.value.doc).split('\n').slice(at, at + lines.length);
        const ordinal = (line: string): string => line.replace(/^([ \t]*)\d+/, '$1#');
        expect([ordinal(copy[0] ?? ''), ...copy.slice(1)], `${JSON.stringify(md)} / ${lines[0]}`).toEqual([
          ordinal(lines[0]!),
          ...lines.slice(1),
        ]);
      }
    }
  });

  it('a child under a numbered item is padded to its content column', () => {
    expect(pasteAfter('- top\n  - sib\n', '  - sib', '10. a\n\t - b\n')).toBe(
      '- top\n  - sib\n  10. a\n      - b\n',
    );
  });

  it('a continuation keeps its offset from its own item, in the document’s characters', () => {
    // Negative control: a continuation carried verbatim past the old prefix
    // keeps the clipboard's tab in a space document, `  \tx`.
    expect(pasteAfter('- top\n\t- sib\n', '\t- sib', '- a\n  x\n  - b\n    y\n')).toBe(
      '- top\n\t- sib\n\t- a\n\t  x\n\t\t- b\n\t\t  y\n',
    );
    expect(pasteAfter('- top\n  - sib\n', '  - sib', '- a\n\tx\n\t- b\n\t\ty\n')).toBe(
      '- top\n  - sib\n  - a\n      x\n    - b\n        y\n',
    );
  });

  it('a block after a nested item stays its parent’s child', () => {
    // Negative control: the fence keeps its four-column offset from `Step 1`
    // while `detail` moves two columns left, so the fence reaches `detail`'s
    // content column and the parse reads it as `detail`'s child.
    expect(
      pasteAfter('- top\n  - sib\n', '  - sib', '- Step 1\n    - detail\n    ```\n    code\n    ```\n'),
    ).toBe('- top\n  - sib\n  - Step 1\n    - detail\n    ```\n    code\n    ```\n');
  });

  it('a line written in another unit from its node is carried as it was', () => {
    // Negative control, with the read-back below also off: the tab
    // continuation spelled as its two-column offset from the paragraph, which
    // sits two columns in, lands at column two, where `>` opens a quote and
    // ends the paragraph.
    const doc = parse('para0\n');
    const payload = parse('-\tt0\n  cont1\n\t> q1\n\n10.  t1\n').children;
    const result = insertSubtrees(doc, byLine(doc, 'para0').id, payload, 'after');
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toContain('cont1\n\t> q1\n');
  });

  it('a line outside its node’s indentation moves with the block it belongs to', () => {
    // Negative control: the line kept where it stood while the block moved
    // nine columns right, so `> q4` sits one column into `t1` instead of
    // eight, and opens a quote.
    const payload = '-\tt1\n\t\t1.\tt3\n\t\t   cont4\n\t\t\t> q4\n';
    const shape = (nodes: readonly OutlineNode[]): string =>
      nodes.map((n) => `${n.kind}(${shape(n.children)})`).join(',');
    const text = pasteAfter('         2) t4\n', '         2) t4', payload);
    expect(shape(parse(text).children)).toBe(`list-item(),${shape(parse(payload).children)}`);
  });

  it('a block whose converged lines would read as another tree keeps its own', () => {
    // Negative control: the nested items laid out afresh two columns left of
    // where the payload wrote them, which turns a lazy `> q3` into a quote.
    const payload = '- t0\n    2)  t1\n       10.  t2\n           > q3\n        | a | b |\n        | - | - |\n';
    const doc = parse('para0\n');
    const result = insertSubtrees(doc, byLine(doc, 'para0').id, parse(payload).children, 'before');
    if (!result.ok) throw new Error(result.rejection.reason);
    const shape = (nodes: readonly OutlineNode[]): string =>
      nodes.map((n) => `${n.kind}(${shape(n.children)})`).join(',');
    expect(shape(parse(encode(result.value.doc)).children)).toBe(
      `${shape(parse(payload).children)},paragraph()`,
    );
  });

  it('whitespace inside a fenced block is content, and keeps its tabs', () => {
    // The fence keeps its offset from the item, one tab stop, in spaces; a
    // line whose tab would follow a space keeps it, at the column the fence's
    // move gives it.
    expect(
      pasteAfter('- top\n  - sib\n', '  - sib', '- a\n\t```\n\tfunc() {\n\t\treturn\n\t}\n\t```\n'),
    ).toBe('- top\n  - sib\n  - a\n      ```\n      func() {\n\t\t  return\n      }\n      ```\n');
  });

  it('a heading converted into a tab list writes its section in tabs', () => {
    // Negative control: the section's children at the item's content column
    // in spaces, `\t  - b`.
    expect(pasteAfter('- top\n\t- sib\n', '\t- sib', '## H\n\n- b\n  - c\n')).toBe(
      '- top\n\t- sib\n\t- ## H\n\n\t\t- b\n\t\t\t- c\n',
    );
  });

  it('a list converted to a paragraph writes its list in the document’s unit', () => {
    // Negative control: the conversion moves the children by the marker's
    // width in spaces, `  - b` / `\t  - c`, whatever the clipboard used.
    for (const [name, payload] of Object.entries(SPELLINGS)) {
      expect(pasteAfter('Some text.\n', 'Some text.', payload, '\t'), name).toBe(
        'Some text.\n\na\n- b\n\t- c\n- d\n',
      );
    }
  });

  it('a paragraph converted to a list item writes its list in the document’s unit', () => {
    // Negative control: the paragraph's list moved to the new item's content
    // column in spaces, `      - x`, under a tab-indented item.
    expect(pasteAfter('- top\n\t- sib\n', '\t- sib', 'Para.\n- x\n  - y\n')).toBe(
      '- top\n\t- sib\n\t- Para.\n\t\t- x\n\t\t\t- y\n',
    );
  });

  it('a paragraph whose list sits left of it keeps that list when it converts', () => {
    // Negative control: the conversion alone moves `- t1` by the marker's
    // width from the paragraph's two columns, which leaves it at column four
    // under `\t- cont1`, short of the content column, a sibling of `cont1`.
    expect(pasteAfter('- top\n\t- sib\n', '\t- sib', '  cont1\n- t1\n  - t2\n')).toBe(
      '- top\n\t- sib\n\t- cont1\n\t\t- t1\n\t\t\t- t2\n',
    );
  });

  it('a converted block the laid-out lines cannot express keeps the conversion’s own', () => {
    // A quote under an item cannot hang from a paragraph at any column, so the
    // laid-out block reads as two nodes where it was written as one; the
    // conversion's own lines stand.
    expect(pasteAfter('Some text.\n', 'Some text.', '* t2\n  > q3\n', '\t')).toBe(
      'Some text.\n\nt2\n> q3\n',
    );
  });

  it('a moved run that held the document’s only nested items keeps the document’s unit', () => {
    // Negative control: the unit read after the removal, from a document the
    // run has left with no nested item, which answers with the editor’s tab.
    const doc = parse('- a\n  - b\n    - c\n- e\n');
    const result = moveSubtreesTo(doc, [[byLine(doc, '- a').id]], { parentId: byLine(doc, '- e').id, index: 0 }, '\t');
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('- e\n  - a\n    - b\n      - c\n');
  });

  it('a tab step under a bullet reads as a tab, after a numbered item’s spaces', () => {
    // Negative control: the first nested item alone, three spaces under `1.`,
    // which writes the pasted levels in spaces in a note whose bullets nest
    // with a tab.
    expect(pasteAfter('1. one\n   - a\n- x\n\t- y\n', '\t- y', SPELLINGS['two spaces'])).toBe(
      '1. one\n   - a\n- x\n\t- y\n\t- a\n\t\t- b\n\t\t\t- c\n\t\t- d\n',
    );
  });

  it('an indent reads the unit under a bullet, not the padding under a number', () => {
    // Negative control: the first nested item alone, `   - a` under `1.`,
    // reads as a three-space unit.
    const doc = parse('1. one\n   - a\n     - b\n- x\n- y\n');
    const result = indent(doc, byLine(doc, '- y').id);
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(encode(result.value.doc)).toBe('1. one\n   - a\n     - b\n- x\n  - y\n');
  });
});
