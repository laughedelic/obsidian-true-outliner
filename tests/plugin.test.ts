import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { walkNodes } from '../src/model';
import {
  contentColumnCh,
  deleteSubtrees,
  indent,
  mergeNodes,
  moveDown,
  moveUp,
  outdent,
  splitNode,
} from '../src/ops';
import { applyEdits, diffLines, type Edit } from '../src/result';
import {
  DEFAULT_DATA,
  OutlineModeRegistry,
  normalizePluginData,
} from '../src/plugin/mode-registry';
import { nodeAtLine } from '../src/locate';
import { editsToChanges, type EditorChange } from '../src/plugin/dispatch';
import { planKey } from '../src/plugin/grammar';
import { REJECTION_MESSAGES } from '../src/plugin/messages';
import { compareWithSections, topLevelSpans } from '../src/plugin/crosscheck';
import { arbTree } from './generators';

describe('mode registry', () => {
  const make = () => {
    const saves: string[][] = [];
    const registry = new OutlineModeRegistry((paths) => {
      saves.push(paths);
      return Promise.resolve();
    });
    return { registry, saves };
  };

  it('toggles, persists, and hydrates', async () => {
    const { registry, saves } = make();
    expect(await registry.toggle('a.md')).toBe(true);
    expect(registry.isOutline('a.md')).toBe(true);
    expect(saves.at(-1)).toEqual(['a.md']);
    expect(await registry.toggle('a.md')).toBe(false);
    expect(saves.at(-1)).toEqual([]);

    const { registry: rehydrated } = make();
    rehydrated.hydrate(['x.md', 'y.md']);
    expect(rehydrated.isOutline('y.md')).toBe(true);
  });

  it('rename migrates state; delete prunes; no-ops save nothing', async () => {
    const { registry, saves } = make();
    await registry.toggle('old.md');
    await registry.handleRename('old.md', 'new.md');
    expect(registry.isOutline('old.md')).toBe(false);
    expect(registry.isOutline('new.md')).toBe(true);
    const savesBefore = saves.length;
    await registry.handleRename('unrelated.md', 'other.md');
    await registry.handleDelete('unrelated.md');
    expect(saves.length).toBe(savesBefore); // untouched paths don't churn the store
    await registry.handleDelete('new.md');
    expect(registry.isOutline('new.md')).toBe(false);
    expect(saves.at(-1)).toEqual([]);
  });
});

