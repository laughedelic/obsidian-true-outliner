/**
 * The fold model: what folds, where a fold begins and ends, how much it hides,
 * and which node a gesture on a line belongs to.
 *
 * Line geometry is the whole subject here, so every fixture is written with its
 * lines numbered in the assertion rather than described in prose.
 */

import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import {
  ancestryAtLine,
  entryAtLine,
  foldLines,
  foldTargetAtLine,
  foldableEntries,
  hiddenDescendantCount,
  isFoldable,
  subtreeSpan,
} from '../src/plugin/fold-model';

/*  0 | # Top
    1 |
    2 | Paragraph with children:
    3 |
    4 | - one
    5 |   - nested a
    6 |   - nested b
    7 | - two
    8 |
    9 | ## Second
   10 |
   11 | Tail para.
   12 |                                                                        */
const DOC = [
  '# Top',
  '',
  'Paragraph with children:',
  '',
  '- one',
  '  - nested a',
  '  - nested b',
  '- two',
  '',
  '## Second',
  '',
  'Tail para.',
  '',
].join('\n');

const doc = parse(DOC);

/** `<kind> "<first line>" @<startLine>` for readable failures. */
const show = (
  e: {
    node: { kind: string; lines: readonly string[] };
    startLine: number;
  } | null,
) => (e === null ? 'none' : `${e.node.kind} ${JSON.stringify(e.node.lines[0])} @${e.startLine}`);

describe('what is foldable', () => {
  it('is exactly the nodes with children', () => {
    expect(foldableEntries(doc).map(show)).toEqual([
      'heading "# Top" @0',
      'paragraph "Paragraph with children:" @2',
      'list-item "- one" @4',
      'heading "## Second" @9',
    ]);
  });

  it('never reports an atom, because an atom is never a parent', () => {
    const atoms = parse(
      [
        '| a | b |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '- after the table',
        '  - nested under the list, not the table',
        '',
        '```js',
        'code',
        '```',
        '',
        '- after the fence',
        '',
        '> a quote',
        '',
        '- after the quote',
        '',
      ].join('\n'),
    );
    for (const node of atoms.children) {
      if (node.kind === 'table' || node.kind === 'code' || node.kind === 'quote') {
        expect(isFoldable(node), `${node.kind} must hold no children`).toBe(false);
      }
    }
    expect(foldableEntries(atoms).map(show)).toEqual(['list-item "- after the table" @4']);
  });

  it('counts every hidden descendant, not just the children', () => {
    const [top, para, one] = foldableEntries(doc);
    // Top hides everything under it: the paragraph, its two list items, the two
    // nested items, and the second heading with its paragraph.
    expect(hiddenDescendantCount(top!.node)).toBe(7);
    expect(hiddenDescendantCount(para!.node)).toBe(4);
    expect(hiddenDescendantCount(one!.node)).toBe(2);
  });
});

describe('a fold’s extent', () => {
  it('runs from the node’s own last line to the last CONTENT line', () => {
    const lines: Record<string, ReturnType<typeof foldLines>> = {};
    for (const e of foldableEntries(doc))
      lines[e.node.lines[0] ?? ''] = foldLines(e.node, e.startLine);
    expect(lines).toEqual({
      // Hides the paragraph through "- two" — line 8 is blank and stays.
      '# Top': { headLine: 0, lastLine: 11 },
      'Paragraph with children:': { headLine: 2, lastLine: 7 },
      '- one': { headLine: 4, lastLine: 6 },
      '## Second': { headLine: 9, lastLine: 11 },
    });
  });

  it('leaves a trailing gap visible', () => {
    /*  0 | - parent
        1 |   - child
        2 |
        3 | - sibling                                                          */
    const gapped = parse(['- parent', '  - child', '', '- sibling', ''].join('\n'));
    const parent = gapped.children[0]!;
    // NOT lastLine 2: the blank line separating the two siblings is what shows
    // they are separate, and hiding it moves the sibling up when the parent
    // folds. The negative control for this test is returning the gap-inclusive
    // subtree cover instead, which reports 2 here.
    expect(foldLines(parent, 0)).toEqual({ headLine: 0, lastLine: 1 });
  });

  it('starts after ALL of a multi-line node’s own lines', () => {
    /*  0 | A paragraph
        1 | wrapped over two source lines:
        2 |
        3 | - child                                                            */
    const wrapped = parse(
      ['A paragraph', 'wrapped over two source lines:', '', '- child', ''].join('\n'),
    );
    const para = wrapped.children[0]!;
    expect(para.lines).toHaveLength(2);
    expect(foldLines(para, 0)).toEqual({ headLine: 1, lastLine: 3 });
  });

  it('has none for a node without children', () => {
    const leaf = parse('Just a paragraph.\n').children[0]!;
    expect(foldLines(leaf, 0)).toBeNull();
  });

  it('spans the whole subtree including gaps, which is a different question', () => {
    // `subtreeSpan` answers "how many lines does this occupy", gaps included —
    // the geometry `ancestryAtLine` walks with. `foldLines` answers "what does a
    // fold hide". Asserting both here so a change to one cannot quietly become
    // a change to the other.
    expect(subtreeSpan(doc.children[0]!)).toBe(13);
  });
});

describe('which node a line’s fold gesture belongs to', () => {
  it('escalates from a leaf to the nearest ancestor with children', () => {
    // Line 5 is "  - nested a", a childless list item under "- one".
    expect(show(foldTargetAtLine(doc, 5))).toBe('list-item "- one" @4');
    expect(show(entryAtLine(doc, 5))).toBe('list-item "  - nested a" @5');
  });

  it('resolves a foldable line to itself', () => {
    expect(show(foldTargetAtLine(doc, 4))).toBe('list-item "- one" @4');
    expect(show(foldTargetAtLine(doc, 2))).toBe('paragraph "Paragraph with children:" @2');
  });

  it('reports the whole ancestry, outermost first', () => {
    expect(ancestryAtLine(doc, 6).map(show)).toEqual([
      'heading "# Top" @0',
      'paragraph "Paragraph with children:" @2',
      'list-item "- one" @4',
      'list-item "  - nested b" @6',
    ]);
  });

  it('escalates past a childless top-level node to nothing', () => {
    const flat = parse(['Alone.', '', 'Also alone.', ''].join('\n'));
    expect(foldTargetAtLine(flat, 2)).toBeNull();
  });

  it('resolves a gap line to the node that owns it', () => {
    // Line 8 is the blank after "- two", owned by "- two" itself.
    expect(show(entryAtLine(doc, 8))).toBe('list-item "- two" @7');
    expect(show(foldTargetAtLine(doc, 8))).toBe('paragraph "Paragraph with children:" @2');
  });

  it('resolves preamble lines to nothing', () => {
    const withFrontmatter = parse(
      ['---', 'title: x', '---', '', '# Heading', '', '- child', ''].join('\n'),
    );
    expect(ancestryAtLine(withFrontmatter, 1)).toEqual([]);
    expect(show(foldTargetAtLine(withFrontmatter, 6))).toBe('heading "# Heading" @4');
  });
});
