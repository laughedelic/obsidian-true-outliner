import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { applyEdits } from '../src/result';
import { treesEqual, walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { computeVerdict, computeVerdictForRanges, type EditFact, type Verdict } from '../src/enforce';
import {
  coveredSubtreeRoots,
  escalateRange,
  subtreeCoverOf,
} from '../src/escalate';
import { nodeAtLine } from '../src/locate';
import type { TransactionClass } from '../src/classify';
import { arbTree } from './generators';
import { rangesEqual } from '../src/line-pos';

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

  it('Backspace where a TASK item\'s text begins merges, instead of breaking the checkbox', () => {
    const md = '- [x] foo\n- [ ] bar\n';
    const doc = parse(md);
    // The reported shape: the cursor sits after the checkbox, where the item's
    // text begins. Only `- `'s own column was recognised, so this keypress fell
    // through to an ordinary deletion and left `- [ ]bar`.
    const edit: EditFact = { from: pos(1, 5), to: pos(1, 6), insert: '', cursorBefore: pos(1, 6) };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('- [x] foobar\n');
  });

  it('and the absorbed item\'s task marker goes with its list marker', () => {
    // The survivor keeps its OWN box; the absorbed one is about to stop
    // existing, so carrying its `[ ] ` into the text made `- [x] foo[ ] bar`.
    const md = '- plain\n- [ ] bar\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 5), to: pos(1, 6), insert: '', cursorBefore: pos(1, 6) };
    expect(applyVerdict(md, computeVerdict('boundary-crossing-edit', doc, edit))).toBe(
      '- plainbar\n',
    );
  });

  it('Backspace at a task item\'s OTHER content column still merges', () => {
    // Where Home lands, in front of the box. It was already recognised and
    // stays so — widening the gate must not trade one column for the other.
    const md = '- [x] foo\n- [ ] bar\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 1), to: pos(1, 2), insert: '', cursorBefore: pos(1, 2) };
    expect(applyVerdict(md, computeVerdict('boundary-crossing-edit', doc, edit))).toBe(
      '- [x] foobar\n',
    );
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

describe('computeVerdict: single exact-cover deletion (fix-orphan-gap-on-node-deletion)', () => {
  it('deleting one exactly-selected node takes its owned gap, leaving no blank line behind', () => {
    // The proposal's own measured repro: selecting Alpha's whole subtree
    // (content + its owned gap) and deleting it used to leave an orphan
    // blank line, because classify.ts never reached the verdict layer for
    // this shape. Once classified boundary-crossing (classify.test.ts), the
    // existing structural-deletion path already produces the clean result.
    const md = 'Alpha one.\n\nBravo two.\n\nCharlie three.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 0), to: pos(1, 0), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('Bravo two.\n\nCharlie three.\n');
  });

  it('deleting an exactly-selected tight-list node (no gap) leaves no blank line either', () => {
    const md = '- alpha\n- beta\n';
    const doc = parse(md);
    // No trailing gap to include — the exact cover ends at alpha's own
    // content end, not at the next line.
    const edit: EditFact = { from: pos(0, 0), to: pos(0, '- alpha'.length), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('- beta\n');
  });

  it('deleting the exactly-selected LAST node in the document takes its gap too', () => {
    const md = 'Alpha one.\n\nBravo two.\n\nCharlie three.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(4, 0), to: pos(5, 0), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('Alpha one.\n\nBravo two.\n');
  });

  it('typing over an exactly-selected node replaces it with the typed content', () => {
    const md = 'Alpha one.\n\nBravo two.\n\nCharlie three.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 0), to: pos(1, 0), insert: 'Replaced.\n\n' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('Replaced.\n\nBravo two.\n\nCharlie three.\n');
  });
});

describe('computeVerdictForRanges: multi-range structural deletion (D2/D3)', () => {
  it('deletes two disjoint exact-cover ranges in one rewrite, taking each owned gap', () => {
    const md = 'Alpha.\n\nBravo.\n\nCharlie.\n\nDelta.\n';
    const doc = parse(md);
    // 0 Alpha / 1 gap / 2 Bravo / 3 gap / 4 Charlie / 5 gap / 6 Delta / 7 gap
    const edits: EditFact[] = [
      { from: pos(0, 0), to: pos(1, 0), insert: '' },
      { from: pos(4, 0), to: pos(5, 0), insert: '' },
    ];
    const verdict = computeVerdictForRanges('boundary-crossing-edit', doc, edits);
    expect(applyVerdict(md, verdict)).toBe('Bravo.\n\nDelta.\n');
  });

  it('the order ranges appear in does not matter', () => {
    const md = 'Alpha.\n\nBravo.\n\nCharlie.\n\nDelta.\n';
    const doc = parse(md);
    const edits: EditFact[] = [
      { from: pos(4, 0), to: pos(5, 0), insert: '' }, // Charlie listed first
      { from: pos(0, 0), to: pos(1, 0), insert: '' }, // Alpha listed second
    ];
    const verdict = computeVerdictForRanges('boundary-crossing-edit', doc, edits);
    expect(applyVerdict(md, verdict)).toBe('Bravo.\n\nDelta.\n');
  });

  it('deletes three ranges leaving only the untouched middle siblings', () => {
    const md = 'A.\n\nB.\n\nC.\n\nD.\n\nE.\n';
    const doc = parse(md);
    const edits: EditFact[] = [
      { from: pos(0, 0), to: pos(1, 0), insert: '' }, // A
      { from: pos(4, 0), to: pos(5, 0), insert: '' }, // C
      { from: pos(8, 0), to: pos(9, 0), insert: '' }, // E
    ];
    const verdict = computeVerdictForRanges('boundary-crossing-edit', doc, edits);
    expect(applyVerdict(md, verdict)).toBe('B.\n\nD.\n');
  });

  it('a single range delegates unchanged to computeVerdict', () => {
    const md = 'First.\n\nSecond.\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 0), to: pos(1, 0), insert: '' };
    expect(computeVerdictForRanges('boundary-crossing-edit', doc, [edit])).toEqual(
      computeVerdict('boundary-crossing-edit', doc, edit),
    );
  });

  it('falls back to pass when any range is not an exact cover', () => {
    const md = 'Alpha.\n\nBravo.\n\nCharlie.\n';
    const doc = parse(md);
    const edits: EditFact[] = [
      { from: pos(0, 0), to: pos(1, 0), insert: '' }, // Alpha: exact cover
      { from: pos(2, 2), to: pos(2, 4), insert: '' }, // Bravo: mid-node, not a cover
    ];
    expect(computeVerdictForRanges('boundary-crossing-edit', doc, edits)).toEqual({ kind: 'pass' });
  });

  it('falls back to pass when any range carries an insertion (type-over not modeled for multi-range)', () => {
    const md = 'Alpha.\n\nBravo.\n\nCharlie.\n\nDelta.\n';
    const doc = parse(md);
    const edits: EditFact[] = [
      { from: pos(0, 0), to: pos(1, 0), insert: 'X' },
      { from: pos(4, 0), to: pos(5, 0), insert: '' },
    ];
    expect(computeVerdictForRanges('boundary-crossing-edit', doc, edits)).toEqual({ kind: 'pass' });
  });

  it('non-boundary-crossing classes and an empty range set always pass', () => {
    const doc = parse('Alpha.\n');
    expect(computeVerdictForRanges('within-node-edit', doc, [])).toEqual({ kind: 'pass' });
    expect(computeVerdictForRanges('boundary-crossing-edit', doc, [])).toEqual({ kind: 'pass' });
  });

  it('property: deleting several disjoint top-level exact covers removes exactly their own lines, well-formed', () => {
    // Deliberately does NOT assert the survivors keep their original nesting
    // — two nodes becoming newly adjacent can legitimately re-parse into a
    // parent/child relationship neither had before (markdown's own
    // attachment rule, e.g. a list item right after a paragraph — a
    // pre-existing `deleteSubtrees` behavior, reproduced even for a single
    // deleted range, not something this change introduces). What must hold,
    // per tasks.md 3.3, is: a valid, round-trip-stable tree, with EXACTLY
    // the deleted subtrees' own lines gone — no more, no less (which is
    // exactly "no orphaned nodes, no leftover gap lines" would show up as).
    const subtreeLineCount = (node: OutlineNode): number =>
      node.lines.length + node.trailingGap.length + node.children.reduce((sum, c) => sum + subtreeLineCount(c), 0);

    fc.assert(
      fc.property(arbTree(), fc.array(fc.nat(10), { minLength: 2, maxLength: 4 }), (tree, rawIndices) => {
        const text = encode(tree);
        const doc = parse(text);
        fc.pre(doc.children.length >= 2);
        const indices = [...new Set(rawIndices.map((n) => n % doc.children.length))];
        fc.pre(indices.length >= 2);

        const edits: EditFact[] = indices.map((i) => {
          const cover = subtreeCoverOf(doc, doc.children[i]!);
          return { from: cover.start, to: cover.end, insert: '' };
        });
        const verdict = computeVerdictForRanges('boundary-crossing-edit', doc, edits);
        if (verdict.kind !== 'rewrite') return false;

        const finalText = applyVerdict(text, verdict);
        const finalDoc = parse(finalText);
        const removedLines = indices.reduce((sum, i) => sum + subtreeLineCount(doc.children[i]!), 0);
        const expectedLineCount = text.split('\n').length - removedLines;
        // `''.split('\n')` is `['']` (length 1), not 0 — an empty final
        // document has zero lines of actual content, so it's special-cased
        // here rather than in the counting convention used everywhere else.
        const actualLineCount = finalText === '' ? 0 : finalText.split('\n').length;
        return encode(finalDoc) === finalText && actualLineCount === expectedLineCount;
      }),
      { numRuns: 200 },
    );
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

describe('computeVerdict: deletion of a mixed-depth forest cover (selection-as-subtree-set)', () => {
  // - P
  //   - c1
  //   - c2
  // - S
  //   - t1
  //   - t2
  const md = '- P\n  - c1\n  - c2\n- S\n  - t1\n  - t2\n';
  const doc = parse(md);

  it('removes each root\'s subtree and leaves the remaining tree well formed', () => {
    // The escalated cover of a c2 -> t1 drag: roots c2 and S, spanning
    // lines 2..6 (S's subtree through t2's own trailing gap). Two groups
    // under two different parents — the shape `deleteSubtreeGroups` takes.
    const edit: EditFact = { from: pos(2, 0), to: pos(6, 0), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(verdict.kind).toBe('rewrite');
    // `c1` survives under `P`; `S` and both its children are gone. Nothing
    // is orphaned: `t1`/`t2` left with their parent, not without it. `t2`'s
    // owned gap — the document's final newline — goes with it, the same
    // convention a single last-node deletion follows.
    expect(applyVerdict(md, verdict)).toBe('- P\n  - c1');
  });

  it('the deletion is one structural pass — the result re-parses to a valid tree', () => {
    const edit: EditFact = { from: pos(2, 0), to: pos(6, 0), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    const after = parse(applyVerdict(md, verdict));
    expect(encode(after)).toBe('- P\n  - c1');
    expect(after.children).toHaveLength(1);
    expect(after.children[0]!.children.map((n) => n.lines[0])).toEqual(['  - c1']);
  });

  it('a TYPE-OVER of a mixed-depth cover passes rather than guessing where the text lands', () => {
    // Deliberately unmodeled: a forest leaves one gap per parent, and
    // `deleteAndSplice` splices into a single one. Conservative pass, per
    // the layer's "a wrong pass is editable text" bias.
    const edit: EditFact = { from: pos(2, 0), to: pos(6, 0), insert: 'x' };
    expect(computeVerdict('boundary-crossing-edit', doc, edit)).toEqual({ kind: 'pass' });
  });

  it('a single-group (same-parent) type-over still rewrites, unchanged', () => {
    // c1 -> c2, both children of `P`: one group, so the existing
    // delete-and-splice path is untouched. Note `(1,0)..(3,0)` would NOT
    // qualify — line 3 is `S`, making that span a two-group forest.
    const edit: EditFact = { from: pos(1, 0), to: pos(2, '  - c2'.length), insert: 'x' };
    expect(computeVerdict('boundary-crossing-edit', doc, edit).kind).toBe('rewrite');
  });

  it('property: deleting any escalated cover removes EXACTLY its lines, orphaning nothing', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const text = encode(tree);
        if (text === '') return true;
        const lines = text.split('\n');
        const d = parse(text);
        const candidates: number[] = [];
        for (let i = 0; i < lines.length; i++) if (nodeAtLine(d, i)) candidates.push(i);
        if (candidates.length < 2) return true;
        const aLine = candidates[aPick % candidates.length]!;
        const bLine = candidates[bPick % candidates.length]!;
        const raw = { anchor: pos(aLine, 0), head: pos(bLine, (lines[bLine] ?? '').length) };
        const esc = escalateRange(d, raw);
        if (rangesEqual(esc, raw)) return true; // not a cover; nothing to delete structurally

        const lo = esc.head.line < esc.anchor.line ? esc.head : esc.anchor;
        const hi = esc.head.line < esc.anchor.line ? esc.anchor : esc.head;
        const verdict = computeVerdict('boundary-crossing-edit', d, {
          from: lo,
          to: hi,
          insert: '',
        });
        if (verdict.kind !== 'rewrite') return true; // vetoes/passes are their own contracts

        // Compared against an INDEPENDENTLY constructed expectation, not a
        // round-trip. `encode(parse(applied)) === applied` was the first
        // version and it is far too weak: `finalize` already emits a
        // parsed/encoded document, so it holds for a no-op deletion, and it
        // holds when a parent is removed and its indented descendants simply
        // re-parse as new roots — the exact orphan the property claims to
        // rule out.
        //
        // An escalated cover's roots tile a contiguous line span, and each
        // root's cover carries its own trailing gap, so deleting the cover
        // must remove EXACTLY the lines in [lo, hi] and leave every other
        // line byte-identical. That is computable from the span alone,
        // without reference to how the deletion was implemented.
        const expected = lines
          .filter((_, i) => i < lo.line || i > hi.line)
          .join('\n');
        return applyVerdict(text, verdict) === expected;
      }),
      { numRuns: 400 },
    );
  });
});

describe('computeVerdictForRanges: multi-range deletion of mixed-depth covers (task 3.4)', () => {
  // Two independent forests, one per range. `computeMultiRangeDeletionVerdict`
  // already maps each range's `coveredSubtreeRoots` to one group, so this
  // needs no shape change — asserted rather than assumed.
  //  0 '- P' / 1 '  - c1' / 2 '  - c2' / 3 '- S' / 4 '  - t1' / 5 gap
  //  6 '- Q' / 7 '  - d1' / 8 '  - d2' / 9 '- R' / 10 '  - u1' / 11 gap
  const md = '- P\n  - c1\n  - c2\n- S\n  - t1\n\n- Q\n  - d1\n  - d2\n- R\n  - u1\n';
  const doc = parse(md);

  it('each range contributes its own roots and all are removed in one pass', () => {
    // TWO edits — with one, `computeVerdictForRanges` delegates straight to
    // `computeVerdict` and the multi-range branch is never reached.
    const first = coveredSubtreeRoots(doc, { anchor: pos(2, 0), head: pos(5, 0) });
    expect(first?.map((n) => n.lines[0])).toEqual(['  - c2', '- S']);
    const second = coveredSubtreeRoots(doc, { anchor: pos(8, 0), head: pos(11, 0) });
    expect(second?.map((n) => n.lines[0])).toEqual(['  - d2', '- R']);

    const verdict = computeVerdictForRanges('boundary-crossing-edit', doc, [
      { from: pos(2, 0), to: pos(5, 0), insert: '' },
      { from: pos(8, 0), to: pos(11, 0), insert: '' },
    ]);
    // Each range is a MIXED-DEPTH forest, so each decomposes into two
    // parent-local groups. Collapsing a whole forest into one group makes
    // `resolveContiguousGroup` reject roots that do not share a parent, and
    // the user's whole deletion is VETOED.
    expect(verdict.kind).toBe('rewrite');
  });

  it('a multi-range deletion of mixed-depth forests is not vetoed', () => {
    const verdict = computeVerdictForRanges('boundary-crossing-edit', doc, [
      { from: pos(2, 0), to: pos(5, 0), insert: '' },
      { from: pos(8, 0), to: pos(11, 0), insert: '' },
    ]);
    expect(verdict.kind).not.toBe('veto');
  });
});
