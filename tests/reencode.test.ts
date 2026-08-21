import { describe, expect, it } from 'vitest';
import { shiftSubtree } from '../src/reencode';
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
