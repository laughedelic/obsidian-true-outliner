import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { classify, type ChangedLineSpan, type TransactionClass, type TransactionFacts } from '../src/classify';
import { arbTree } from './generators';
import { encode } from '../src/encode';

const ALL_CLASSES: readonly TransactionClass[] = [
  'programmatic',
  'composition',
  'plugin-own',
  'selection-only',
  'within-node-edit',
  'boundary-crossing-edit',
];

function facts(partial: Partial<TransactionFacts>): TransactionFacts {
  return { userEvent: undefined, isComposition: false, changedLineSpans: [], ...partial };
}

const span = (fromLine: number, toLine: number): ChangedLineSpan => ({ fromLine, toLine });

describe('classify: order precedence and each class reachable', () => {
  const doc = parse('# H\n\nPara one.\n\nPara two.\n\n- item\n');
  // Line map: 0 '# H' / 1 gap(H) / 2 'Para one.' / 3 gap / 4 'Para two.' / 5 gap / 6 '- item' (child of Para two)

  it('no userEvent → programmatic, regardless of everything else', () => {
    expect(classify(facts({}), doc)).toBe('programmatic');
    expect(
      classify(facts({ isComposition: true, changedLineSpans: [span(0, 4)] }), doc),
    ).toBe('programmatic');
  });

  it('undo/redo userEvent → programmatic (never re-normalized)', () => {
    expect(classify(facts({ userEvent: 'undo' }), doc)).toBe('programmatic');
    expect(classify(facts({ userEvent: 'redo' }), doc)).toBe('programmatic');
    // Sub-namespaced undo-like events also match (CM6 isUserEvent semantics).
    expect(classify(facts({ userEvent: 'undo.selection' }), doc)).toBe('programmatic');
  });

  it('"set" userEvent → programmatic (Phase A finding: external Vault.process reconciliation)', () => {
    expect(
      classify(facts({ userEvent: 'set', changedLineSpans: [span(2, 4)] }), doc),
    ).toBe('programmatic');
  });

  it('composition beats plugin-own and edit classes', () => {
    expect(
      classify(
        facts({ userEvent: 'move.structure', isComposition: true, changedLineSpans: [span(2, 2)] }),
        doc,
      ),
    ).toBe('composition');
  });

  it('plugin-own userEvents are recognized exactly', () => {
    for (const ev of ['input.structure.indent', 'input.structure.outdent', 'input.structure.split', 'move.structure']) {
      expect(classify(facts({ userEvent: ev, changedLineSpans: [span(2, 2)] }), doc)).toBe('plugin-own');
      // Sub-namespaced variants also match (prefix semantics).
      expect(classify(facts({ userEvent: `${ev}.extra` }), doc)).toBe('plugin-own');
    }
  });

  it('unrelated userEvent, no changes → selection-only (default-permit catch-all)', () => {
    expect(classify(facts({ userEvent: 'select.pointer' }), doc)).toBe('selection-only');
    expect(classify(facts({ userEvent: 'totally.unknown.origin' }), doc)).toBe('selection-only');
  });

  it('single-node change span → within-node-edit', () => {
    expect(classify(facts({ userEvent: 'input.type', changedLineSpans: [span(2, 3)] }), doc)).toBe(
      'within-node-edit',
    );
    // A pure insertion (fromLine === toLine) always stays within one line.
    expect(classify(facts({ userEvent: 'input.type', changedLineSpans: [span(4, 4)] }), doc)).toBe(
      'within-node-edit',
    );
  });

  it('change span crossing two nodes → boundary-crossing-edit', () => {
    expect(
      classify(facts({ userEvent: 'input.type', changedLineSpans: [span(2, 4)] }), doc),
    ).toBe('boundary-crossing-edit');
  });

  it('any one crossing span among several makes the whole transaction boundary-crossing', () => {
    expect(
      classify(
        facts({ userEvent: 'input.type', changedLineSpans: [span(2, 3), span(2, 4)] }),
        doc,
      ),
    ).toBe('boundary-crossing-edit');
  });

  it('every class is reachable', () => {
    const reached = new Set<TransactionClass>([
      classify(facts({}), doc),
      classify(facts({ userEvent: 'input.type', isComposition: true }), doc),
      classify(facts({ userEvent: 'move.structure' }), doc),
      classify(facts({ userEvent: 'select.pointer' }), doc),
      classify(facts({ userEvent: 'input.type', changedLineSpans: [span(2, 3)] }), doc),
      classify(facts({ userEvent: 'input.type', changedLineSpans: [span(2, 4)] }), doc),
    ]);
    expect(reached).toEqual(new Set(ALL_CLASSES));
  });

  it('node-edit-enforcement rewrite userEvents are plugin-own (D7a short-circuit)', () => {
    for (const ev of ['delete.structural', 'delete.structural.merge', 'input.paste.structural']) {
      expect(classify(facts({ userEvent: ev, changedLineSpans: [span(2, 4)] }), doc)).toBe('plugin-own');
    }
  });
});

