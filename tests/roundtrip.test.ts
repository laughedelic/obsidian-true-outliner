import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual, walkNodes, type OutlineNode } from '../src/model';
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

describe('a block start inside a list item is measured from the item', () => {
  /** Every node, depth-first, as `kind: first line`, with its parent's first line. */
  const shape = (md: string): string[] => {
    const out: string[] = [];
    const walk = (nodes: readonly OutlineNode[], parent: string): void => {
      for (const n of nodes) {
        out.push(`${n.kind}: ${JSON.stringify(n.lines[0])} < ${parent}`);
        walk(n.children, JSON.stringify(n.lines[0]));
      }
    };
    walk(parse(md).children, 'root');
    return out;
  };
  const kindOf = (md: string, line: string): string | undefined =>
    [...walkNodes(parse(md))].find((n) => n.lines[0] === line)?.kind;

  it("#136: a quote at the item's child column is a quote, however it is indented", () => {
    // Negative control: measuring `QUOTE_RE` from column 0 again reads the
    // tab and four-space cases as paragraphs, which is what `main` did.
    for (const indent of ['  ', '\t', '    ']) {
      const md = `- alpha\n\n${indent}> quote child\n`;
      expect(shape(md)).toEqual([
        'list-item: "- alpha" < root',
        `quote: ${JSON.stringify(`${indent}> quote child`)} < "- alpha"`,
      ]);
      expect(encode(parse(md))).toBe(md);
    }
  });

  it('#136: a heading under an item stays measured from column 0', () => {
    expect(shape('- alpha\n\n\t# heading child\n')).toEqual([
      'list-item: "- alpha" < root',
      'paragraph: "\\t# heading child" < "- alpha"',
    ]);
  });

  it('a quote, a callout and a rule at a depth-2 child column keep their kind', () => {
    // Negative control: measuring from column 0 reads every one of these as a
    // paragraph (with a blank), a continuation of `  - two` or a list item
    // (without). A `***` directly under the marker line is left out: the
    // item's continuation loop claims it at any column, which is #197.
    const openers: [string, string, readonly string[]][] = [
      ['> q', 'quote', ['\n', '']],
      ['> [!note] c', 'callout', ['\n', '']],
      ['***', 'hr', ['\n']],
      ['- - -', 'hr', ['\n', '']],
    ];
    for (const [opener, kind, gaps] of openers) {
      for (const gap of gaps) {
        const line = `    ${opener}`;
        const md = `- one\n  - two\n${gap}${line}\n`;
        expect(shape(md)).toEqual([
          'list-item: "- one" < root',
          'list-item: "  - two" < "- one"',
          `${kind}: ${JSON.stringify(line)} < "  - two"`,
        ]);
        expect(encode(parse(md))).toBe(md);
        // Four columns past the item's content column it opens nothing.
        const deep = `- one\n  - two\n\n        ${opener}\n`;
        expect(kindOf(deep, `        ${opener}`)).toBe(opener === '- - -' ? 'list-item' : 'paragraph');
      }
    }
  });

  it("a quote's run ends at a line indented short of its margin", () => {
    // Negative control: without the indentation check in the run, `> r`
    // joins the item's quote.
    expect(shape('- a\n  - b\n\n    > q\n> r\n')).toEqual([
      'list-item: "- a" < root',
      'list-item: "  - b" < "- a"',
      'quote: "    > q" < "  - b"',
      'quote: "> r" < root',
    ]);
  });

  it('a setext heading closes the margin, as an ATX heading does', () => {
    // Negative control: clearing the stack for an ATX heading only leaves
    // `- a`'s margin open under `para`, and reads the last line as a quote.
    expect(shape('- a\n\n  para\n  ---\n    > q\n')).toEqual([
      'list-item: "- a" < root',
      'heading: "  para" < root',
      'paragraph: "    > q" < "  para"',
    ]);
  });

  it('an HTML block is measured from column 0, so an inline tag opening a child paragraph is text', () => {
    // Negative control: giving `HTML_OPEN_RE` the margin reads the first as an
    // HTML block that takes `\t- c` into its lines, and the second as one that
    // runs past `  - b` and takes the sibling `  - c`.
    expect(shape('- a\n\n\t<b>Note</b> text\n\t- c\n')).toEqual([
      'list-item: "- a" < root',
      'paragraph: "\\t<b>Note</b> text" < "- a"',
      'list-item: "\\t- c" < "- a"',
    ]);
    expect(shape('- a\n  - b\n\n    <div>\n  - c\n')).toEqual([
      'list-item: "- a" < root',
      'list-item: "  - b" < "- a"',
      'paragraph: "    <div>" < "  - b"',
      'list-item: "  - c" < "- a"',
    ]);
  });

  it('only spaces and tabs are indentation', () => {
    // Negative control: taking the lead with `trimStart`, which also strips a
    // non-breaking space, reads the line as a quote.
    expect(kindOf('- a\n\n  \u00a0 > q\n', '  \u00a0 > q')).toBe('paragraph');
  });
});
