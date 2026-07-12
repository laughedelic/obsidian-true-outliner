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