describe('classify: node-edit-enforcement D4/D5 boundary shapes', () => {
  const doc = parse('# H\n\nPara one.\n\nPara two.\n');
  // 0 '# H' / 1 gap(H) / 2 'Para one.' / 3 gap / 4 'Para two.' / 5 gap

  it('a single-character deletion of the boundary newline is boundary-crossing despite fromLine === toLine', () => {
    // The span itself is degenerate (fromLine === toLine === 3, the gap
    // line) under the exclusive-end convention; only `deletesLineBoundary`
    // reveals it touches "Para two." too.
    expect(
      classify(
        facts({
          userEvent: 'input.type',
          changedLineSpans: [{ fromLine: 3, toLine: 3, deletesLineBoundary: true }],
        }),
        doc,
      ),
    ).toBe('boundary-crossing-edit');
  });

  it('the same single-character span WITHOUT the boundary-deletion bit stays within-node', () => {
    expect(
      classify(facts({ userEvent: 'input.type', changedLineSpans: [{ fromLine: 3, toLine: 3 }] }), doc),
    ).toBe('within-node-edit');
  });

  it('a pure insertion whose text parses to multiple blocks is boundary-crossing', () => {
    expect(
      classify(
        facts({
          userEvent: 'input.paste',
          changedLineSpans: [{ fromLine: 2, toLine: 2, insertedText: 'One.\n\nTwo.' }],
        }),
        doc,
      ),
    ).toBe('boundary-crossing-edit');
  });

  it('a pure insertion whose text parses to a single block stays within-node', () => {
    expect(
      classify(
        facts({
          userEvent: 'input.paste',
          changedLineSpans: [{ fromLine: 2, toLine: 2, insertedText: 'just one line' }],
        }),
        doc,
      ),
    ).toBe('within-node-edit');
  });

  it('a multi-block insertion landing in the preamble stays within-node (out of jurisdiction)', () => {
    const withFm = parse('---\nk: 1\n---\n\nBody.\n');
    expect(
      classify(
        facts({
          userEvent: 'input.paste',
          changedLineSpans: [{ fromLine: 1, toLine: 1, insertedText: 'One.\n\nTwo.' }],
        }),
        withFm,
      ),
    ).toBe('within-node-edit');
  });
});

