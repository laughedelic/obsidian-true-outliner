import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual, walkNodes } from '../src/model';
import type { OutlineNode } from '../src/model';

const corpusDir = join(__dirname, 'corpus');
const fixtures = readdirSync(corpusDir).filter((f) => f.endsWith('.md'));

describe('corpus round-trip', () => {
  it.each(fixtures)('%s: encode(parse(md)) === md', (name) => {
    const md = readFileSync(join(corpusDir, name), 'utf8');
    expect(encode(parse(md))).toBe(md);
  });

  it.each(fixtures)('%s: parse is idempotent through encode', (name) => {
    const md = readFileSync(join(corpusDir, name), 'utf8');
    const tree = parse(md);
    expect(treesEqual(tree, parse(encode(tree)))).toBe(true);
  });
});

describe('test-vault round-trip (realistic notes are corpus too)', () => {
  const vaultDir = join(__dirname, '..', 'test-vault');
  const vaultNotes: string[] = [];
  const collect = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) collect(join(dir, entry.name));
      else if (entry.name.endsWith('.md')) vaultNotes.push(join(dir, entry.name));
    }
  };
  collect(vaultDir);

  it.each(vaultNotes.map((p) => [p.slice(vaultDir.length + 1)] as const))(
    '%s round-trips byte-identically',
    (rel) => {
      const md = readFileSync(join(vaultDir, rel), 'utf8');
      expect(encode(parse(md))).toBe(md);
      expect(treesEqual(parse(md), parse(encode(parse(md))))).toBe(true);
    },
  );
});

describe('a marker needs whitespace after it to be a marker', () => {
  // `marker-without-trailing-space`: the mode Live Preview runs gates every
  // list token on a marker followed by whitespace, and a marker at end of line
  // never satisfies it. We read the line the way the surface being edited
  // does, so the space is what declares the intent to make an item.
  const kinds = (md: string) => [...walkNodes(parse(md))].map((n) => n.kind);

  it('reads a marker with nothing after it as a paragraph', () => {
    expect(kinds('-\n')).toEqual(['paragraph']);
    expect(kinds('*\n')).toEqual(['paragraph']);
    expect(kinds('1.\n')).toEqual(['paragraph']);
  });

  it('reads one space, or a tab, as the whole difference', () => {
    expect(kinds('- \n')).toEqual(['list-item']);
    expect(kinds('-\t\n')).toEqual(['list-item']);
    expect(kinds('-  \n')).toEqual(['list-item']);
    expect(kinds('- x\n')).toEqual(['list-item']);
  });

  it('keeps a dash that starts ordinary text as ordinary text', () => {
    // The shape the rule exists for: nothing jumps into list structure on a
    // character that is still ambiguous.
    expect(kinds('-42 is negative\n')).toEqual(['paragraph']);
    expect(kinds('-4\n')).toEqual(['paragraph']);
  });

  it('makes a bare marker and the line under it ONE paragraph', () => {
    const nodes = [...walkNodes(parse('-\ntext\n'))];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.lines).toEqual(['-', 'text']);
  });

  it('ends a list at a bare marker, and attaches what follows to it', () => {
    // `kinds` alone cannot see this: the paragraph CLOSES the list, and the
    // items below it become its children under the list-after-paragraph rule
    // (`rules.ts`). One level in, under a paragraph's block marker, which is
    // the feedback that says the shape is unfinished — and typing the space
    // puts the single list back.
    const doc = parse('- a\n- b\n-\n- c\n- d\n');
    const shape = (n: OutlineNode): unknown => ({
      kind: n.kind,
      line: n.lines[0],
      children: n.children.map(shape),
    });
    expect(doc.children.map(shape)).toEqual([
      { kind: 'list-item', line: '- a', children: [] },
      { kind: 'list-item', line: '- b', children: [] },
      {
        kind: 'paragraph',
        line: '-',
        children: [
          { kind: 'list-item', line: '- c', children: [] },
          { kind: 'list-item', line: '- d', children: [] },
        ],
      },
    ]);
    // The space restores one flat list of five.
    expect(kinds('- a\n- b\n- \n- c\n- d\n')).toEqual(Array(5).fill('list-item'));
  });

  it('attaches only where the list stack can empty', () => {
    // The rule that adopts them runs at SECTION level, so the same three lines
    // inside a subtree leave the items below as the paragraph's siblings.
    const doc = parse('- a\n  - b\n  -\n  - c\n');
    expect(doc.children[0]!.children.map((n) => [n.kind, n.lines[0]])).toEqual([
      ['list-item', '  - b'],
      ['paragraph', '  -'],
      ['list-item', '  - c'],
    ]);
  });

  it("leaves an item's continuation line reading exactly a dash as its text", () => {
    const nodes = [...walkNodes(parse('- a\n  -\n'))];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.lines).toEqual(['- a', '  -']);
  });

  it('round-trips every one of those shapes byte for byte', () => {
    for (const md of [
      '-\n',
      '1.\n',
      '- \n',
      '-42 is negative\n',
      '-\ntext\n',
      '- a\n-\n- b\n',
      '- a\n  -\n',
    ]) {
      expect(encode(parse(md))).toBe(md);
    }
  });
});

