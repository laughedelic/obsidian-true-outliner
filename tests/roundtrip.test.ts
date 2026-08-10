import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual } from '../src/model';
import { arbMarkdownText, arbTree } from './generators';

describe('byte-identity round-trip: encode(parse(md)) === md', () => {
  it('holds on hand-picked structures', () => {
    const samples = [
      '',
      'just a paragraph',
      'para one\n\npara two\n',
      '# H\n\ntext\n\n- a\n  - b\n- c\n',
      '---\ntitle: x\n---\n\n# After frontmatter\n',
      'Clothes notes.\n\n- shirts\n- socks\n\nAnother thought.\n',
      '# Log\n\n### Monday\n\nNotes.\n',
      '- item\n\n  ```js\n  code();\n  ```\n\n- next\n',
      'Setext\n===\n\nAlso setext\n---\n',
      '> [!note] hi\n> body\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
      'weird  trailing  \n\t\n   half indent\n',
    ];
    for (const md of samples) {
      expect(encode(parse(md)), JSON.stringify(md)).toBe(md);
    }
  });

  it('holds on adversarial generated markdown', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => encode(parse(md)) === md),
      { numRuns: 2000 },
    );
  });
});

describe('tree identity: parse(encode(tree)) equals tree', () => {
  it('holds on generated valid trees', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        const reparsed = parse(encode(doc));
        return treesEqual(doc, reparsed);
      }),
      { numRuns: 500 },
    );
  });
});

/**
 * `document-tree-mapping`'s "A list item's own lines, and what its children may
 * be". The rule has been in `parse.ts` since the beginning and was never
 * written down, which is why two of the Enter/Shift+Enter catalogue's findings
 * read as surprises. These pin it at the spec's level.
 */
describe('a list item: own lines vs children', () => {
  it('one blank line decides between a continuation line and a paragraph child', () => {
    const continuation = parse('- item\n  more text\n');
    expect(continuation.children.length).toBe(1);
    expect(continuation.children[0]!.lines).toEqual(['- item', '  more text']);
    expect(continuation.children[0]!.children).toEqual([]);

    const child = parse('- item\n\n  more text\n');
    expect(child.children.length).toBe(1);
    expect(child.children[0]!.lines).toEqual(['- item']);
    expect(child.children[0]!.children.map((n) => [n.kind, n.lines[0]])).toEqual([
      ['paragraph', '  more text'],
    ]);
  });

  it('an indented atom is a child either way — a block start is never a continuation line', () => {
    for (const md of ['- item\n\t```\n\tcode\n\t```\n', '- item\n\n\t```\n\tcode\n\t```\n']) {
      const doc = parse(md);
      expect(doc.children[0]!.lines).toEqual(['- item']);
      expect(doc.children[0]!.children.map((n) => n.kind)).toEqual(['code']);
    }
  });

  it("children are not restricted to list items", () => {
    const doc = parse('- item\n\n\tpara\n\t- sub\n');
    expect(doc.children[0]!.children.map((n) => n.kind)).toEqual(['paragraph', 'list-item']);
  });

  it('less indentation closes the item', () => {
    const doc = parse('- item\n\nnot a child\n');
    expect(doc.children.map((n) => n.kind)).toEqual(['list-item', 'paragraph']);
    expect(doc.children[0]!.children).toEqual([]);
  });

  it('both readings round-trip byte-identically', () => {
    for (const md of ['- item\n  more text\n', '- item\n\n  more text\n']) {
      expect(encode(parse(md))).toBe(md);
    }
  });
});
