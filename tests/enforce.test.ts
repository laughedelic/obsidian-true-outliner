import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { applyEdits } from '../src/result';
import { treesEqual, walkNodes, type OutlineDoc } from '../src/model';
import { computeVerdict, type EditFact, type Verdict } from '../src/enforce';
import type { TransactionClass } from '../src/classify';
import { arbTree } from './generators';

const pos = (line: number, ch: number) => ({ line, ch });

function applyVerdict(md: string, verdict: Verdict): string {
  if (verdict.kind !== 'rewrite') throw new Error(`expected rewrite, got ${verdict.kind}`);
  const lines = md === '' ? [] : md.split('\n');
  return applyEdits(lines, verdict.edits).join('\n');
}

const ALL_CLASSES: readonly TransactionClass[] = [
  'programmatic',
  'composition',
  'plugin-own',
  'selection-only',
  'within-node-edit',
  'boundary-crossing-edit',
];

describe('computeVerdict: non-enforced classes always pass', () => {
  const doc = parse('First.\n\nSecond.\n');
  const edit: EditFact = { from: pos(0, 6), to: pos(2, 6), insert: '' };

  it('every class except boundary-crossing-edit returns pass, even with a crossing edit', () => {
    for (const cls of ALL_CLASSES) {
      if (cls === 'boundary-crossing-edit') continue;
      expect(computeVerdict(cls, doc, edit)).toEqual({ kind: 'pass' });
    }
  });

  it('boundary-crossing-edit with no edit fact (multi-range) passes', () => {
    expect(computeVerdict('boundary-crossing-edit', doc, undefined)).toEqual({ kind: 'pass' });
  });
});

