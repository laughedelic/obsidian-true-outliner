import { describe, expect, it } from 'vitest';
import { markerWidth, normalizeMarkerRun, reencodeForDestination, shiftSubtree } from '../src/reencode';
import { indentWidth, parse } from '../src/parse';
import { walkNodes, type OutlineNode } from '../src/model';

/** A one-line list item carrying `ws` as its leading whitespace. */
function itemWith(ws: string): OutlineNode {
  const line = `${ws}- x`;
  for (const node of walkNodes(parse(`${line}\n`))) {
    if (node.lines[0] === line) return node;
  }
  throw new Error(`no node for ${JSON.stringify(ws)}`);
}

// Every shape that mixes tabs and spaces, against every dedent that could
// land inside or past it. The invariant is the whole point of the dedent:
// the line ends up at the column asked for, whatever characters express it.
describe('shiftSubtree: a dedent lands on the column it was asked for', () => {
  const SHAPES = ['', ' ', '  ', '    ', '\t', '\t\t', ' \t', '\t ', '  \t', ' \t\t', '\t \t', '      '];

  it('every whitespace shape, every delta', () => {
    for (const ws of SHAPES) {
      const node = itemWith(ws);
      const start = indentWidth(node.lines[0]!);
      for (let delta = -10; delta <= 6; delta++) {
        const shifted = shiftSubtree(node, delta);
        expect({ ws, delta, width: indentWidth(shifted.lines[0]!) }).toEqual({
          ws,
          delta,
          width: Math.max(0, start + delta),
        });
        // The content itself is carried, never trimmed or re-marked.
        expect(shifted.lines[0]!.trimStart()).toBe('- x');
      }
    }
  });

  it('a tab-indented line keeps its tabs where they still fit', () => {
    // Two tabs dedented by one column: eight columns to seven, which is one
    // whole tab plus three spaces. Counting a flat four per tab produced
    // `   \t`, four columns — the line moved the wrong way, by four.
    const shifted = shiftSubtree(itemWith('\t\t'), -1);
    expect(shifted.lines[0]).toBe('\t   - x');
  });

  it('a tab preceded by a space is four columns, not five', () => {
    // ` \t` is a tab starting at column 1, so it still runs to the stop at 4.
    // Dropping the space leaves a tab that re-expands from zero — unmoved.
    expect(shiftSubtree(itemWith(' \t'), -1).lines[0]).toBe('   - x');
  });
});

describe('a list item\'s content column counts the whole whitespace run after its marker (list-marker-content-column)', () => {
  // Obsidian's reader and CommonMark both put `-  a`'s content at column 3. A
  // child written at column 2 is a sibling to them, and once Obsidian pops its
  // list stack, deeper descendants after a blank line turn into an indented
  // code block — the raw dashes and checkboxes reported from real-vault use
  // (docs/research/list-marker-content-column).
  it('two spaces after the marker: a child at two columns is a sibling, at three a child', () => {
    const siblings = parse('-  a\n  - b\n');
    expect(siblings.children.map((n) => n.lines[0])).toEqual(['-  a', '  - b']);
    const nested = parse('-  a\n   - b\n');
    expect(nested.children).toHaveLength(1);
    expect(nested.children[0]!.children[0]!.lines[0]).toBe('   - b');
  });

  it('a continuation line is measured against the same column', () => {
    // Two columns of indentation no longer continue `-  a`; three do.
    expect(parse('-  a\n  text\n').children).toHaveLength(2);
    expect(parse('-  a\n   text\n').children[0]!.lines).toEqual(['-  a', '   text']);
  });

  it('a tab after the marker advances to the next tab stop', () => {
    // `-` sits at column 0, the tab reaches column 4.
    expect(parse('-\ta\n   - b\n').children).toHaveLength(2);
    expect(parse('-\ta\n    - b\n').children[0]!.children).toHaveLength(1);
  });

  it('a marker alone on its line keeps the one-space column', () => {
    const doc = parse('-\n  - b\n');
    expect(doc.children[0]!.children).toHaveLength(1);
    expect(markerWidth(doc.children[0]!)).toBe(2);
  });

  it('a marker followed by whitespace only is alone on its line too', () => {
    // Trailing spaces are not a run the item's text begins after; counting them
    // widened an empty item's column and made its child a sibling.
    for (const first of ['- ', '-  ', '1.   ', '-\t']) {
      const width = first.trimEnd().length + 1;
      const doc = parse(`${first}\n${' '.repeat(width)}- b\n`);
      expect(doc.children, first).toHaveLength(1);
      expect(doc.children[0]!.children, first).toHaveLength(1);
      expect(markerWidth(doc.children[0]!), first).toBe(width);
    }
  });

  it('markerWidth agrees with the parser, whatever the run after the marker', () => {
    const width = (line: string): number => markerWidth(parse(line + '\n').children[0]!);
    expect(width('- a')).toBe(2);
    expect(width('-  a')).toBe(3);
    expect(width('1.  a')).toBe(4);
    expect(width('  -   a')).toBe(4); // indentation is not part of the width
  });

  it('a moved list item\'s marker run is rewritten to one space, and its subtree follows the column', () => {
    const doc = parse('-  a\n   b\n   - c\n');
    const moved = reencodeForDestination(doc.children[0]!, undefined, '  ');
    expect(moved.lines).toEqual(['  - a', '    b']);
    expect(moved.children[0]!.lines).toEqual(['    - c']);
    expect(markerWidth(moved)).toBe(2);
  });

  it('a one-space item is rewritten byte-for-byte but for its indentation', () => {
    const doc = parse('- a\n  b\n  - c\n');
    const moved = reencodeForDestination(doc.children[0]!, undefined, '  ');
    expect(moved.lines).toEqual(['  - a', '    b']);
    expect(moved.children[0]!.lines).toEqual(['    - c']);
  });

  it('a tab after the marker is rewritten to one space too', () => {
    const doc = parse('-\ta\n    - c\n');
    const moved = reencodeForDestination(doc.children[0]!, undefined, '');
    expect(moved.lines).toEqual(['- a']);
    expect(moved.children[0]!.lines).toEqual(['  - c']);
  });

  it('a list item turned paragraph sheds the whole run, not one space of it', () => {
    const doc = parse('-  a\n');
    const asParagraph = reencodeForDestination(doc.children[0]!, 'paragraph', '');
    expect(asParagraph.lines).toEqual(['a']);
  });
});