describe('corpus structure spot checks', () => {
  it('03-mixed: attachment rule and heading scoping', () => {
    const md = readFileSync(join(corpusDir, '03-mixed.md'), 'utf8');
    const doc = parse(md);
    expect(doc.preamble.length).toBeGreaterThan(0);
    const trip = doc.children[0]!;
    expect(trip.kind).toBe('heading');
    const packing = trip.children.find((n) => n.lines[0] === '## Packing')!;
    const clothes = packing.children[0]!;
    expect(clothes.kind).toBe('paragraph');
    // shirts/socks attach to the paragraph, not the heading
    expect(clothes.children.map((n) => n.lines[0])).toEqual(['- shirts', '- socks']);
    // column-0 paragraph closes the group
    expect(packing.children[1]!.lines[0]).toBe('Another packing thought.');
    const electronics = packing.children[2]!;
    expect(electronics.level).toBe(3);
    // list directly under a heading = heading's children
    expect(electronics.children[0]!.lines[0]).toBe('- chargers');
    expect(electronics.children[0]!.children[0]!.lines[0]).toBe('  - USB-C');
  });

  it('05-edge-zoo: skips preserved, setext parsed, atoms atomic', () => {
    const md = readFileSync(join(corpusDir, '05-edge-zoo.md'), 'utf8');
    const doc = parse(md);
    const h3 = doc.children[0]!;
    expect(h3.level).toBe(3);
    // Setext One is an h1 — it CLOSES the h3 section and lands at root.
    const setextOne = doc.children[1]!;
    expect(setextOne.kind).toBe('heading');
    expect(setextOne.level).toBe(1);
    expect(setextOne.setext).toBe(true);
    const setextTwo = setextOne.children.find((n) => n.kind === 'heading')!;
    expect(setextTwo.level).toBe(2);
    // h6 nests directly under the setext h2 — a preserved level skip.
    const h6 = setextTwo.children.find((n) => n.level === 6)!;
    expect(h6.lines[0]).toBe('###### h6 directly under h3');
  });

  it('06-code-heavy: fences are single atoms, indented fence is item child', () => {
    const md = readFileSync(join(corpusDir, '06-code-heavy.md'), 'utf8');
    const doc = parse(md);
    const heading = doc.children[0]!;
    const fence = heading.children.find((n) => n.kind === 'code')!;
    expect(fence.lines.length).toBe(7); // whole fence incl. blank interior line
    const itemWithCode = heading.children.find((n) => n.lines[0] === '- item with code child')!;
    expect(itemWithCode.children[0]!.kind).toBe('code');
  });
});
