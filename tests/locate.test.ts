import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encodeLines } from '../src/encode';
import { ownSpan, walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { forEachNodeWithLine, nodeAtLine, nodeStartLine } from '../src/locate';
import { arbMarkdownText, arbTree } from './generators';

interface Visited {
  node: OutlineNode;
  startLine: number;
  depth: number;
}

/** The whole walk as an array — convenient for assertions, and deliberately
 * not part of the module: the keystroke-path callers short-circuit instead
 * (see `forEachNodeWithLine`'s own note on why it is a callback). */
function visitAll(doc: OutlineDoc): Visited[] {
  const out: Visited[] = [];
  forEachNodeWithLine(doc, (node, startLine, depth) => {
    out.push({ node, startLine, depth });
  });
  return out;
}

/**
 * `forEachNodeWithLine` is the one line-geometry traversal, and four modules
 * were each carrying a private copy of it before. Copies drift silently — a
 * wrong `preamble.length` seed or a forgotten `trailingGap` shows up only as a
 * misplaced caret in a note nobody tested. These are the invariants that hold
 * the shared version to the layout `encodeLines` actually emits, rather than
 * to a second description of it.
 */
describe('forEachNodeWithLine', () => {
  it('visits every node exactly once, in document order', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        expect(visitAll(doc).map((entry) => entry.node)).toEqual([...walkNodes(doc)]);
      }),
    );
  });

  it('reports the line where the node actually starts in the encoded output', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        const lines = encodeLines(doc);
        for (const { node, startLine } of visitAll(doc)) {
          expect(lines.slice(startLine, startLine + node.lines.length)).toEqual([...node.lines]);
        }
      }),
    );
  });

  it('tiles the document: spans are gapless and cover every non-preamble line', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        let expected = doc.preamble.length;
        for (const { node, startLine } of visitAll(doc)) {
          expect(startLine).toBe(expected);
          expected += ownSpan(node);
        }
        expect(expected).toBe(encodeLines(doc).length);
      }),
    );
  });

  it('depth counts ancestors', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        // The map has to be COMPLETE before any of it is asserted against.
        // Building it while walking reads naturally and proves nothing: the
        // traversal is pre-order, so a child is never in the map yet when its
        // parent is visited, and a `?? depth + 1` fallback then supplies
        // exactly the value under test.
        const visited = visitAll(doc);
        const depthOf = new Map(visited.map(({ node, depth }) => [node.id, depth]));
        expect(depthOf.size).toBe(visited.length);
        for (const node of doc.children) expect(depthOf.get(node.id)).toBe(0);
        for (const { node, depth } of visited) {
          for (const child of node.children) expect(depthOf.get(child.id)).toBe(depth + 1);
        }
      }),
    );
  });

  it('stops early when visit returns false', () => {
    const doc = parse('# H\n\npara\n\n- a\n\t- b\n');
    const seen: string[] = [];
    forEachNodeWithLine(doc, (node) => {
      seen.push(node.lines[0] ?? '');
      return seen.length < 2 ? undefined : false;
    });
    expect(seen).toHaveLength(2);
    expect([...walkNodes(doc)].length).toBeGreaterThan(2);
  });
});

describe('nodeStartLine / nodeAtLine', () => {
  it('round-trip: every node is found at its own start line', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        for (const node of walkNodes(doc)) {
          const start = nodeStartLine(doc, node.id);
          expect(start).toBeGreaterThanOrEqual(doc.preamble.length);
          expect(nodeAtLine(doc, start)).toBe(node);
        }
      }),
    );
  });

  it('resolves an absent id to -1, not to a plausible line', () => {
    const doc = parse('# H\n\npara\n');
    expect(nodeStartLine(doc, 999_999)).toBe(-1);
  });

  it('every line resolves to the node owning it — gap lines to their owner', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        const owner = new Map<number, OutlineNode>();
        for (const { node, startLine } of visitAll(doc)) {
          for (let i = 0; i < ownSpan(node); i++) owner.set(startLine + i, node);
        }
        for (const [line, node] of owner) expect(nodeAtLine(doc, line)).toBe(node);
      }),
    );
  });

  it('the inert preamble owns no node, and neither does a line past the end', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        for (let line = 0; line < doc.preamble.length; line++) {
          expect(nodeAtLine(doc, line)).toBeUndefined();
        }
        expect(nodeAtLine(doc, encodeLines(doc).length)).toBeUndefined();
      }),
    );
  });

  it('holds on parsed real text, not only generated trees', () => {
    fc.assert(
      fc.property(arbMarkdownText, (text) => {
        const doc = parse(text);
        const lines = encodeLines(doc);
        for (let line = doc.preamble.length; line < lines.length; line++) {
          const node = nodeAtLine(doc, line);
          expect(node).toBeDefined();
          const start = nodeStartLine(doc, node!.id);
          expect(line).toBeGreaterThanOrEqual(start);
          expect(line).toBeLessThan(start + ownSpan(node!));
        }
      }),
    );
  });
});

/** The layout claim the whole module rests on, stated once against a doc with
 * frontmatter — the shape a wrong `preamble.length` seed gets wrong. */
it('a preamble offsets every node position', () => {
  const doc = parse('---\ntitle: t\n---\n\n# H\n\nbody\n');
  expect(doc.preamble.length).toBeGreaterThan(0);
  const first = [...walkNodes(doc)][0]!;
  expect(nodeStartLine(doc, first.id)).toBe(doc.preamble.length);
  expect(nodeAtLine(doc, doc.preamble.length - 1)).toBeUndefined();
});
