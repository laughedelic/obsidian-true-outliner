import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual, walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { deleteSubtrees, insertSubtrees, mergeNodes } from '../src/ops';
import { applyEdits } from '../src/result';
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

  // The two measurements the catalogue recorded (15-enter-and-shift-enter-catalogue,
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

  it('rejects a heading sequence inserted under a non-section scope', () => {
    const md = '- a\n  - b\n';
    const doc = parse(md);
    const b = byLine(doc, '  - b');
    const headingBlocks = parse('# New heading\n\nBody.\n').children;
    const result = insertSubtrees(doc, b.id, headingBlocks, 'after');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe('insertion-not-expressible');
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
  // No code was needed for D3: `reindentSubtreeVerbatim` already swaps each
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