describe('classify: chrome-boundary deletion shapes (chrome-transparency amendment)', () => {
  const doc = parse('- alpha\n- beta\n');
  // 0 '- alpha' / 1 '- beta'

  it('marker-space deletion at a list item content start, cursor there → boundary-crossing', () => {
    expect(
      classify(
        facts({
          userEvent: 'delete.backward',
          changedLineSpans: [{ fromLine: 1, toLine: 1, insertedText: '', fromCh: 1, toCh: 2 }],
          cursorBefore: { line: 1, ch: 2 },
        }),
        doc,
      ),
    ).toBe('boundary-crossing-edit');
  });

  it('the same span without the cursor fact stays within-node (conservative default)', () => {
    expect(
      classify(
        facts({
          userEvent: 'delete.backward',
          changedLineSpans: [{ fromLine: 1, toLine: 1, insertedText: '', fromCh: 1, toCh: 2 }],
        }),
        doc,
      ),
    ).toBe('within-node-edit');
  });

  it('Delete into the node\'s own trailing gap with cursor at content end → boundary-crossing', () => {
    const gapped = parse('First.\n\nSecond.\n');
    // Deleting the newline ending "First." — both adjacent lines belong to
    // First. (line 1 is its own gap), so only the cursor reveals intent.
    expect(
      classify(
        facts({
          userEvent: 'delete.forward',
          changedLineSpans: [
            { fromLine: 0, toLine: 0, insertedText: '', deletesLineBoundary: true },
          ],
          cursorBefore: { line: 0, ch: 'First.'.length },
        }),
        gapped,
      ),
    ).toBe('boundary-crossing-edit');
  });

  it('the same bytes with the cursor on the gap line stay within-node (escape hatch)', () => {
    const gapped = parse('First.\n\nSecond.\n');
    expect(
      classify(
        facts({
          userEvent: 'delete.backward',
          changedLineSpans: [
            { fromLine: 0, toLine: 0, insertedText: '', deletesLineBoundary: true },
          ],
          cursorBefore: { line: 1, ch: 0 },
        }),
        gapped,
      ),
    ).toBe('within-node-edit');
  });
});

describe('classify: preamble and gap-line edge cases', () => {
  const doc = parse('---\nk: 1\n---\n\n# H\n\nBody.\n');
  // Line map: 0 '---' 1 'k: 1' 2 '---' 3 gap  (preamble = lines 0-3)
  //           4 '# H' 5 gap(H)  6 'Body.'

  it('a span entirely inside the preamble is within-node (same "preamble" identity)', () => {
    expect(classify(facts({ userEvent: 'input.type', changedLineSpans: [span(1, 1)] }), doc)).toBe(
      'within-node-edit',
    );
  });

  it('a span crossing from preamble into the first node is boundary-crossing', () => {
    expect(classify(facts({ userEvent: 'input.type', changedLineSpans: [span(3, 4)] }), doc)).toBe(
      'boundary-crossing-edit',
    );
  });

  it('a span landing entirely on a gap line resolves to the owning node', () => {
    // Line 5 is H's trailing gap; a single-line insertion there is within-node.
    expect(classify(facts({ userEvent: 'input.type', changedLineSpans: [span(5, 5)] }), doc)).toBe(
      'within-node-edit',
    );
  });
});

describe('classify: totality and default-permit (property)', () => {
  it('always returns exactly one of the six classes, for any doc/facts combination', () => {
    fc.assert(
      fc.property(
        arbTree(),
        fc.option(fc.string(), { nil: undefined }),
        fc.boolean(),
        fc.array(fc.tuple(fc.nat(50), fc.nat(50)), { maxLength: 4 }),
        (tree, userEvent, isComposition, rawSpans) => {
          const text = encode(tree);
          const doc = parse(text);
          const changedLineSpans = rawSpans.map(([a, b]) => span(Math.min(a, b), Math.max(a, b)));
          const cls = classify({ userEvent, isComposition, changedLineSpans }, doc);
          return (ALL_CLASSES as readonly string[]).includes(cls);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('an unrecognized userEvent never gets misclassified as plugin-own', () => {
    fc.assert(
      fc.property(fc.string().filter((s) => s.length > 0), (randomEvent) => {
        const doc = parse('Para.\n');
        const known = ['input.structure.indent', 'input.structure.outdent', 'input.structure.split', 'move.structure', 'undo', 'redo', 'set'];
        fc.pre(!known.some((k) => randomEvent === k || randomEvent.startsWith(`${k}.`)));
        const cls = classify(facts({ userEvent: randomEvent }), doc);
        return cls !== 'plugin-own' && cls !== 'programmatic';
      }),
      { numRuns: 200 },
    );
  });
});