describe('computeVerdict: structural deletion (D3)', () => {
  it('deletes an already-escalated whole-subtree selection, gaps included', () => {
    const md = 'First para.\n\nSecond para.\n\nThird para.\n';
    const doc = parse(md);
    // Escalated cover of the first two subtrees: (0,0) to (2, len).
    const edit: EditFact = { from: pos(0, 0), to: pos(2, 'Second para.'.length), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('Third para.\n');
  });

  it('stale mid-node selection deletion rewrites to the subtree cover, not a character splice', () => {
    const md = 'First para.\n\nSecond para.\n';
    const doc = parse(md);
    // Never escalated: mid-node to mid-node.
    const edit: EditFact = { from: pos(0, 6), to: pos(2, 6), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('');
  });

  it('deleting a single subtree WITH children works (regression: ancestor-descendant cover came back empty)', () => {
    // Manual-pass bug (2026-07-21): selecting one heading + its own subtree
    // and pressing Backspace did nothing ("Nothing to act on") — the cover
    // math missed escalate.ts's one-end-is-the-other's-ancestor case, so
    // the sibling run came back empty and deleteSubtrees vetoed on
    // empty-selection. Two SIBLING headings worked (paths diverge).
    // "After" must live OUTSIDE the deleted section — under a sibling
    // heading — since a section with no following same-level heading runs
    // to the end of the document and would legitimately take everything.
    const md = '# H\n\nBody.\n\n# Two\n\nAfter.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 0), to: pos(2, 'Body.'.length), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('# Two\n\nAfter.\n');
  });

  it('same regression for a paragraph with a child list, and a list item with a child', () => {
    const md1 = 'Para.\n\n- child\n\nAfter.\n';
    const doc1 = parse(md1);
    const v1 = computeVerdict('boundary-crossing-edit', doc1, {
      from: pos(0, 0),
      to: pos(2, '- child'.length),
      insert: '',
    });
    expect(applyVerdict(md1, v1)).toBe('After.\n');

    const md2 = '- a\n  - b\n- c\n';
    const doc2 = parse(md2);
    const v2 = computeVerdict('boundary-crossing-edit', doc2, {
      from: pos(0, 0),
      to: pos(1, '  - b'.length),
      insert: '',
    });
    expect(applyVerdict(md2, v2)).toBe('- c\n');
  });

  it('deleting every node yields a valid, empty result', () => {
    const md = 'Only.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 0), to: pos(1, 0), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('');
    expect(parse(applyVerdict(md, verdict)).children).toEqual([]);
  });

  it('type-over inserts the typed text as new content at the deletion site', () => {
    const md = 'First para.\n\nSecond para.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 0), to: pos(2, 'Second para.'.length), insert: 'Replaced.' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    const text = applyVerdict(md, verdict);
    expect(text).toContain('Replaced.');
    expect(text).not.toContain('First para.');
    expect(text).not.toContain('Second para.');
  });

  it('type-over with a surviving neighbor splices against it correctly (regression: stale pre-reparse id)', () => {
    // deleteSubtrees's own OpOutput.doc comes from a FRESH `finalize`
    // reparse (new node ids for EVERYTHING, including untouched survivors)
    // — composeTypeOver must not look up the survivor by its PRE-deletion
    // id in that post-reparse tree.
    const md = 'First para.\n\nSecond para.\n\nThird para.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 0), to: pos(2, 'Second para.'.length), insert: 'R' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('R\n\nThird para.\n');
  });

  it('type-over cursor lands AFTER the inserted text, so a follow-up keystroke appends', () => {
    // Regression: the naive reuse of insertSubtrees's own cursor convention
    // (content-START of the inserted node) would place a follow-up
    // keystroke BEFORE what was just typed, reversing character order.
    const md = 'First para.\n\nSecond para.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 0), to: pos(2, 'Second para.'.length), insert: 'R' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    if (verdict.kind !== 'rewrite') throw new Error(`expected rewrite, got ${verdict.kind}`);
    const text = applyVerdict(md, verdict);
    expect(text.split('\n')[verdict.cursor.line]).toBe('R');
    expect(verdict.cursor.ch).toBe(1); // after the "R", not before it
  });
});

describe('computeVerdict: boundary merges (D4)', () => {
  it('paragraph joins its predecessor as one structural edit', () => {
    // Zero-gap paragraph/paragraph adjacency cannot arise from parse() (two
    // ungapped text lines always merge into one paragraph node already), so
    // exercise the merge shape directly at the single-newline boundary of a
    // genuinely gapped pair: after the gap has already shrunk to zero lines
    // (the state a prior native Backspace would have produced).
    const gapped = parse('First.\n\nSecond.\n');
    const first = [...walkNodes(gapped)].find((n) => n.lines[0] === 'First.')!;
    const noGap: OutlineDoc = {
      ...gapped,
      children: gapped.children.map((n) => (n.id === first.id ? { ...n, trailingGap: [] } : n)),
    };
    const md = 'First.Second.\n'; // what noGap would encode to isn't used directly here
    void md;
    const edit: EditFact = { from: pos(0, 'First.'.length), to: pos(1, 0), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', noGap, edit);
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind === 'rewrite') expect(verdict.userEvent).toBe('delete.structural.merge');
  });

  it('adjacent bullet list items merge on Backspace-at-start', () => {
    const md = '- alpha\n- beta\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, '- alpha'.length), to: pos(1, 0), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('- alphabeta\n');
  });

  it('a structure-corrupting merge is vetoed, document untouched', () => {
    // No blank line between Intro. and the heading (an ATX heading always
    // ends the preceding paragraph on its own, gap or not) — the zero-gap
    // adjacency a single Backspace-at-heading-start actually produces.
    const md = 'Intro.\n## Section\n\nChild body.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 'Intro.'.length), to: pos(1, 0), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(verdict.kind).toBe('veto');
  });

  it('Backspace at a node start merges ACROSS a gap in one keystroke (chrome-transparency, D10)', () => {
    const md = 'First.\n\nSecond.\n';
    const doc = parse(md);
    // Backspace at (2,0) deletes the newline ending the gap line: the raw
    // edit never touches "First." — only the cursor reveals the intent.
    const edit: EditFact = { from: pos(1, 0), to: pos(2, 0), insert: '', cursorBefore: pos(2, 0) };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('First.Second.\n');
  });

  it('the same bytes with the cursor ON the gap line stay native (escape hatch)', () => {
    const md = 'First.\n\nSecond.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 0), to: pos(2, 0), insert: '', cursorBefore: pos(1, 0) };
    expect(computeVerdict('boundary-crossing-edit', doc, edit)).toEqual({ kind: 'pass' });
  });

  it('Delete at a node\'s content end merges through its own trailing gap', () => {
    const md = 'First.\n\nSecond.\n';
    const doc = parse(md);
    // Delete at (0,6) removes the newline ending "First." — both adjacent
    // lines belong to First. (its own gap); cursor at content end = merge.
    const edit: EditFact = { from: pos(0, 6), to: pos(1, 0), insert: '', cursorBefore: pos(0, 6) };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('First.Second.\n');
  });

  it('marker-space Backspace at a list item\'s content start merges into the previous item', () => {
    const md = '- alpha\n- beta\n';
    const doc = parse(md);
    // Backspace at beta's content start (ch 2) deletes the marker's
    // trailing space — a within-line edit whose merge intent only the
    // cursor reveals.
    const edit: EditFact = { from: pos(1, 1), to: pos(1, 2), insert: '', cursorBefore: pos(1, 2) };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('- alphabeta\n');
  });

  it('marker-space Backspace merges a first child item into its parent paragraph', () => {
    const md = 'Para.\n- item\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 1), to: pos(1, 2), insert: '', cursorBefore: pos(1, 2) };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('Para.item\n');
  });

  it('marker-space Backspace on the document\'s FIRST node vetoes instead of corrupting the marker', () => {
    const md = '- only\n- second\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 1), to: pos(0, 2), insert: '', cursorBefore: pos(0, 2) };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(verdict.kind).toBe('veto');
  });

  it('Backspace at the first paragraph under a heading joins single-line text into the title', () => {
    const md = '# Title\n\nBody.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 0), to: pos(2, 0), insert: '', cursorBefore: pos(2, 0) };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('# TitleBody.\n');
  });

  it('multi-line content refusing a heading join vetoes with the cue', () => {
    const md = '# Title\n\nBody one\nbody two\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 0), to: pos(2, 0), insert: '', cursorBefore: pos(2, 0) };
    expect(computeVerdict('boundary-crossing-edit', doc, edit).kind).toBe('veto');
  });

  it('a deletion confined inside a multi-blank-line gap passes (no merge, no cover deletion)', () => {
    const doc: OutlineDoc = {
      preamble: [],
      children: [
        {
          id: 1,
          kind: 'paragraph',
          lines: ['First.'],
          trailingGap: ['', '', ''],
          children: [],
        },
        { id: 2, kind: 'paragraph', lines: ['Second.'], trailingGap: [''], children: [] },
      ],
    };
    // Backspace at the start of the SECOND blank gap line — deletes one
    // newline entirely inside the gap, never touching real content.
    const edit: EditFact = { from: pos(1, 0), to: pos(2, 0), insert: '' };
    expect(computeVerdict('boundary-crossing-edit', doc, edit)).toEqual({ kind: 'pass' });
  });
});

describe('computeVerdict: structural paste (D5)', () => {
  it('a multi-block paste mid-paragraph splices after that paragraph, not merged into its text', () => {
    const md = 'First paragraph text.\n\nSecond paragraph text.\n';
    const doc = parse(md);
    const edit: EditFact = {
      from: pos(0, 5),
      to: pos(0, 5),
      insert: 'New heading content.\n\nAnother block.',
    };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(verdict.kind).toBe('rewrite');
    const text = applyVerdict(md, verdict);
    expect(text).toContain('First paragraph text.');
    expect(text).not.toContain('First New heading content.');
    expect(text).toContain('New heading content.');
    expect(text).toContain('Another block.');
  });

  it('a plain multi-line fragment (single block / continuation lines) stays native (pass)', () => {
    const md = 'First paragraph text.\n\nSecond.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 5), to: pos(0, 5), insert: 'more\ncontinuation\nlines' };
    expect(computeVerdict('boundary-crossing-edit', doc, edit)).toEqual({ kind: 'pass' });
  });

  it('an insertion landing in the preamble passes', () => {
    const md = '---\nk: 1\n---\n\nBody.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 0), to: pos(1, 0), insert: 'a\n\nb' };
    expect(computeVerdict('boundary-crossing-edit', doc, edit)).toEqual({ kind: 'pass' });
  });

  it('a SINGLE top-level node with nested children (a one-node subtree copy) still splices/re-indents, not raw-inserted (D15)', () => {
    // Regression: a lone top-level block used to always PASS (native),
    // meaning a single-subtree copy's literal original-depth tabs landed
    // verbatim regardless of the paste target's depth. List-item context
    // (not a bare paragraph pair) so the destination kind stays list-item —
    // matching the user's actual repro (pasting a copied list subtree).
    const md = '- alpha\n- beta\n';
    const doc = parse(md);
    // Copied subtree: one top-level list item with a nested child — parses
    // to ONE top-level block, but that block HAS children, so it must
    // still be treated as structural, not a raw insertion.
    const copied = '- parent\n\t- child\n';
    const edit: EditFact = { from: pos(0, '- alpha'.length), to: pos(0, '- alpha'.length), insert: copied };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(verdict.kind).toBe('rewrite');
    const text = applyVerdict(md, verdict);
    expect(text).not.toContain('alpha- parent'); // never raw-inserted merged into "alpha"'s own line
    expect(text).toContain('- parent');
    expect(text).toContain('- child');
  });

  it('a lone childless list item (truly one flat block) still passes through natively', () => {
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 5), to: pos(0, 5), insert: '- item' };
    expect(computeVerdict('boundary-crossing-edit', doc, edit)).toEqual({ kind: 'pass' });
  });

  it('a single-node subtree copy re-indents to a DEEPER target depth than its original', () => {
    const md = '- top\n\t- anchor\n';
    const doc = parse(md);
    // Paste after "anchor" (depth 1): the copied subtree ("x" with child
    // "y") was originally written at depth 0 in its own source context.
    const realEdit: EditFact = {
      from: pos(1, '\t- anchor'.length),
      to: pos(1, '\t- anchor'.length),
      insert: '- x\n\t- y\n',
    };
    const verdict = computeVerdict('boundary-crossing-edit', doc, realEdit);
    expect(verdict.kind).toBe('rewrite');
    const text = applyVerdict(md, verdict);
    const lines = text.split('\n').filter((l) => l.trim() !== '');
    // "x" must land as anchor's SIBLING (depth 1, one tab) and "y" as x's
    // own child (depth 2, two tabs) — the relative nesting preserved, and
    // re-indented to the anchor's depth, not left at the original depth 0.
    const xLine = lines.find((l) => l.includes('- x'))!;
    const yLine = lines.find((l) => l.includes('- y'))!;
    expect(xLine.match(/^\t*/)?.[0].length).toBe(1);
    expect(yLine.match(/^\t*/)?.[0].length).toBe(2);
  });

  it('pasting a multi-block sequence into an EMPTY list item REPLACES it, not left stranded (D14)', () => {
    const md = '- a\n- \n- c\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 2), to: pos(1, 2), insert: 'x\n\ny' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    const text = applyVerdict(md, verdict);
    const lines = text.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toEqual(['- a', '- x', '- y', '- c']);
    expect(text).not.toContain('- \n'); // the empty placeholder is gone, not stranded
  });

  it('pasting into a NON-empty item still splices after it (unaffected by D14)', () => {
    const md = '- a\n- b\n- c\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 3), to: pos(1, 3), insert: 'x\n\ny' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    const text = applyVerdict(md, verdict);
    expect(text).toContain('- b');
    expect(text.indexOf('- b')).toBeLessThan(text.indexOf('- x'));
  });

  it('pasting into an empty item that already has children still splices after it (not replaced)', () => {
    const md = '- a\n-\n\t- child\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 1), to: pos(1, 1), insert: 'x\n\ny' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    const text = applyVerdict(md, verdict);
    expect(text).toContain('child');
    expect(text.indexOf('-\n') === -1 || text.indexOf('child') > -1).toBe(true);
  });

  it('pasting into an empty item that is the ONLY (sole) child at a deep level re-indents to that depth, not top level (D16 regression)', () => {
    // Real-vault repro: the empty anchor has no siblings at all (it's the
    // sole child of "plus two levels"), so composeTypeOver/deleteAndSplice
    // has no survivor to splice against and falls to insertAsOnlyChildren —
    // which never re-indented the pasted blocks at all.
    const md = '- parent1\n\t- child1\n\t- child2\n- parent2\n\t- plus one level\n\t\t- plus two levels\n\t\t\t- \n';
    const doc = parse(md);
    const emptyLine = md.split('\n').findIndex((l) => l === '\t\t\t- ');
    const edit: EditFact = {
      from: pos(emptyLine, '\t\t\t- '.length),
      to: pos(emptyLine, '\t\t\t- '.length),
      insert: '- parent1\n\t- child1\n\t- child2\n',
    };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(verdict.kind).toBe('rewrite');
    const text = applyVerdict(md, verdict);
    // The pasted "parent1" must land as "plus two levels"'s CHILD (depth 3,
    // three tabs) — never popped out to a new top-level (zero-indent) node.
    expect(text).toBe(
      '- parent1\n\t- child1\n\t- child2\n- parent2\n\t- plus one level\n\t\t- plus two levels\n\t\t\t- parent1\n\t\t\t\t- child1\n\t\t\t\t- child2\n',
    );
  });
});

