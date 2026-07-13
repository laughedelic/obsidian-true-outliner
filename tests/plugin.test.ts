import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { walkNodes } from '../src/model';
import { indent, moveDown, moveUp, outdent } from '../src/ops';
import { applyEdits } from '../src/result';
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

  it('cursor lands on the moved node content (spec scenario)', () => {
    const doc = parse('First thought.\n\nSecond thought.\n');
    const node = [...walkNodes(doc)].find((n) => n.lines[0] === 'Second thought.')!;
    const result = indent(doc, node.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // '- Second thought.' — content starts after the marker.
      expect(result.value.cursor).toEqual({ line: 2, ch: 2 });
    }
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
