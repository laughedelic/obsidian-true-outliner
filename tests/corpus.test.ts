import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual } from '../src/model';

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