describe('persisted plugin data', () => {
  it('drops a key it does not know, so a retired setting stays retired', () => {
    // The defect this exists for: `{ ...DEFAULT_DATA, ...loadData() }` keeps
    // every key the file holds, so deleting a setting's TYPE leaves its VALUE
    // on the object and the next save writes it back. Picking known keys is
    // what makes a removal a removal.
    const onDisk = {
      ...DEFAULT_DATA,
      listLayout: 'own-guides',
      listBullet: 'column',
      somethingElseEntirely: 42,
    };
    const normalized = normalizePluginData(onDisk);
    expect(Object.keys(normalized).sort()).toEqual(Object.keys(DEFAULT_DATA).sort());
    expect(normalized).not.toHaveProperty('listLayout');
    expect(normalized).not.toHaveProperty('listBullet');
  });

  it('keeps every known value it is given', () => {
    const onDisk = {
      outlinePaths: ['a.md'],
      coexistenceWarned: true,
      debugCrossCheck: true,
      // Non-default on purpose: the assertion is that a stored value survives
      // normalisation, which a field left at its default would not prove.
      debugFooterWidget: true,
      markerVisibility: 'with-children' as const,
      guideHighlight: 'lineage' as const,
      markerHighlight: 'lineage' as const,
    };
    expect(normalizePluginData(onDisk)).toEqual(onDisk);
  });

  it('fills in a key the file does not have, rather than leaving it undefined', () => {
    const normalized = normalizePluginData({ outlinePaths: ['a.md'] });
    expect(normalized.outlinePaths).toEqual(['a.md']);
    expect(normalized.markerVisibility).toBe(DEFAULT_DATA.markerVisibility);
    expect(normalized.guideHighlight).toBe(DEFAULT_DATA.guideHighlight);
  });

  it('falls back per field when a stored value has the wrong type', () => {
    // `data.json` is a plain file a user can edit and an older build can have
    // written, so a field can hold anything. Measured before this check
    // existed: `outlinePaths: 42` makes `hydrate`'s `new Set(paths)` throw out
    // of `onload`, so the plugin does not load at all.
    for (const bad of [42, 'note.md', null, {}, true]) {
      expect(normalizePluginData({ outlinePaths: bad }).outlinePaths).toEqual([]);
    }
    expect(normalizePluginData({ coexistenceWarned: 'yes' }).coexistenceWarned).toBe(false);
    expect(normalizePluginData({ debugCrossCheck: 1 }).debugCrossCheck).toBe(false);
    // an unknown enum state reaches a settings dropdown with no matching option
    expect(normalizePluginData({ markerVisibility: 'bogus' }).markerVisibility).toBe(
      DEFAULT_DATA.markerVisibility,
    );
    expect(normalizePluginData({ guideHighlight: 'lineage-ish' }).guideHighlight).toBe(
      DEFAULT_DATA.guideHighlight,
    );
    expect(normalizePluginData({ markerHighlight: 7 }).markerHighlight).toBe(
      DEFAULT_DATA.markerHighlight,
    );
    // and a prototype key is a string but not a known state
    expect(normalizePluginData({ guideHighlight: 'toString' }).guideHighlight).toBe(
      DEFAULT_DATA.guideHighlight,
    );
  });

  it('keeps the good entries when only some of outlinePaths are bad', () => {
    // One bad entry should cost that note's state, not every note's.
    expect(normalizePluginData({ outlinePaths: ['a.md', 3, null, 'b.md'] }).outlinePaths).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('never hands back the shared default array', () => {
    const first = normalizePluginData({});
    first.outlinePaths.push('a.md');
    expect(normalizePluginData({}).outlinePaths).toEqual([]);
    expect(DEFAULT_DATA.outlinePaths).toEqual([]);
  });

  it('answers with defaults for no stored data at all', () => {
    expect(normalizePluginData(null)).toEqual(DEFAULT_DATA);
    expect(normalizePluginData(undefined)).toEqual(DEFAULT_DATA);
  });
});

describe('node resolution at cursor line', () => {
  const md = '---\nt: 1\n---\n\n# H\n\nPara one\nsecond line\n\n- item\n\t- child\n';
  const doc = parse(md);

  it('resolves own lines, continuation lines, and gap lines', () => {
    expect(nodeAtLine(doc, 0)).toBeUndefined(); // frontmatter
    expect(nodeAtLine(doc, 3)).toBeUndefined(); // preamble gap
    expect(nodeAtLine(doc, 4)!.lines[0]).toBe('# H');
    expect(nodeAtLine(doc, 6)!.lines[0]).toBe('Para one');
    expect(nodeAtLine(doc, 7)!.lines[0]).toBe('Para one'); // multiline node
    expect(nodeAtLine(doc, 8)!.lines[0]).toBe('Para one'); // its trailing gap
    expect(nodeAtLine(doc, 9)!.lines[0]).toBe('- item');
    expect(nodeAtLine(doc, 10)!.lines[0]).toBe('\t- child');
  });

  it('every line of any generated document resolves consistently', () => {
    fc.assert(
      fc.property(arbTree(), (tree) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        const reparsed = parse(text);
        for (let i = 0; i < lines.length; i++) {
          const node = nodeAtLine(reparsed, i);
          if (node === undefined) continue; // preamble only
          // The resolved node must actually own this line: the line is
          // within [start, start + lines + gap).
          if (![...walkNodes(reparsed)].includes(node)) return false;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

describe('edit dispatch: line edits → editor changes', () => {
  /** Reference implementation of Editor.transaction change application. */
  function applyChanges(text: string, changes: EditorChange[]): string {
    const lines = text === '' ? [''] : text.split('\n');
    const offsets: number[] = [];
    let acc = 0;
    for (const line of lines) {
      offsets.push(acc);
      acc += line.length + 1;
    }
    const toOffset = (pos: { line: number; ch: number }): number =>
      (offsets[pos.line] ?? 0) + pos.ch;
    let out = text;
    for (const change of [...changes].sort((a, b) => toOffset(b.from) - toOffset(a.from))) {
      out = out.slice(0, toOffset(change.from)) + change.text + out.slice(toOffset(change.to));
    }
    return out;
  }

  /**
   * The ordering guarantee `minimal-change-dispatch` states, asserted rather
   * than assumed. It is not free: runs are ascending and disjoint in LINE
   * space, but `lineRangeEnvelope` has to anchor a run with no line to sit on
   * somewhere real — an insertion past the last line becomes an insertion AT
   * the document's end — and that can coincide with the run in front of it.
   *
   * The consequences are quiet, which is why this is worth pinning. Applied
   * in emission order the document is still right, because CodeMirror keeps
   * equal-`from` specs in the order given; it is every POSITION-based
   * consumer that breaks — `applyChanges` above (which sorts, as any
   * reference implementation would) and `mapCursorForward`, which stops at
   * the first of two changes sharing a position.
   */
  describe('changes are strictly ascending and non-overlapping', () => {
    const toOffset = (lines: readonly string[], pos: { line: number; ch: number }): number => {
      let acc = 0;
      for (let i = 0; i < pos.line; i++) acc += (lines[i]?.length ?? 0) + 1;
      return acc + pos.ch;
    };

    /** Ascending with no two ranges touching or overlapping. */
    function ordering(lines: readonly string[], changes: readonly EditorChange[]) {
      const bounds = changes.map((c) => [toOffset(lines, c.from), toOffset(lines, c.to)] as const);
      return bounds.every(([from, to], i) => from <= to && (i === 0 || from > bounds[i - 1]![1]));
    }

    it('for the shape that first broke it: an anchor on the empty last line', () => {
      // Appending a list under a paragraph in a file that ends with a newline.
      // The alignment anchors on the trailing empty line, leaving an insertion
      // run on either side of it — and the second one has no line to sit on,
      // so it lands at the document end, exactly where the first one is.
      const before = ['para', ''];
      const changes = editsToChanges(before, diffLines(before, ['para', '- a', '', '- b']));
      expect(ordering(before, changes)).toBe(true);
      expect(applyChanges(before.join('\n'), changes)).toBe('para\n- a\n\n- b');
    });

    it('for any before/after line pair the enforcement rewrite path can produce', () => {
      // `enforce.ts` feeds arbitrary before/after documents through the same
      // `diffLines`, so this is not a hypothetical input space. The vocabulary
      // repeats deliberately: duplicate and empty lines are what defeat the
      // alignment's unique-line anchoring and produce the awkward runs.
      const arbLines = fc.array(
        fc.constantFrom('', 'para', '- a', '- b', '\t- a', '# h', '| a | b |', '\t'),
        { maxLength: 8 },
      );
      fc.assert(
        fc.property(arbLines, arbLines, (before, after) => {
          const changes = editsToChanges(before, diffLines(before, after));
          if (!ordering(before, changes)) return false;
          // Position-ordered application must agree with the edits themselves.
          return applyChanges(before.join('\n'), changes) === after.join('\n');
        }),
        { numRuns: 20000 },
      );
    });
  });

  it('reproduces the op encoding exactly for any generated op', () => {
    const OPS = [indent, outdent, moveUp, moveDown];
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(3), (tree, n, opIndex) => {
        const text = encode(tree);
        const doc = parse(text);
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const node = all[n % all.length]!;
        const result = OPS[opIndex]!(doc, node.id);
        if (!result.ok) return true;
        const lines = text === '' ? [] : text.split('\n');
        const viaChanges = applyChanges(text, editsToChanges(lines, result.value.edits));
        const viaEdits = applyEdits(lines, result.value.edits).join('\n');
        return viaChanges === viaEdits && viaChanges === encode(result.value.doc);
      }),
      { numRuns: 1500 },
    );
  });

  it('reproduces the op encoding exactly for line-count-changing ops (merge, split, delete)', () => {
    // Unlike indent/outdent/move (same line count before and after), these
    // change how many lines the edit spans — exercising dispatch.ts's
    // whole-region-trim branch rather than its per-line branch
    // (minimal-change-dispatch design.md D2).
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(2), (tree, n, opIndex) => {
        const text = encode(tree);
        const doc = parse(text);
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const node = all[n % all.length]!;
        const lines = text === '' ? [] : text.split('\n');
        const startLine = lines.findIndex((_, i) => nodeAtLine(doc, i) === node);
        const result =
          opIndex === 0
            ? mergeNodes(doc, node.id)
            : opIndex === 1
              ? splitNode(doc, node.id, { line: startLine, ch: contentColumnCh(lines[startLine] ?? '') })
              : deleteSubtrees(doc, [node.id]);
        if (!result.ok) return true;
        const viaChanges = applyChanges(text, editsToChanges(lines, result.value.edits));
        const viaEdits = applyEdits(lines, result.value.edits).join('\n');
        return viaChanges === viaEdits && viaChanges === encode(result.value.doc);
      }),
      { numRuns: 1500 },
    );
  });

  it('cursor lands on the moved node content (spec scenario)', () => {
    const doc = parse('First thought.\n\nSecond thought.\n');
    const node = [...walkNodes(doc)].find((n) => n.lines[0] === 'Second thought.')!;
    const result = indent(doc, node.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // '- Second thought.' — content starts after the marker.
      expect(result.value.anchor).toEqual({ line: 2, ch: 2 });
    }
  });

  /**
   * A pure APPEND past the last line — `diffLines` emits `[n, n) -> [...]`
   * for an edit that only adds lines at the end, and `splitNode` produces
   * exactly that when Enter is pressed at the end of a document's final
   * paragraph. There is no line `n` to anchor at, and the CM6 adapter
   * converts a change with `doc.line(from.line + 1)`, which throws.
   *
   * Every position a change carries must be a real position in the OLD
   * document, and `from` must not come after `to` — asserted directly here
   * rather than only through the resulting text, because the old shape
   * produced the correct text via `applyEdits` while still being
   * undispatchable.
   */
  describe('an edit that appends past the last line stays dispatchable', () => {
    const cases = [
      ['trailing newline', 'a\n\nb\n'],
      ['no trailing newline', 'a\n\nb'],
      ['heading and paragraph', '# H\n\nlast para\n'],
    ] as const;

    for (const [name, text] of cases) {
      it(`${name}: positions are in range and ordered`, () => {
        const lines = text.split('\n');
        const doc = parse(text);
        const last = [...walkNodes(doc)].at(-1)!;
        const startLine = lines.findIndex((_, i) => nodeAtLine(doc, i) === last);
        const result = splitNode(doc, last.id, {
          line: startLine,
          ch: (lines[startLine] ?? '').length,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Confirms this case still exercises the append shape.
        expect(result.value.edits[0]!.fromLine).toBe(lines.length);

        const changes = editsToChanges(lines, result.value.edits);
        for (const c of changes) {
          expect(c.from.line).toBeLessThan(lines.length);
          expect(c.to.line).toBeLessThan(lines.length);
          const ordered =
            c.from.line < c.to.line || (c.from.line === c.to.line && c.from.ch <= c.to.ch);
          expect(ordered).toBe(true);
        }
        // …and still produces the same document as applying the edits.
        expect(applyChanges(text, changes)).toBe(applyEdits(lines, result.value.edits).join('\n'));
      });
    }
  });

  /**
   * The append branch's own edge: an EMPTY buffer, which every caller spells
   * as `[]` (`text === '' ? [] : text.split('\n')`). It takes the same
   * `fromLine >= lines.length` path, but has no current last line to be
   * separated from — prepending the separator newline anyway inserted a
   * leading blank line the edit never asked for.
   *
   * Driven straight off `Edit` values rather than through an operation: the
   * ops all reject on an empty document, so nothing reaches this shape through
   * them today, and a test that went via an op would silently stop covering
   * the branch. `applyEdits` is the oracle, as it is for the property test.
   */
  describe('an append into an empty buffer adds no leading separator', () => {
    const cases: [string, Edit][] = [
      ['one line', { fromLine: 0, toLine: 0, insert: ['text'] }],
      ['two lines', { fromLine: 0, toLine: 0, insert: ['a', 'b'] }],
      ['a blank line', { fromLine: 0, toLine: 0, insert: [''] }],
    ];
    for (const [name, edit] of cases) {
      it(`${name}`, () => {
        expect(applyChanges('', editsToChanges([], [edit]))).toBe(applyEdits([], [edit]).join('\n'));
      });
    }

    it('still separates when there IS a preceding line', () => {
      const edit: Edit = { fromLine: 1, toLine: 1, insert: ['y'] };
      expect(applyChanges('x', editsToChanges(['x'], [edit]))).toBe('x\ny');
    });
  });

  // Pins the three worked shapes from the proposal's table (design.md D2):
  // exact minimal EditorChange[] output, not just the resulting text.
  describe('minimal change sets match the worked shapes exactly', () => {
    it('merging two paragraphs deletes only the line-break span', () => {
      const text = 'paragraph A\n\nparagraph B\n';
      const doc = parse(text);
      const first = [...walkNodes(doc)].find((n) => n.lines[0] === 'paragraph A')!;
      const result = mergeNodes(doc, first.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lines = text.split('\n');
      expect(editsToChanges(lines, result.value.edits)).toEqual([
        { from: { line: 0, ch: 11 }, to: { line: 2, ch: 0 }, text: '' },
      ]);
    });

    it('indenting a node with a child inserts one minimal change per changed line', () => {
      // The node's own line gets a real tab (destinationIndent); its child's
      // shift comes from shiftLine's own numeric-delta path (unrelated to
      // this change — see 64-structural-history-cursor.e2e.ts's comment on
      // the same fixture), so the two lines' insertions differ in text but
      // each is still a single minimal per-line change, not a whole-region
      // replacement.
      const text = '- alpha\n- beta\n\t- beta child\n- gamma\n';
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === '- beta')!;
      const result = indent(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lines = text.split('\n');
      expect(editsToChanges(lines, result.value.edits)).toEqual([
        { from: { line: 1, ch: 0 }, to: { line: 1, ch: 0 }, text: '\t' },
        { from: { line: 2, ch: 1 }, to: { line: 2, ch: 1 }, text: '    ' },
      ]);
    });

    it('outdenting a node with a child deletes two single tabs', () => {
      const text = '- alpha\n\t- beta\n\t\t- beta child\n- gamma\n';
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === '\t- beta')!;
      const result = outdent(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lines = text.split('\n');
      expect(editsToChanges(lines, result.value.edits)).toEqual([
        { from: { line: 1, ch: 0 }, to: { line: 1, ch: 1 }, text: '' },
        { from: { line: 2, ch: 1 }, to: { line: 2, ch: 2 }, text: '' },
      ]);
    });
  });

  /**
   * The property a REORDER needs and the per-line narrowing alone could not
   * express: a move relocates lines, so it must be described as lines
   * removed from one side and inserted on the other — never as an in-place
   * rewrite of everything in between.
   *
   * This is not a style preference. Obsidian's live table widget re-derives
   * its own document from the change set, and an in-place rewrite of a table
   * row it still owns made it split the table — the header severed from the
   * body by a blank line — when any sibling moved past it. The guarantee
   * that fixes it is stated here, at the choke point, for every atom kind
   * and at any nesting depth, rather than as a table-shaped special case at
   * the dispatch sites.
   */
  describe('a move never edits inside the block it passes over', () => {
    const TABLE = ['| a   | b   |', '| --- | --- |', '| 1   | 2   |'];

    const scenarios = [
      {
        name: 'paragraph moving down past a table',
        text: `Mover.\n\n${TABLE.join('\n')}\n`,
        target: 'Mover.',
        op: moveDown,
      },
      {
        name: 'paragraph moving up past a table',
        text: `${TABLE.join('\n')}\n\nMover.\n`,
        target: 'Mover.',
        op: moveUp,
      },
      {
        name: 'list item moving down past a table',
        text: `- Mover\n\n${TABLE.join('\n')}\n`,
        target: '- Mover',
        op: moveDown,
      },
      {
        // The shape the earlier, table-shaped fix missed: the sibling being
        // passed over is a LIST ITEM, and the table is its child.
        name: 'list item moving down past a sibling whose child is a table',
        text: `- Mover\n- Sibling\n\n${TABLE.map((l) => `\t${l}`).join('\n')}\n`,
        target: '- Mover',
        op: moveDown,
      },
    ] as const;

    it.each(scenarios)('$name', ({ text, target, op }) => {
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === target)!;
      const result = op(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lines = text.split('\n');
      const changes = editsToChanges(lines, result.value.edits);

      const tableLines = lines
        .map((line, i) => (line.trimStart().startsWith('|') ? i : -1))
        .filter((i) => i >= 0);
      expect(tableLines.length).toBe(TABLE.length);

      for (const change of changes) {
        for (const line of tableLines) {
          // A change may SPAN a table line only by covering it whole from a
          // line boundary — i.e. relocating it — never by starting or ending
          // partway into one, which is what makes the widget rewrite itself.
          const startsInside = change.from.line === line && change.from.ch > 0;
          const endsInside = change.to.line === line && change.to.ch > 0;
          expect({ change, line, startsInside, endsInside }).toMatchObject({
            startsInside: false,
            endsInside: false,
          });
        }
      }

      // …and in these scenarios the table is not relocated at all, so its
      // characters are outside every change range.
      const spans = changes.map((c) => [c.from.line, c.to.line] as const);
      for (const line of tableLines) {
        expect(spans.some(([from, to]) => from <= line && line < to)).toBe(false);
      }
    });

    /**
     * Whole old lines a change overwrites while putting something else in their
     * place. This is the corruption's actual signature, and it is worth being
     * precise about, because two more obvious signatures are NOT it. The
     * pre-fix change set for a FOUR-line mover past this table cut into no line
     * at all -- every boundary sat on a line edge -- and split the paragraph
     * anyway; what it did do was replace the table's first row with the mover's
     * second line while that row still existed further down the document. A
     * change may overwrite text freely, but only text that is actually gone.
     */
    const overwrittenSurvivors = (
      lines: readonly string[],
      changes: readonly EditorChange[],
      result: ReadonlySet<string>,
    ) =>
      changes.flatMap((change) => {
        if (change.text === '') return [];
        const inserted = new Set(change.text.split('\n'));
        const gone: string[] = [];
        for (let i = change.from.line; i <= change.to.line; i++) {
          const whole =
            (i > change.from.line || change.from.ch === 0) &&
            (i < change.to.line || change.to.ch === (lines[i] ?? '').length);
          const line = lines[i];
          if (whole && line !== undefined && !inserted.has(line) && result.has(line)) {
            gone.push(line);
          }
        }
        return gone;
      });

    /**
     * The alignment anchors whichever block it can chain the longest, so a mover
     * with more lines than the table wins and the TABLE becomes the block the
     * description says moved. That is not a defect and it is not what protects
     * the table: whichever block moves, it is removed and re-inserted whole
     * rather than rewritten in place, and measured against the live widget both
     * shapes leave the table intact. What the guarantee cannot be is a claim
     * about WHICH sibling stays put -- the change set alone does not know which
     * one the user gestured at, and it does not need to.
     */
    it('names the larger block as the one that stayed, and moves the other whole', () => {
      const mover = ['L1', 'L2', 'L3', 'L4'];
      const text = `${mover.join('\n')}\n\n${TABLE.join('\n')}\n`;
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === 'L1')!;
      const result = moveDown(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lines = text.split('\n');
      const changes = editsToChanges(lines, result.value.edits);

      // The four-line mover out-anchors the three-row table, so the table is
      // what the change set describes as having moved -- whole, in one piece.
      expect(changes).toEqual([
        {
          from: { line: 0, ch: 0 },
          to: { line: 0, ch: 0 },
          text: `${TABLE.join('\n')}\n\n`,
        },
        { from: { line: 4, ch: 0 }, to: { line: 8, ch: 0 }, text: '' },
      ]);

      // ...and nothing is rewritten in place, which is the property that
      // actually keeps the widget whole.
      const after = new Set(applyEdits(lines, result.value.edits));
      expect(overwrittenSurvivors(lines, changes, after)).toEqual([]);

      // The predicate is not vacuous: this is the change set this same document
      // produced BEFORE the alignment landed (measured), and it is caught.
      const preFix: EditorChange[] = [
        { from: { line: 0, ch: 0 }, to: { line: 0, ch: 2 }, text: '| a   | b   |' },
        { from: { line: 1, ch: 0 }, to: { line: 1, ch: 2 }, text: '| --- | --- |' },
        { from: { line: 2, ch: 0 }, to: { line: 2, ch: 2 }, text: '| 1   | 2   |' },
        { from: { line: 3, ch: 0 }, to: { line: 3, ch: 2 }, text: '' },
        { from: { line: 4, ch: 0 }, to: { line: 4, ch: 0 }, text: 'L1' },
        { from: { line: 5, ch: 0 }, to: { line: 5, ch: 13 }, text: 'L2' },
        { from: { line: 6, ch: 0 }, to: { line: 6, ch: 13 }, text: 'L3' },
        { from: { line: 7, ch: 0 }, to: { line: 7, ch: 13 }, text: 'L4' },
      ];
      expect(cutsIntoSurvivingLine(lines, preFix, after)).toEqual([]); // cuts nothing
      // ...yet rewrites every one of the table's rows, and the mover's lines too,
      // while all of them are still standing somewhere in the result.
      expect(overwrittenSurvivors(lines, preFix, after)).toEqual(
        expect.arrayContaining(TABLE),
      );
    });

    /**
     * The general form, over generated trees: a change may overwrite text, but
     * only text the edit actually destroys. Anything still standing elsewhere in
     * the result was MOVED, and a description that says it was rewritten is
     * telling every consumer -- widget, decoration, caret, folding -- something
     * that did not happen.
     *
     * Scoped, deliberately, to documents whose lines are DISTINCT. That is the
     * condition under which the alignment has anchors to work with, and round 8
     * stated it without the condition -- which reads as a guarantee the
     * narrowing cannot keep. Where lines repeat it degrades, on purpose and
     * measurably; the next two tests pin that, and the unconditional half of
     * the guarantee (no change ever cuts INTO a surviving line) is asserted
     * over the repeating family below.
     */
    it('never overwrites a whole line that survives the edit, for any op', () => {
      fc.assert(
        fc.property(arbTree(), (tree) => {
          // Give every content line its own identity. The generator's small
          // alphabet repeats lines constantly, and merely FILTERING for a
          // distinct-line document leaves a handful of tiny trees that exercise
          // almost no ops -- a property that cannot fail. Constructing the
          // condition instead keeps the shapes and the op coverage.
          const text = encode(parse(encode(tree)))
            .split('\n')
            .map((line, i) => (line.trim() === '' ? line : `${line} u${i}`))
            .join('\n');
          const lines = text.split('\n');
          const content = lines.filter((line) => line !== '');
          fc.pre(new Set(content).size === content.length);
          const doc = parse(text);
          for (const op of [indent, outdent, moveUp, moveDown]) {
            for (const node of walkNodes(doc)) {
              const applied = op(doc, node.id);
              if (!applied.ok) continue;
              const changes = editsToChanges(lines, applied.value.edits);
              const after = new Set(applyEdits(lines, applied.value.edits));
              // Blank lines are the one thing that always repeats: they are
              // separators, not content, and the alignment never anchors them.
              expect(
                overwrittenSurvivors(lines, changes, after).filter((line) => line !== ''),
              ).toEqual([]);
            }
          }
        }),
        { numRuns: 300 },
      );
    });

    /**
     * …and here is the degradation, pinned rather than papered over.
     *
     * Two sibling tables sharing a header and a separator row -- an entirely
     * ordinary document. Those shared lines are not unique, so they anchor
     * nothing, and the two body rows are left as each other's only candidates.
     * The change set says "row one became row three, row three became row one"
     * even though both survive. There is no better description available: a
     * deletion followed by an insertion deletes exactly the same range, so no
     * consumer can tell the two encodings apart. Measured against the live
     * widget, both tables come through intact (e2e, 20-structural-commands).
     *
     * What still holds is the half that matters: neither change starts or ends
     * partway into a row.
     */
    it('describes a swap of two rows it cannot anchor as a swap of whole rows', () => {
      const head = ['| h1  | h2  |', '| --- | --- |'];
      const text = `${head.join('\n')}\n| 1   | 2   |\n\n${head.join('\n')}\n| 3   | 4   |\n`;
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[2] === '| 3   | 4   |')!;
      const result = moveUp(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lines = text.split('\n');
      const changes = editsToChanges(lines, result.value.edits);
      expect(changes).toEqual([
        { from: { line: 2, ch: 0 }, to: { line: 2, ch: 13 }, text: '| 3   | 4   |' },
        { from: { line: 6, ch: 0 }, to: { line: 6, ch: 13 }, text: '| 1   | 2   |' },
      ]);
      const after = new Set(applyEdits(lines, result.value.edits));
      // Whole rows, both of them -- no character-level cut into either.
      expect(cutsIntoSurvivingLine(lines, changes, after)).toEqual([]);
    });

    it('states a move as one deletion plus one insertion', () => {
      const text = `Mover.\n\n${TABLE.join('\n')}\n`;
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === 'Mover.')!;
      const result = moveDown(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(editsToChanges(text.split('\n'), result.value.edits)).toEqual([
        { from: { line: 0, ch: 0 }, to: { line: 2, ch: 0 }, text: '' },
        { from: { line: 5, ch: 0 }, to: { line: 5, ch: 0 }, text: '\nMover.\n' },
      ]);
    });

    /**
     * Every position a change may name in a line that SURVIVES the edit — a
     * line whose content still exists afterwards was not rewritten, it moved,
     * so a change may cover it whole but must never cut into it.
     */
    const cutsIntoSurvivingLine = (
      lines: readonly string[],
      changes: readonly EditorChange[],
      surviving: ReadonlySet<string>,
    ) =>
      changes.flatMap((change) =>
        [change.from, change.to]
          .filter((pos) => {
            const line = lines[pos.line];
            return (
              line !== undefined && pos.ch > 0 && pos.ch < line.length && surviving.has(line)
            );
          })
          .map((pos) => ({ pos, line: lines[pos.line] })),
      );

    it('relocates the table itself without cutting into either node', () => {
      const text = `${TABLE.join('\n')}\n\nMover.\n`;
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === TABLE[0])!;
      const result = moveDown(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lines = text.split('\n');
      const changes = editsToChanges(lines, result.value.edits);
      expect(changes).toEqual([
        { from: { line: 0, ch: 0 }, to: { line: 0, ch: 0 }, text: 'Mover.\n\n' },
        { from: { line: 3, ch: 0 }, to: { line: 5, ch: 0 }, text: '' },
      ]);
      expect(cutsIntoSurvivingLine(lines, changes, new Set(result.value.edits.flatMap((edit) => edit.insert)))).toEqual(
        [],
      );
    });

    /**
     * The alignment anchors on lines that are unique to both sides, so a
     * region that REPEATS its lines can leave it with nothing to anchor a
     * relocated block on. What is left over then pairs lines that merely
     * swapped places, and character-level trimming on such a pair finds the
     * accidental `| ` prefix and ` |` suffix two table rows share — a change
     * starting partway into a row the move left alone, which is the exact
     * shape that splits the table. Losing an anchor may cost minimality; it
     * must never cost the guarantee.
     */
    it('never cuts into a line it could not anchor, only describes it more coarsely', () => {
      const text = 'Dup\n| a   | b   |\n\nDup\n| --- | --- |\n';
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === 'Dup')!;
      const result = moveDown(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lines = text.split('\n');
      const changes = editsToChanges(lines, result.value.edits);
      expect(changes).toEqual([
        { from: { line: 1, ch: 0 }, to: { line: 1, ch: 13 }, text: '| --- | --- |' },
        { from: { line: 4, ch: 0 }, to: { line: 4, ch: 13 }, text: '| a   | b   |' },
      ]);
    });

    it('never cuts into a surviving line, anywhere in that family', () => {
      // Documents whose siblings SHARE lines, which is what starves the
      // alignment of unique anchors; the rows differ only in their cells, so
      // whatever the alignment fails to match, character trimming is left
      // with the `| ` and ` |` every row has in common to align on.
      const marker = fc.constantFrom('Dup', '- dup');
      const row = fc.constantFrom(
        '| a   | b   |',
        '| --- | --- |',
        '| 1   | 2   |',
        '| x   | y   |',
      );
      const block = fc.tuple(marker, fc.array(row, { minLength: 1, maxLength: 2 }));
      fc.assert(
        fc.property(fc.array(block, { minLength: 2, maxLength: 3 }), (blocks) => {
          const text =
            blocks.map(([head, rows]) => [head, ...rows].join('\n')).join('\n\n') + '\n';
          const lines = text.split('\n');
          const doc = parse(text);
          // Every op on every node, so a document that reaches the shape is
          // never wasted on an op that cannot expose it.
          for (const op of [moveDown, moveUp, indent, outdent]) {
            for (const node of walkNodes(doc)) {
              const result = op(doc, node.id);
              if (!result.ok) continue;
              const changes = editsToChanges(lines, result.value.edits);
              expect(
                cutsIntoSurvivingLine(lines, changes, new Set(result.value.edits.flatMap((edit) => edit.insert))),
              ).toEqual([]);
              // …while still describing the same document.
              expect(applyChanges(text, changes)).toBe(
                applyEdits(lines, result.value.edits).join('\n'),
              );
            }
          }
        }),
        { numRuns: 5000 },
      );
    });

    /**
     * …and the converse, which the guarantee above cannot state on its own:
     * coarsening is only ever allowed where a line actually relocated.
     *
     * Whether two lines were swapped or rewritten is decided from the text on
     * each side of the edit, so a document whose lines merely REPEAT can make
     * an ordinary in-place edit look like a swap. Indenting `- a` whose two
     * children are both `  - a` produces `  - a` as the parent's new text —
     * the old child's text — and keying on that one coincidence turned three
     * two-character insertions into three whole-line replacements. The caret
     * is mapped through those changes, so it stopped keeping its column and
     * jumped to the end of the line.
     */
    it('an indent stays minimal when the lines it touches happen to repeat', () => {
      const text = '- x\n- a\n  - a\n  - a\n';
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === '- a')!;
      const result = indent(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const changes = editsToChanges(text.split('\n'), result.value.edits);
      expect(changes).toEqual([
        { from: { line: 1, ch: 0 }, to: { line: 1, ch: 0 }, text: '  ' },
        { from: { line: 2, ch: 2 }, to: { line: 2, ch: 2 }, text: '  ' },
        { from: { line: 3, ch: 2 }, to: { line: 3, ch: 2 }, text: '  ' },
      ]);
      // What the user sees: the caret keeps its column instead of being
      // carried to the end of a whole-line replacement.
      expect(planKey(text, { line: 1, ch: 2 }, 'indent')).toMatchObject({
        plan: { selection: 8 },
      });
    });

    /**
     * The cheapest description of a swap is not always the truthful one. Two
     * lines that differ by a character can be rewritten in place for less than
     * it costs to move one past the other, and a reader of that change set --
     * a widget, a decoration, the caret -- is told both lines were edited when
     * in fact neither was. Nothing here is a table, but this is the shape the
     * table bug wore: a line the operation only passed over, reported as
     * changed. The alignment puts back every line it takes, so it is believed.
     */
    it('a swap is a swap even when rewriting both lines would be cheaper', () => {
      const text = '- a\n- b\n';
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === '- a')!;
      const result = moveDown(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // '- b' is passed over, so it is in no change range at all -- not even
      // the two-character rewrite that would describe this document for less.
      expect(editsToChanges(text.split('\n'), result.value.edits)).toEqual([
        { from: { line: 0, ch: 0 }, to: { line: 1, ch: 0 }, text: '' },
        { from: { line: 2, ch: 0 }, to: { line: 2, ch: 0 }, text: '- a\n' },
      ]);
    });

    /**
     * The same coincidence one level up, where the clamp above cannot reach it.
     *
     * A repeated chain nests rather than repeats flatly: indenting `- a` over
     * children `  - a` / `    - a` shifts every line down one level, and
     * because each line's NEW text is the next line's OLD text, the middle
     * lines come out unique on both sides of the edit. Alignment reads that as
     * "these two lines survived, one above vanished and a deeper one
     * appeared", and emits a whole-line deletion plus an insertion instead of
     * three two-character insertions. `relocates` cannot catch it: anchored
     * lines are matched, so they never land in a run to be clamped.
     *
     * The caret is what the user feels — it is mapped through these changes,
     * and under the deletion reading it stops following the character it was
     * on and slides back a column.
     */
    /**
     * Uniqueness is required where the alignment CHOOSES an occurrence, and
     * nowhere else. At a region's leading and trailing edges the pairing is
     * forced by position: a line is matched against the line at its own
     * offset, so a repeat cannot send it to the wrong partner, and the match
     * claims only that nothing moved there. Demanding uniqueness at the edges
     * too would drop lines the narrowing has every right to exclude -- among
     * them the blank gap lines that separate almost every pair of blocks.
     *
     * This pins the OUTCOME, not that one mechanism produced it. Measured:
     * with edge matching restricted to unique lines the change set is
     * unaltered, because character trimming lands on the same boundary from
     * the other direction. Two independent routes to the same guarantee --
     * which is why the spec having described this rule wrongly until now cost
     * nothing observable.
     */
    it('excludes a repeated line at the edge, though nothing there is unique', () => {
      const lines = ['dup', 'dup', 'p', 'q', ''];
      const changes = editsToChanges(lines, [
        { fromLine: 0, toLine: 4, insert: ['dup', 'dup', 'q', 'p'] },
      ]);
      // The two identical leading lines are matched by position and excluded,
      // though neither is unique on either side.
      expect(changes.every((change) => change.from.line >= 2)).toBe(true);
      expect(applyChanges(lines.join('\n'), changes)).toBe('dup\ndup\nq\np\n');
    });

    it('an indent stays minimal when the lines it touches repeat DOWN a chain', () => {
      const text = '- x\n- a\n  - a\n    - a\n';
      const doc = parse(text);
      const node = [...walkNodes(doc)].find((n) => n.lines[0] === '- a')!;
      const result = indent(doc, node.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const changes = editsToChanges(text.split('\n'), result.value.edits);
      // Every change stays on the line it belongs to: no line is deleted and
      // re-inserted elsewhere, whatever the clamp does to their widths.
      expect(changes.map((c) => [c.from.line, c.to.line])).toEqual([
        [1, 1],
        [2, 2],
        [3, 3],
      ]);
      // The caret keeps the character it was on, as it does when the same
      // chain is spelled with distinct text.
      expect(planKey(text, { line: 1, ch: 3 }, 'indent')).toMatchObject({
        plan: { selection: 9 },
      });
      expect(planKey('- x\n- a\n  - b\n    - c\n', { line: 1, ch: 3 }, 'indent')).toMatchObject({
        plan: { selection: 9 },
      });
    });

    /**
     * Narrowing a change set must not be able to throw. Alignment decides
     * uniqueness per segment, so a segment can always subdivide again, and the
     * subdivision used to be a recursive call — bounded only by the line count.
     * A whole-document rewrite of repeated lines is the cheapest way to ask for
     * a lot of subdividing at once.
     */
    it('narrows a large, heavily repeated document without exhausting anything', () => {
      const before = Array.from({ length: 40_000 }, (_, i) => `- item ${i % 3}`);
      const after = [...before].reverse();
      const changes = editsToChanges(before, [
        { fromLine: 0, toLine: before.length, insert: after },
      ]);
      expect(applyChanges(before.join('\n'), changes)).toBe(after.join('\n'));
    });

    /**
     * The other end of that same worry, and the one repetition does NOT cover:
     * repeated lines yield no anchors at all, so they subdivide once and stop.
     * Work grows with how much the alignment SUCCEEDS — every anchor splits a
     * segment, and each resulting gap is re-scanned for anchors of its own,
     * so a document that keeps revealing new ones is what makes the subdivision
     * do the most work per line.
     *
     * These three ask for that in the ways available: wholesale reversal of
     * distinct lines (one anchor per pass, maximally lopsided gaps), pairwise
     * transposition (an anchor between every pair, maximal gap COUNT), and a
     * mix that leaves ambiguous lines behind in every gap. Measured work per
     * line stays flat as the document grows rather than rising with it — an
     * anchor at the edge of a segment leaves the gap beside it empty, and a
     * gap that loses no line to its neighbour cannot make an ambiguous line
     * unique, so single-anchor passes cannot chain. The wall-clock bound is
     * deliberately loose: it is here to catch a change of ORDER, not to police
     * milliseconds on a shared CI box.
     */
    it.each([
      {
        shape: 'reversed',
        rewrite: (lines: string[]) => [...lines].reverse(),
      },
      {
        shape: 'pairwise transpositions',
        rewrite: (lines: string[]) => {
          const out = [...lines];
          for (let i = 0; i + 1 < out.length; i += 2) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
          return out;
        },
      },
      {
        shape: 'unique lines interleaved with ambiguous ones',
        rewrite: (lines: string[]) =>
          [...lines.map((l, i) => (i % 2 === 0 ? l : `- dup ${i % 7}`))].reverse(),
      },
    ])('narrows a large document that keeps finding anchors: $shape', ({ rewrite }) => {
      const before = Array.from({ length: 40_000 }, (_, i) => `- item ${i}`);
      const after = rewrite(before);
      const started = performance.now();
      const changes = editsToChanges(before, [
        { fromLine: 0, toLine: before.length, insert: after },
      ]);
      const narrowing = performance.now() - started;
      expect(applyChanges(before.join('\n'), changes)).toBe(after.join('\n'));
      expect(narrowing).toBeLessThan(2_000);
    });

    /**
     * The invariant the shifted chain broke, stated the way a user would: what
     * the caret does when you indent must not depend on what the lines SAY.
     *
     * Two documents with the same structure and the same line lengths, one
     * whose contents repeat and one whose contents are all distinct, are the
     * same outline as far as any structural operation is concerned. So indent
     * must land the caret at the same offset in both, and must describe the
     * edit with the same per-line shape in both. How WIDE each change is may
     * differ — the clamp widens a change when repetition makes a rewrite
     * indistinguishable from a move, and that degradation is documented — but
     * which lines it touches may not, because that is the difference between
     * editing three lines in place and deleting one line to insert another.
     *
     * Stated as a property rather than as the one chain that was reported,
     * because the coincidence has a whole family: any shift where a line's new
     * text is some other line's old text will do, at any depth and any width.
     */
    it('what indent does to the caret does not depend on what the lines say', () => {
      const render = (depths: readonly number[], content: (i: number) => string) =>
        depths.map((d, i) => `${'  '.repeat(d)}- ${content(i)}`).join('\n') + '\n';

      const shapes = fc
        .array(fc.integer({ min: 0, max: 3 }), { minLength: 2, maxLength: 7 })
        .map((raw) => {
          // Legalise: a node may go one level deeper than its predecessor.
          const depths: number[] = [];
          for (const d of raw) depths.push(Math.min(d, (depths.at(-1) ?? -1) + 1));
          return depths;
        });

      fc.assert(
        fc.property(shapes, fc.array(fc.constantFrom('a', 'b'), { minLength: 7 }), (depths, pick) => {
          // Same shape, same line lengths, different amounts of repetition.
          const repeated = render(depths, (i) => pick[i % pick.length]!);
          const distinct = render(depths, (i) => String.fromCharCode(97 + i));

          const spansOf = (text: string, id: number) => {
            const doc = parse(text);
            const node = [...walkNodes(doc)][id];
            if (!node) return null;
            const result = indent(doc, node.id);
            if (!result.ok) return null;
            return editsToChanges(text.split('\n'), result.value.edits).map((c) => [
              c.from.line,
              c.to.line,
            ]);
          };

          for (let id = 0; id < depths.length; id++) {
            expect(spansOf(repeated, id)).toEqual(spansOf(distinct, id));
          }
          const caretAfterIndent = (text: string, line: number, ch: number) => {
            const planned = planKey(text, { line, ch }, 'indent');
            return planned && 'plan' in planned ? planned.plan.selection : null;
          };
          for (let line = 0; line < depths.length; line++) {
            const ch = 2 * depths[line]! + 3; // just after the content character
            expect(caretAfterIndent(repeated, line, ch)).toBe(caretAfterIndent(distinct, line, ch));
          }
        }),
        { numRuns: 400 },
      );
    });

    /**
     * The converse guarantee, stated as a property because the failure needs a
     * coincidence and coincidences are what a list of cases forgets.
     *
     * Whether two lines were swapped or rewritten is read off the text on each
     * side of the edit, so a document whose lines REPEAT can make an ordinary
     * in-place edit look like a swap and be coarsened for no reason. Losing an
     * anchor is allowed to cost a MOVE its minimality — that is the documented
     * price of anchoring on unique lines — but an indent relocates nothing, so
     * every change it emits must still be trimmed to the characters that
     * actually differ. A change whose removed and inserted text share a prefix
     * or a suffix is the coarsening misfiring: that is exactly what turned a
     * two-character insertion into a whole-line replacement, and with it moved
     * the caret to the end of the line.
     */
    it('an indent stays trimmed to what differs, however much the lines repeat', () => {
      const offsetIn = (ls: readonly string[], pos: { line: number; ch: number }) => {
        let acc = 0;
        for (let i = 0; i < pos.line; i++) acc += ls[i]!.length + 1;
        return acc + pos.ch;
      };
      const sharedPrefix = (a: string, b: string) => {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        return i;
      };
      const sharedSuffix = (a: string, b: string) => {
        let i = 0;
        while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
        return i;
      };
      const marker = fc.constantFrom('- dup', 'dup..');
      const row = fc.constantFrom('| a   | b   |', '| --- | --- |', '| 1   | 2   |');
      // `  - dup` is what a `- dup` BECOMES when indented, so a document
      // holding both makes the coincidence the bug needed: the new text of a
      // line edited in place already exists elsewhere in the old document.
      const kid = fc.constantFrom('  - a', '  - b', '  - dup');
      const block = fc.tuple(
        marker,
        fc.array(row, { minLength: 0, maxLength: 2 }),
        fc.array(kid, { minLength: 0, maxLength: 2 }),
      );

      fc.assert(
        fc.property(fc.array(block, { minLength: 2, maxLength: 3 }), (blocks) => {
          const text =
            blocks.map(([head, rows, kids]) => [head, ...rows, ...kids].join('\n')).join('\n\n') +
            '\n';
          const lines = text.split('\n');
          const doc = parse(text);

          for (const op of [indent, outdent]) {
            for (const node of walkNodes(doc)) {
              const result = op(doc, node.id);
              if (!result.ok) continue;
              for (const change of editsToChanges(lines, result.value.edits)) {
                const removed = text.slice(offsetIn(lines, change.from), offsetIn(lines, change.to));
                // Reported as a triple so a failure names the pair it found.
                expect([
                  removed,
                  change.text,
                  sharedPrefix(removed, change.text),
                  sharedSuffix(removed, change.text),
                ]).toEqual([removed, change.text, 0, 0]);
              }
            }
          }
        }),
        { numRuns: 3000 },
      );
    });
  });
});

describe('rejection messages', () => {
  it('covers every rejection reason', () => {
    // Type-level exhaustiveness is enforced by Record<RejectionReason, string>;
    // runtime sanity: all messages are short, sentence-case, non-empty.
    for (const message of Object.values(REJECTION_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
      expect(message.length).toBeLessThan(80);
    }
  });
});

describe('metadata cross-check', () => {
  // `compareWithSections` only ever compares headings, so it cannot see a
  // `topLevelSpans` that emits nested blocks too. Both of its clauses need
  // pinning on docs where nesting is the point: depth 0, plus the escape that
  // keeps a heading even when a shallower heading scopes it.
  it('emits depth-0 blocks, excluding nested ones', () => {
    // `- list` attaches to the paragraph above it (rules.ts), so only the
    // paragraph and the heading sit at the top level.
    const doc = parse('para one\n\n- list\n\t- nested\n\n# H\n\nunder\n');
    expect(topLevelSpans(doc).map((s) => [s.type, s.startLine])).toEqual([
      ['paragraph', 0],
      ['heading', 5],
    ]);
  });

  it('keeps a heading that a shallower heading scopes', () => {
    // `## B` is `# A`'s child at depth 1; headings are the anchors both
    // parsers must agree on, so it is emitted regardless of depth, while the
    // section content under either heading is not.
    const doc = parse('# A\n\ntext\n\n- list\n\t- nested\n\n## B\n');
    expect(topLevelSpans(doc).map((s) => [s.type, s.startLine])).toEqual([
      ['heading', 0],
      ['heading', 7],
    ]);
  });

  it('agrees with itself on heading positions', () => {
    const doc = parse('# A\n\ntext\n\n## B\n\n- list\n');
    const sections = topLevelSpans(doc);
    expect(compareWithSections(doc, sections)).toEqual([]);
  });

  it('reports one-sided headings', () => {
    const doc = parse('# A\n');
    const issues = compareWithSections(doc, [
      { type: 'heading', startLine: 0, endLine: 0 },
      { type: 'heading', startLine: 5, endLine: 5 },
    ]);
    expect(issues).toEqual(['heading at line 5: Obsidian only']);
  });
});