describe('normalizeMarkerRun', () => {
  it('collapses any run that is not exactly one space', () => {
    expect(normalizeMarkerRun('-  a')).toBe('- a');
    expect(normalizeMarkerRun('1.   a')).toBe('1. a');
    expect(normalizeMarkerRun('  -\ta')).toBe('  - a');
    expect(normalizeMarkerRun('- \ta')).toBe('- a');
  });

  it('leaves a one-space run, a bare marker, and a non-list line alone', () => {
    expect(normalizeMarkerRun('- a')).toBe('- a');
    expect(normalizeMarkerRun('-')).toBe('-');
    expect(normalizeMarkerRun('  text')).toBe('  text');
    expect(normalizeMarkerRun('##  Two')).toBe('##  Two');
  });

  it('touches the marker\'s run only, never a task marker\'s', () => {
    expect(normalizeMarkerRun('-  [ ]  bar')).toBe('- [ ]  bar');
  });
});

describe('reencodeForDestination changes characters, never columns (#154)', () => {
  // Every line below the first lands where a shift of the whole subtree by the
  // width delta puts it, and a line that does not open with the node's own
  // indentation is written exactly as that shift writes it.
  const firsts = ['- a', '-  a', '-\ta', '1. a', '\t- a', '  - a', '    -\ta', ' \t- a'];
  const belows = ['  b', '   b', '\tb', '  \tb', '\t  b', '    b', '\t\tb', ' \t  b', ' \t\t  b', ''];
  const targets = ['', '\t', '  ', '    ', '\t\t', '\t  ', '   '];

  it.each(targets)('into %j', (indentText) => {
    for (const first of firsts) {
      for (const below of belows) {
        const md = `${first}\n${below}\n`;
        const node = parse(md).children[0]!;
        const out = reencodeForDestination(node, undefined, indentText);
        const normalized = normalizeMarkerRun(first);
        const shift =
          indentWidth(indentText) - indentWidth(first) + markerWidth({ ...node, lines: [normalized] }) - markerWidth(node);
        const expected = shiftSubtree(node, shift);
        const pairs = [...walkNodes({ children: [out] } as never)].flatMap((n: OutlineNode) => n.lines.slice(1));
        const wants = [...walkNodes({ children: [expected] } as never)].flatMap((n: OutlineNode) => n.lines.slice(1));
        const prefix = /^[ \t]*/.exec(first)![0];
        pairs.forEach((line, i) => {
          const want = wants[i]!;
          expect(indentWidth(line), JSON.stringify({ first, below, indentText })).toBe(indentWidth(want));
          expect(line.trimStart()).toBe(want.trimStart());
          // No swap puts a space in front of a tab that had none: every such
          // pair in the result is one the combined shift also writes.
          const pairs = (s: string) => (/^[ \t]*/.exec(s)![0].match(/ \t/g) ?? []).length;
          expect(pairs(line), JSON.stringify({ first, below, indentText })).toBeLessThanOrEqual(
            Math.max(pairs(want), pairs(below)),
          );
          if (!/^[ \t]*/.exec(below)![0].startsWith(prefix) || below === '') {
            expect(line, JSON.stringify({ first, below, indentText })).toBe(want);
          }
        });
      }
    }
  });
});

describe('the prefix swap never puts a space in front of a tab that had none', () => {
  it('where the destination meets a tab the source prefix ended against', () => {
    // ` \t` + `\t  b` swapped to `    ` + `\t  b` would leave the second tab
    // behind spaces where a tab stood before it.
    const node = parse(' \t- a\n \t\t  b\n').children[0]!;
    const out = reencodeForDestination(node, undefined, '    ');
    expect(out.lines).toEqual(['    - a', ' \t\t  b']);
  });

  it('a pair inside the destination string is the first line’s too, so the other lines take it', () => {
    // Refusing ` \t` on the continuation would write `      b`: the node's own
    // lines in two indentations again.
    const node = parse('- a\n  b\n').children[0]!;
    expect(reencodeForDestination(node, undefined, ' \t').lines).toEqual([' \t- a', ' \t  b']);
    const moved = parse(' \t - a\n \t   b\n').children[0]!;
    expect(reencodeForDestination(moved, undefined, '  \t').lines).toEqual(['  \t- a', '  \t  b']);
  });

  it('a pair the rest of the line already carried is kept as it was', () => {
    const node = parse('- a\n  \t  b\n').children[0]!;
    const out = reencodeForDestination(node, undefined, '\t');
    expect(out.lines).toEqual(['\t- a', '\t  \t  b']);
  });
});
