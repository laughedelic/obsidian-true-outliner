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
import { classify, type TransactionClass, type TransactionFacts } from '../src/classify';
import { arbTree } from './generators';
import { rangesEqual } from '../src/line-pos';

const pos = (line: number, ch: number) => ({ line, ch });

function applyVerdict(md: string, verdict: Verdict): string {
  if (verdict.kind !== 'rewrite') throw new Error(`expected rewrite, got ${verdict.kind}`);
  const lines = md === '' ? [] : md.split('\n');
  return applyEdits(lines, verdict.edits).join('\n');
}

/**
 * One single-character Backspace at `line`/`ch`, put through the SAME two gates
 * the editor puts it through: classification first, then the verdict for
 * whatever class that produced. The design's claim that the two gates are a
 * matched pair is only checkable end to end — a shape the classifier excludes
 * has no meaningful verdict of its own, because the verdict layer is never
 * asked about it.
 */
function backspaceThroughBothGates(md: string, line: number, ch: number): Verdict {
  const doc = parse(md);
  const facts: TransactionFacts = {
    userEvent: 'delete.backward',
    isComposition: false,
    changedLineSpans: [
      { fromLine: line, toLine: line, insertedText: '', fromCh: ch - 1, toCh: ch,
        rangeEnd: { line, ch } },
    ],
    cursorBefore: { line, ch },
  };
  const edit: EditFact = { from: pos(line, ch - 1), to: pos(line, ch), insert: '',
    cursorBefore: pos(line, ch) };
  return computeVerdict(classify(facts, doc), doc, edit);
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

  it('marker-space Backspace at a HEADING\'s content start vetoes, keeping its section anchor', () => {
    // The keypress this change exists for. It used to leave `##Two` — a
    // paragraph where a heading was — because the marker-space shape was
    // written for list items alone. `mergeNodes` already refuses to absorb a
    // heading, so the veto needed no new rule, only a gate that let the
    // transaction reach it.
    const md = '# One\n\npara one\n\n## Two\n\npara two\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(4, 2), to: pos(4, 3), insert: '', cursorBefore: pos(4, 3) };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(verdict).toEqual({ kind: 'veto', reason: 'merge-not-expressible' });
  });

  it('the same keypress on a heading with no predecessor vetoes rather than deleting the document', () => {
    // The first node has no content-space predecessor, so the recognizer takes
    // its first-node branch. Without the verdict layer's own gate widened the
    // edit reaches the DELETION path instead, where a one-character range reads
    // as covering the heading's whole subtree — measured as a rewrite removing
    // every line of this document.
    const md = '# One\n\npara one\n\n## Two\n\npara two\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(0, 1), to: pos(0, 2), insert: '', cursorBefore: pos(0, 2) };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(verdict).toEqual({ kind: 'veto', reason: 'no-following-neighbor' });
  });

  // The two shapes below are excluded by the CLASSIFIER, not by the verdict
  // layer: handed a boundary-crossing class they would never receive, both
  // route to the deletion path and rewrite. So they are asked through both
  // gates, which is the only question with an answer — and the only one the
  // keypress itself poses.
  it('a column INSIDE a heading\'s `#` run is ordinary marker editing, through both gates', () => {
    // Deleting one `#` out of `##` demotes the heading and leaves it a heading.
    const md = '# One\n\npara one\n\n## Two\n\npara two\n';
    expect(backspaceThroughBothGates(md, 4, 2)).toEqual({ kind: 'pass' });
  });

  it('an INDENTED paragraph\'s content start is not a marker column, through both gates', () => {
    // The control separating "admit `heading`" from "drop the kind test":
    // `contentColumnCh` reads leading indentation as a content prefix, so this
    // column looks exactly like a marker column to `isContentStartCh`. Only the
    // kind test keeps the keypress from merging into the predecessor.
    const md = 'para one\n\n  indented para\n';
    expect(backspaceThroughBothGates(md, 2, 2)).toEqual({ kind: 'pass' });
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

describe('a deletion at the end of a note keeps its terminating newline (#160)', () => {
  it('a selection running to the end of the note', () => {
    // The reported symptom: every note starts with a terminating newline, and
    // a structural deletion that took the node holding it took the newline.
    const md = '- a\n- b\n- c\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 0), to: pos(2, '- c'.length), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    expect(applyVerdict(md, verdict)).toBe('- a\n');
  });

  it('a type-over does not give a note a newline it never had', () => {
    // The note's last line is two spaces and no newline, which is a non-empty
    // gap and not a terminator. Blanking it on the way into the insertion
    // would end the note with one — restored, never invented, on this side
    // too. The gap line itself is the note's own, so it survives verbatim.
    const md = '- a\n- b\n  ';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 0), to: pos(2, 2), insert: '- x\n' };
    expect(applyVerdict(md, computeVerdict('boundary-crossing-edit', doc, edit))).toBe(
      '- a\n- x\n  ',
    );

    // And where the same whitespace line IS followed by a newline, the
    // terminator is still there afterwards.
    const terminated = '- a\n- b\n  \n';
    const other = parse(terminated);
    const wide: EditFact = { from: pos(1, 0), to: pos(3, 0), insert: '- x\n' };
    expect(
      applyVerdict(terminated, computeVerdict('boundary-crossing-edit', other, wide)),
    ).toBe('- a\n- x\n\n');
  });

  it('a type-over at the end neither loses the newline nor gains a blank line', () => {
    // A type-over deletes the covered run and splices into the place it left,
    // so the terminator travels with the gap that run was carrying. Restoring
    // it on the survivor as well would separate the survivor from what lands
    // next to it — which is why the deletion asks whether a splice follows.
    const md = '- a\n- b\n';
    const doc = parse(md);
    const edit: EditFact = { from: pos(1, 0), to: pos(2, 0), insert: '- x\n  - y\n' };
    expect(applyVerdict(md, computeVerdict('boundary-crossing-edit', doc, edit))).toBe(
      '- a\n- x\n  - y\n',
    );

    // The same where the parent outlives the child that was typed over.
    const nested = '- one\n  - a\n';
    const nestedDoc = parse(nested);
    const nestedEdit: EditFact = { from: pos(1, 0), to: pos(2, 0), insert: '- x\n  - y\n' };
    expect(
      applyVerdict(nested, computeVerdict('boundary-crossing-edit', nestedDoc, nestedEdit)),
    ).toBe('- one\n  - x\n    - y\n');
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
    const viaRanges = computeVerdictForRanges('boundary-crossing-edit', doc, [edit]);
    const direct = computeVerdict('boundary-crossing-edit', doc, edit);
    // `after` is compared by its ENCODING, not structurally. Both calls run the
    // operation and so allocate their own nodes, and `model.ts`'s ids come from
    // a global counter that is never reset — two structurally identical trees
    // built by two calls share no id values at all. Everything else is compared
    // as before.
    const { after: viaAfter, ...viaRest } = viaRanges as Extract<typeof viaRanges, { kind: 'rewrite' }>;
    const { after: directAfter, ...directRest } = direct as Extract<typeof direct, { kind: 'rewrite' }>;
    expect(viaRest).toEqual(directRest);
    expect(encode(viaAfter)).toBe(encode(directAfter));
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
    /** The node whose own gap ends a subtree — where a terminator would sit. */
    const deepestLast = (node: OutlineNode): OutlineNode => {
      const last = node.children[node.children.length - 1];
      return last ? deepestLast(last) : node;
    };
    /** A note ends in a newline when its last gap LINE is empty. A gap that
     * merely exists is not one: a last line of spaces is a non-empty gap and
     * no terminator, which is the distinction the implementation makes. */
    const endsInNewline = (node: OutlineNode): boolean => {
      const gap = node.trailingGap;
      return gap.length > 0 && gap[gap.length - 1] === '';
    };

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
        // One line inside the removed span can survive: the document's
        // terminating newline is an empty gap line on its LAST node, so a
        // deletion that takes that node leaves it on the node that now ends
        // the document (#160). Predicted here rather than allowed for.
        const survivors = doc.children.filter((_, i) => !indices.includes(i));
        const lastSurvivor = survivors[survivors.length - 1];
        const restoresTerminator =
          text.endsWith('\n') &&
          indices.includes(doc.children.length - 1) &&
          lastSurvivor !== undefined &&
          !endsInNewline(deepestLast(lastSurvivor));
        const expectedLineCount =
          text.split('\n').length - removedLines + (restoresTerminator ? 1 : 0);
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
    // owned gap was the document's final newline rather than a separation, so
    // `c1` takes it over and the note still ends in one (#160).
    expect(applyVerdict(md, verdict)).toBe('- P\n  - c1\n');
  });

  it('the deletion is one structural pass — the result re-parses to a valid tree', () => {
    const edit: EditFact = { from: pos(2, 0), to: pos(6, 0), insert: '' };
    const verdict = computeVerdict('boundary-crossing-edit', doc, edit);
    const after = parse(applyVerdict(md, verdict));
    expect(encode(after)).toBe('- P\n  - c1\n');
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
        const survivors = lines.filter((_, i) => i < lo.line || i > hi.line);
        // One line inside the span can survive: the document's terminating
        // newline is an empty gap line on its LAST node, so a cover reaching
        // the end takes it and the deletion puts it back on the node that now
        // ends the document (#160). A note that ended in a newline still does,
        // unless the deletion left no node at all.
        const expected =
          survivors.length > 0 &&
          lines[lines.length - 1] === '' &&
          survivors[survivors.length - 1] !== ''
            ? [...survivors, ''].join('\n')
            : survivors.join('\n');
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

// ------------------------------------------- paste-lands-where-it-is-pointed

/** One paste, through BOTH gates the editor puts it through. `to` equal to
 * `from` is a caret paste; a wider range is a type-over, which reaches the two
 * insert paths a caret never does. */
function pasteThroughBothGates(
  md: string,
  from: { line: number; ch: number },
  to: { line: number; ch: number },
  payload: string,
): Verdict {
  const doc = parse(md);
  const facts: TransactionFacts = {
    userEvent: 'input.paste',
    isComposition: false,
    changedLineSpans: [
      {
        fromLine: from.line,
        toLine: to.line,
        insertedText: payload,
        fromCh: from.ch,
        toCh: to.ch,
        rangeEnd: to,
      },
    ],
    cursorBefore: from,
  };
  const edit: EditFact = { from, to, insert: payload, cursorBefore: from };
  return computeVerdict(classify(facts, doc), doc, edit);
}

/** The pasted subtree's own shape, relative to its root — so results landing at
 * different depths, or in different documents, are still comparable. */
function pastedSubtreeShape(doc: OutlineDoc): string {
  const root = [...walkNodes(doc)].find((n) => (n.lines[0] ?? '').trimStart().startsWith('- ## Notes'));
  if (!root) return '<no pasted subtree>';
  const out: string[] = [];
  const walk = (node: OutlineNode, depth: number): void => {
    const kind = node.kind === 'heading' ? `h${node.level}` : node.kind;
    out.push(`${'  '.repeat(depth)}${kind}: ${(node.lines[0] ?? '').trim()}`);
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
  return out.join('\n');
}

const SECTION_PAYLOAD = '## Notes\n\nSome prose.\n\n- alpha\n  - beta\n';
const ATOM_PAYLOAD = '```\ncode\n```\n\n- gamma\n';

describe('the insertion path does not change the answer', () => {
  // Negative control for this whole block: before the guard moved into the
  // shared re-encode step, one payload at one destination got three different
  // answers — a native pass at a caret, a veto over a selection with a
  // survivor, and an unguarded rewrite over a selection consuming the scope.

  it('a heading payload converts on all three paths, to the same text', () => {
    const caret = pasteThroughBothGates('- one\n  - a\n  - b\n', pos(1, 5), pos(1, 5), SECTION_PAYLOAD);
    const typeOverWithSurvivor = pasteThroughBothGates(
      '- one\n  - a\n  - b\n', pos(1, 4), pos(1, 5), SECTION_PAYLOAD,
    );
    const typeOverWholeScope = pasteThroughBothGates('- one\n  - a\n', pos(1, 4), pos(1, 5), SECTION_PAYLOAD);

    const shapes: string[] = [];
    for (const verdict of [caret, typeOverWithSurvivor, typeOverWholeScope]) {
      expect(verdict.kind).toBe('rewrite');
      if (verdict.kind !== 'rewrite') continue;
      shapes.push(pastedSubtreeShape(verdict.after));
    }
    // The same tree, compared as a tree — not three documents that each happen
    // to contain a substring. The whole-scope path lands in a document of its
    // own by construction (it has no surviving sibling), so what is compared is
    // the pasted subtree, which is what "the same resulting tree" means here.
    expect(shapes).toHaveLength(3);
    expect(shapes[1]).toBe(shapes[0]);
    expect(shapes[2]).toBe(shapes[0]);
    expect(shapes[0]).toBe(
      [
        'list-item: - ## Notes',
        '  list-item: - Some prose.',
        '    list-item: - alpha',
        '      list-item: - beta',
      ].join('\n'),
    );
  });

  it('an atom below a paragraph is refused on all three paths', () => {
    const caret = pasteThroughBothGates('Intro.\n\n- a\n- b\n', pos(2, 3), pos(2, 3), ATOM_PAYLOAD);
    const typeOverWithSurvivor = pasteThroughBothGates('Intro.\n\n- a\n- b\n', pos(2, 2), pos(2, 3), ATOM_PAYLOAD);
    const typeOverWholeScope = pasteThroughBothGates('Intro.\n\n- a\n', pos(2, 2), pos(2, 3), ATOM_PAYLOAD);

    for (const verdict of [caret, typeOverWithSurvivor, typeOverWholeScope]) {
      expect(verdict.kind).toBe('veto');
      if (verdict.kind === 'veto') expect(verdict.reason).toBe('insertion-not-expressible');
    }
  });
});

describe('a paste on the blank line under a node lands in it', () => {
  /** The whole tree, as the outline shows it. */
  function shapeOf(doc: OutlineDoc): string {
    const out: string[] = [];
    const walk = (nodes: readonly OutlineNode[], depth: number): void => {
      for (const node of nodes) {
        const kind = node.kind === 'heading' ? `h${node.level}` : node.kind;
        out.push(`${'  '.repeat(depth)}${kind}: ${(node.lines[0] ?? '').trim()}`);
        walk(node.children, depth + 1);
      }
    };
    walk(doc.children, 0);
    return out.join('\n');
  }

  it('a section pasted under a note\'s h1 lands there, not past its subtree', () => {
    // Negative control: anchoring on the gap's owner and inserting AFTER it
    // put this at the END of the note, re-levelled to `h1` because root was
    // the destination it reached — and nothing appeared where the caret was.
    const verdict = pasteThroughBothGates(
      '# Day\n\n## First\n\nbody\n', pos(1, 0), pos(1, 0), '## Notes\n\nSome prose.\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(shapeOf(verdict.after)).toBe(
      [
        'h1: # Day',
        '  h2: ## Notes',
        '    paragraph: Some prose.',
        '  h2: ## First',
        '    paragraph: body',
      ].join('\n'),
    );
  });

  it('under a list item it converts, at the item\'s own child depth', () => {
    // The place line carries its indentation, which is the only way a caret
    // reaches a column past zero on one: an EMPTY line has no column but zero,
    // whatever `ch` a test hands it.
    const verdict = pasteThroughBothGates(
      '- one\n  \n  - sub\n- two\n', pos(1, 2), pos(1, 2), '## Notes\n\nSome prose.\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(shapeOf(verdict.after)).toBe(
      [
        'list-item: - one',
        '  list-item: - ## Notes',
        '    list-item: - Some prose.',
        '  list-item: - sub',
        'list-item: - two',
      ].join('\n'),
    );
  });

  it('a caret left of the child column still means a sibling', () => {
    // The column is the whole of what distinguishes the two readings, so the
    // shallower one has to keep landing where it always did. The gap line
    // carries whitespace because that is the only way a caret reaches a column
    // past zero on one — an EMPTY line has no column but zero.
    const verdict = pasteThroughBothGates(
      '- one\n  \n  - sub\n', pos(1, 0), pos(1, 0), '- alpha\n  - beta\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(shapeOf(verdict.after)).toBe(
      [
        'list-item: - one',
        '  list-item: - sub',
        'list-item: - alpha',
        '  list-item: - beta',
      ].join('\n'),
    );
  });

  it('at the child column on that same line it means a child', () => {
    const verdict = pasteThroughBothGates(
      '- one\n  \n  - sub\n', pos(1, 2), pos(1, 2), '- alpha\n  - beta\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(shapeOf(verdict.after)).toBe(
      [
        'list-item: - one',
        '  list-item: - alpha',
        '    list-item: - beta',
        '  list-item: - sub',
      ].join('\n'),
    );
  });

  it('a tab-indented vault reaches the child reading too', () => {
    // Negative control: while the caret's CHARACTER index was compared against
    // `childBaseCol`'s COLUMN, `\t- one`'s child column of 6 was unreachable on
    // a two-character gap line and every caret took the sibling reading.
    const child = pasteThroughBothGates(
      '\t- one\n\t\t\n\t\t- sub\n', pos(1, 2), pos(1, 2), '- alpha\n  - beta\n',
    );
    expect(child.kind).toBe('rewrite');
    if (child.kind !== 'rewrite') return;
    expect(encode(child.after)).toBe('\t- one\n\t\t\n\t\t- alpha\n\t\t  - beta\n\n\t\t- sub\n');

    // One tab in is column 4, short of 6, so it is still the sibling reading —
    // the comparison is columns against columns, not characters against either.
    const sibling = pasteThroughBothGates(
      '\t- one\n\t\t\n\t\t- sub\n', pos(1, 1), pos(1, 1), '- alpha\n  - beta\n',
    );
    expect(sibling.kind).toBe('rewrite');
    if (sibling.kind !== 'rewrite') return;
    expect(encode(sibling.after)).toBe('\t- one\n\t\t\n\t\t- sub\n\t- alpha\n\t  - beta\n');
  });

  it('a gap the payload lands PAST is left alone', () => {
    // Negative control: while the collapse keyed on "the caret was in a gap"
    // rather than on "the payload fills it", the shallow reading rewrote a gap
    // two lines above content the insertion never touched.
    const verdict = pasteThroughBothGates(
      '- one\n  \n  \n  - sub\n- two\n', pos(1, 0), pos(1, 0), '- alpha\n  - beta\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(encode(verdict.after)).toBe('- one\n  \n  \n  - sub\n- alpha\n  - beta\n- two\n');
  });

  it('the gap the caret sat in collapses to one blank line', () => {
    // Negative control: without the collapse the three blank lines a
    // structural Enter leaves — a separator on each side of the place —
    // survive above the pasted content, which is what the manual pass saw.
    const verdict = pasteThroughBothGates(
      '# Day\n\n\n\n## First\n\nbody\n', pos(2, 0), pos(2, 0), '## Notes\n\nSome prose.\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(encode(verdict.after)).toBe('# Day\n\n## Notes\n\nSome prose.\n\n## First\n\nbody\n');
  });

  it('a gap of one is the document\'s own separation and is left alone', () => {
    const verdict = pasteThroughBothGates(
      '# Day\n\n## First\n\nbody\n', pos(1, 0), pos(1, 0), '## Notes\n\nSome prose.\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(encode(verdict.after)).toBe('# Day\n\n## Notes\n\nSome prose.\n\n## First\n\nbody\n');
  });
});

describe('a paste with the caret ON a node lands at its next boundary', () => {
  function shapeOf(doc: OutlineDoc): string {
    const out: string[] = [];
    const walk = (nodes: readonly OutlineNode[], depth: number): void => {
      for (const node of nodes) {
        const kind = node.kind === 'heading' ? `h${node.level}` : node.kind;
        out.push(`${'  '.repeat(depth)}${kind}: ${(node.lines[0] ?? '').trim()}`);
        walk(node.children, depth + 1);
      }
    };
    walk(doc.children, 0);
    return out.join('\n');
  }

  it('a heading\'s own line anchors inside its section, not past it', () => {
    // Negative control: anchoring `after` the heading put this past the whole
    // section — `### Notes` landed below `beta` as an `h2` sibling of `## Two`.
    const verdict = pasteThroughBothGates(
      '# One\n\n## Two\n\nalpha\n\nbeta\n\n## Three\n', pos(2, 6), pos(2, 6),
      '## Notes\n\nSome prose.\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(shapeOf(verdict.after)).toBe(
      [
        'h1: # One',
        '  h2: ## Two',
        '    h3: ### Notes',
        '      paragraph: Some prose.',
        '      paragraph: alpha',
        '      paragraph: beta',
        '  h2: ## Three',
      ].join('\n'),
    );
  });

  it('a list item\'s own line anchors among its children', () => {
    const verdict = pasteThroughBothGates(
      '- one\n  - a\n  - b\n- two\n', pos(0, 5), pos(0, 5), '- alpha\n  - beta\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(shapeOf(verdict.after)).toBe(
      [
        'list-item: - one',
        '  list-item: - alpha',
        '    list-item: - beta',
        '  list-item: - a',
        '  list-item: - b',
        'list-item: - two',
      ].join('\n'),
    );
  });

  it('the caret lands at the end of what was PASTED, not of what the section absorbed', () => {
    // Negative control: while the caret took the inserted block's SUBTREE end,
    // this left it on `body` — the paragraph the new `### Notes` section had
    // just absorbed, two nodes past anything the user pasted.
    const verdict = pasteThroughBothGates(
      '# Day\n\n## First\n\nbody\n', pos(2, 8), pos(2, 8), '## Notes\n\nSome prose.\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    const lines = encode(verdict.after).split('\n');
    expect(lines[verdict.cursor.line]).toBe('Some prose.');
    expect(verdict.cursor.ch).toBe('Some prose.'.length);
    // The absorbed paragraph is still there, just not where the caret is.
    expect(lines).toContain('body');
  });

  it('a childless node still splices after it', () => {
    const verdict = pasteThroughBothGates(
      '- one\n- two\n', pos(0, 5), pos(0, 5), '- alpha\n  - beta\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(shapeOf(verdict.after)).toBe(
      [
        'list-item: - one',
        'list-item: - alpha',
        '  list-item: - beta',
        'list-item: - two',
      ].join('\n'),
    );
  });
});

describe('a pasted run keeps the separation of the boundary it landed in', () => {
  it('separates the run from what follows it, where the parse requires no blank', () => {
    // The manual pass: a section ending in a callout, pasted under a heading,
    // ran straight into the paragraph that followed. A blank is added by
    // `normalizeBoundaries` only where the PARSE needs one, and a callout
    // followed by a paragraph needs none, so the seam came out flush.
    const verdict = pasteThroughBothGates(
      '## Kitchen\n\nTile shop.\n',
      pos(0, 10),
      pos(0, 10),
      '## Notes\n\n> [!warning] Heads up\n> Legal wants a look.\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(encode(verdict.after)).toBe(
      '## Kitchen\n\n### Notes\n\n> [!warning] Heads up\n> Legal wants a look.\n\nTile shop.\n',
    );
  });

  it('adds nothing where the boundary had no separation', () => {
    // Negative control: the separation is the destination's own, not a blank
    // line the paste brings with it. A tight list stays tight.
    const verdict = pasteThroughBothGates(
      '- one\n- two\n', pos(0, 5), pos(0, 5), '- alpha\n  - beta\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(encode(verdict.after)).toBe('- one\n- alpha\n  - beta\n- two\n');
  });

  it('a replacement inherits the separation of what it replaced', () => {
    // The type-over path reaches its destination through a deletion, which
    // takes the replaced run's own gap with it, so the separation is read off
    // the tree before that. Left to the payload's, a section copied out of a
    // note carried that note's blank line into a tight list.
    const tight = pasteThroughBothGates(
      '- one\n  - a\n- three\n', pos(1, 4), pos(1, 5), '- x\n  - y\n',
    );
    expect(tight.kind).toBe('rewrite');
    if (tight.kind !== 'rewrite') return;
    expect(encode(tight.after)).toBe('- one\n  - x\n    - y\n- three\n');

    const loose = pasteThroughBothGates(
      '- one\n  - a\n\n- three\n', pos(1, 4), pos(1, 5), '- x\n  - y\n',
    );
    expect(loose.kind).toBe('rewrite');
    if (loose.kind !== 'rewrite') return;
    expect(encode(loose.after)).toBe('- one\n  - x\n    - y\n\n- three\n');

    // And the terminating newline where the replaced run ended the file.
    const atEnd = pasteThroughBothGates(
      '- one\n  - a\n', pos(1, 4), pos(1, 5), '- x\n  - y\n',
    );
    expect(atEnd.kind).toBe('rewrite');
    if (atEnd.kind !== 'rewrite') return;
    expect(encode(atEnd.after)).toBe('- one\n  - x\n    - y\n');
  });

  it('a replacement inherits that separation on every insertion path', () => {
    // The second review round: the inherited separation reached only the path
    // that replaces a whole scope. With a surviving sibling the run took the
    // tree's own reading, which by then no longer held what the deletion had
    // removed — the blank line below a replaced first item, and the
    // terminating newline where the replaced run ended the file.
    const survivorBelow = pasteThroughBothGates(
      '- a\n\n- b\n', pos(0, 0), pos(0, 3), '- x\n  - y\n',
    );
    expect(survivorBelow.kind).toBe('rewrite');
    if (survivorBelow.kind !== 'rewrite') return;
    expect(encode(survivorBelow.after)).toBe('- x\n  - y\n\n- b\n');

    const survivorAbove = pasteThroughBothGates(
      '- a\n- b\n', pos(1, 0), pos(1, 3), '- x\n  - y\n',
    );
    expect(survivorAbove.kind).toBe('rewrite');
    if (survivorAbove.kind !== 'rewrite') return;
    expect(encode(survivorAbove.after)).toBe('- a\n- x\n  - y\n');

    // And where the two meet: the run replaced ended the file, so it hands the
    // terminating newline over, while the node above keeps the blank line that
    // was its own separation from what stood there.
    const loose = pasteThroughBothGates(
      '- a\n\n- b\n', pos(2, 0), pos(2, 3), '- x\n  - y\n',
    );
    expect(loose.kind).toBe('rewrite');
    if (loose.kind !== 'rewrite') return;
    expect(encode(loose.after)).toBe('- a\n\n- x\n  - y\n');
  });

  it('takes over the terminating newline at the end of a document', () => {
    // Negative control: the last node's gap is the file's final newline, not a
    // separation — copied rather than taken over, it would end the file in two
    // newlines and leave the run flush under the anchor.
    const verdict = pasteThroughBothGates(
      '# Day\n\nbody\n', pos(2, 4), pos(2, 4), '## Notes\n\nSome prose.\n',
    );
    expect(verdict.kind).toBe('rewrite');
    if (verdict.kind !== 'rewrite') return;
    expect(encode(verdict.after)).toBe('# Day\n\nbody\n\n## Notes\n\nSome prose.\n');
  });
});

describe('an inexpressible paste is refused, never passed through', () => {
  it('a caret paste vetoes rather than leaving the buffer corrupted', () => {
    // Negative control: the old `return PASS` here let Obsidian concatenate
    // the payload's first line onto the anchor's and drop the rest at its
    // source indentation — not the "editable text" the default assumed.
    const verdict = pasteThroughBothGates('Intro.\n\n- a\n- b\n', pos(2, 3), pos(2, 3), ATOM_PAYLOAD);
    expect(verdict.kind).toBe('veto');
  });

  it('nothing the heading arm converts reaches the veto, at any depth', () => {
    const shapes = [
      ['- one\n  - a\n', pos(1, 5)],
      ['- one\n  - a\n    - b\n', pos(2, 7)],
      ['- one\n\t- a\n', pos(1, 5)],
      ['# H\n\npara\n\n- a\n  - b\n', pos(5, 7)],
    ] as const;
    for (const [md, at] of shapes) {
      const verdict = pasteThroughBothGates(md, at, at, SECTION_PAYLOAD);
      expect(verdict.kind).toBe('rewrite');
    }
  });
});

// ------------------------------------------- a-caret-edit-is-never-a-type-over

/**
 * Obsidian's own Enter inside a quote, through BOTH gates
 * (docs/research/enter-inside-a-quote): the character before the caret is
 * replaced by itself, a line break and the quote's `> `, from an EMPTY
 * selection. `fromSelection` is the negative control — the same bytes typed
 * over a one-character selection ARE a type-over.
 */
function stockEnterThroughBothGates(
  md: string,
  caret: { line: number; ch: number },
  continuation: string,
  fromSelection = false,
): Verdict {
  const doc = parse(md);
  const from = pos(caret.line, caret.ch - 1);
  const insert = md.split('\n')[caret.line]!.charAt(caret.ch - 1) + continuation;
  const facts: TransactionFacts = {
    userEvent: 'input.type',
    isComposition: false,
    changedLineSpans: [
      { fromLine: caret.line, toLine: caret.line, insertedText: insert, fromCh: from.ch,
        toCh: caret.ch, rangeEnd: caret },
    ],
    cursorBefore: caret,
    emptySelectionBefore: !fromSelection,
  };
  const edit: EditFact = { from, to: caret, insert, cursorBefore: caret };
  return computeVerdict(classify(facts, doc), doc, edit);
}

describe('a replacement synthesized around a caret passes', () => {
  it('Enter inside a quote, a callout and a list inside a quote all pass', () => {
    // Every measured destroying shape of issue #155, each of which the
    // negative control below turns back into the destroying rewrite.
    expect(stockEnterThroughBothGates('> alpha\n> beta\n', pos(0, 7), '\n> ').kind).toBe('pass');
    expect(stockEnterThroughBothGates('> alpha\n> beta\n', pos(0, 4), '\n> ').kind).toBe('pass');
    expect(stockEnterThroughBothGates('> alpha\n> beta\n', pos(1, 6), '\n> ').kind).toBe('pass');
    expect(stockEnterThroughBothGates('> [!note] title\n> body\n', pos(1, 6), '\n> ').kind).toBe('pass');
    expect(stockEnterThroughBothGates('> \t- nested\n', pos(0, 11), '\n> \t- ').kind).toBe('pass');
  });

  it('the same bytes over a selection replace the whole quote — the reading the caret case fell into', () => {
    const verdict = stockEnterThroughBothGates('> alpha\n> beta\n', pos(0, 7), '\n> ', true);
    expect(verdict.kind).toBe('rewrite');
    expect(applyVerdict('> alpha\n> beta\n', verdict)).toBe('a\n> \n');
  });
});