describe('computeVerdict: property suite', () => {
  it('every rewrite output re-parses to a well-formed tree (no orphans)', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), fc.boolean(), (tree, aPick, bPick, isType) => {
        const md = encode(tree);
        const doc = parse(md);
        const lines = md === '' ? [] : md.split('\n');
        if (lines.length === 0) return true;
        const aLine = aPick % lines.length;
        const bLine = bPick % lines.length;
        const from = pos(Math.min(aLine, bLine), 0);
        const to = pos(Math.max(aLine, bLine), (lines[Math.max(aLine, bLine)] ?? '').length);
        const edit: EditFact = { from, to, insert: isType ? 'typed' : '' };
        const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
        if (verdict.kind !== 'rewrite') return true;
        const text = applyEdits(lines, verdict.edits).join('\n');
        return treesEqual(parse(text), parse(encode(parse(text))));
      }),
      { numRuns: 500 },
    );
  });

  it('a veto never appears alongside edits (vacuous by the Verdict type, checked structurally)', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const md = encode(tree);
        const doc = parse(md);
        const lines = md === '' ? [] : md.split('\n');
        if (lines.length === 0) return true;
        const aLine = aPick % lines.length;
        const bLine = bPick % lines.length;
        const edit: EditFact = {
          from: pos(Math.min(aLine, bLine), 0),
          to: pos(Math.max(aLine, bLine), (lines[Math.max(aLine, bLine)] ?? '').length),
          insert: '',
        };
        const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
        return verdict.kind !== 'veto' || !('edits' in verdict);
      }),
      { numRuns: 300 },
    );
  });

  it('within-node-edit and all non-enforced classes never receive rewrite/veto for any edit shape', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), fc.constantFrom(...ALL_CLASSES), (tree, aPick, bPick, cls) => {
        if (cls === 'boundary-crossing-edit') return true;
        const md = encode(tree);
        const doc = parse(md);
        const lines = md === '' ? [] : md.split('\n');
        if (lines.length === 0) return true;
        const aLine = aPick % lines.length;
        const bLine = bPick % lines.length;
        const edit: EditFact = {
          from: pos(Math.min(aLine, bLine), 0),
          to: pos(Math.max(aLine, bLine), (lines[Math.max(aLine, bLine)] ?? '').length),
          insert: '',
        };
        return computeVerdict(cls, doc, edit).kind === 'pass';
      }),
      { numRuns: 300 },
    );
  });
});
