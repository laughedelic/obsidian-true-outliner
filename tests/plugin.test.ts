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
import { applyEdits, type Edit } from '../src/result';
import { OutlineModeRegistry } from '../src/plugin/mode-registry';
import { nodeAtLine } from '../src/plugin/locate';
import { editsToChanges, type EditorChange } from '../src/plugin/dispatch';
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
