import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import {
  clampRange,
  containsNode,
  containsPos,
  containsRange,
  isDirectChild,
  parentOf,
  resolveZoom,
} from '../src/zoom';
import { nodeLabel, stripBlockPrefix } from '../src/node-text';
import { documentLineCount } from '../src/locate';
import { escalateRange, subtreeCoverOf } from '../src/escalate';
import { arbMarkdownText } from './generators';
import type { OutlineNode } from '../src/model';

function walk(nodes: readonly OutlineNode[]): OutlineNode[] {
  return nodes.flatMap((n) => [n, ...walk(n.children)]);
}

const head = (n: OutlineNode): string => n.lines[0] ?? '';

/** Line index of a node's first line, found by scanning the source — an
 * independent second opinion on `resolveZoom`'s own `startLine`, rather than
 * the same computation asserted against itself. */
function lineOf(md: string, needle: string): number {
  const idx = md.split('\n').findIndex((l) => l.includes(needle));
  if (idx < 0) throw new Error(`no line containing ${JSON.stringify(needle)}`);
  return idx;
}

const DOC = `# Top

## Mid

- one
  - nested
- two

Trailing para.
`;

const FRONTMATTER = `---
tag: x
---

# Top

## Mid

text
`;

describe('resolveZoom: what the scope is', () => {
  it('resolves the node at the anchor line, per kind', () => {
    const doc = parse(DOC);
    for (const needle of ['# Top', '## Mid', '- one', '  - nested', 'Trailing para.']) {
      const scope = resolveZoom(doc, lineOf(DOC, needle));
      expect(scope, needle).not.toBeNull();
      expect(head(scope!.root).trim(), needle).toBe(needle.trim());
    }
  });

  it('resolves a gap line to the node it belongs to', () => {
    const doc = parse(DOC);
    // The blank line after `# Top` is that heading's own trailing gap.
    const scope = resolveZoom(doc, lineOf(DOC, '# Top') + 1);
    expect(scope).not.toBeNull();
    expect(head(scope!.root)).toBe('# Top');
  });

  it('returns null in the preamble and for an empty document', () => {
    expect(resolveZoom(parse(FRONTMATTER), 1)).toBeNull();
    expect(resolveZoom(parse(''), 0)).toBeNull();
  });

  it('reports the root start line and depth', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, '  - nested'))!;
    expect(scope.startLine).toBe(lineOf(DOC, '  - nested'));
    expect(scope.depth).toBe(3); // # Top > ## Mid > - one > - nested
  });

  it('gives the trail outermost first, and never the root itself', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, '  - nested'))!;
    expect(scope.trail.map((n) => head(n).trim())).toEqual(['# Top', '## Mid', '- one']);
    expect(scope.trail).not.toContain(scope.root);
  });

  it('gives an empty trail for a top-level root', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, '# Top'))!;
    expect(scope.trail).toEqual([]);
    expect(parentOf(scope)).toBeNull();
  });

  it('names the parent as the destination of one step out', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, '  - nested'))!;
    expect(head(parentOf(scope)!).trim()).toBe('- one');
  });

  it('uses the subtree cover verbatim as the visible range', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, '## Mid'))!;
    expect(scope.cover).toEqual(subtreeCoverOf(doc, scope.root));
  });

  it('hides both sides for a node in the middle', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, '- one'))!;
    expect(scope.hidden).toHaveLength(2);
    expect(scope.hidden[0]!.fromLine).toBe(0);
    expect(scope.hidden[0]!.toLine).toBe(scope.cover.start.line);
    expect(scope.hidden[1]!.fromLine).toBe(scope.cover.end.line + 1);
    expect(scope.hidden[1]!.toLine).toBe(documentLineCount(doc));
  });

  it('hides only below for the document first node', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, '# Top'))!;
    // `# Top` covers the whole document here, so nothing is hidden at all.
    expect(scope.hidden).toEqual([]);
  });

  it('hides only above for the document last node', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, 'Trailing para.'))!;
    expect(scope.hidden).toHaveLength(1);
    expect(scope.hidden[0]!.fromLine).toBe(0);
  });

  it('hides frontmatter along with everything else above', () => {
    const doc = parse(FRONTMATTER);
    const scope = resolveZoom(doc, lineOf(FRONTMATTER, '## Mid'))!;
    expect(scope.hidden[0]!.fromLine).toBe(0);
    expect(scope.hidden[0]!.toLine).toBeGreaterThanOrEqual(3); // past the `---` pair
  });

  it('a childless root is a valid scope', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, '  - nested'))!;
    expect(scope.root.children).toEqual([]);
    expect(scope.document.children).toHaveLength(1);
  });

  it('carries the re-rooted sub-document', () => {
    const doc = parse(DOC);
    const scope = resolveZoom(doc, lineOf(DOC, '## Mid'))!;
    expect(scope.document.preamble).toEqual([]);
    expect(scope.document.children).toHaveLength(1);
    expect(scope.document.children[0]!.id).toBe(scope.root.id);
  });
});

describe('nodeLabel: what a crumb is called', () => {
  it('strips the block syntax that encodes the node place', () => {
    expect(stripBlockPrefix('## Mid')).toBe('Mid');
    expect(stripBlockPrefix('  - [ ] todo')).toBe('todo');
    expect(stripBlockPrefix('> # Quoted heading')).toBe('Quoted heading');
    expect(stripBlockPrefix('12) ordered')).toBe('ordered');
  });

  it('falls back to the kind when nothing survives', () => {
    const doc = parse('# Top\n\n-\n');
    const bare = walk(doc.children).find((n) => n.kind === 'list-item')!;
    expect(nodeLabel(bare)).toBe('List item');
  });

  it('never returns an empty label, for any node in any document', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        for (const node of walk(parse(md).children)) {
          expect(nodeLabel(node).length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('scope predicates', () => {
  const doc = parse(DOC);
  const scope = resolveZoom(doc, lineOf(DOC, '## Mid'))!;

  it('containsPos answers inclusively at both edges', () => {
    expect(containsPos(scope.cover, scope.cover.start)).toBe(true);
    expect(containsPos(scope.cover, scope.cover.end)).toBe(true);
    expect(containsPos(scope.cover, { line: scope.cover.start.line - 1, ch: 0 })).toBe(false);
    expect(containsPos(scope.cover, { line: scope.cover.end.line + 1, ch: 0 })).toBe(false);
  });

  it('containsRange is orientation-independent', () => {
    const a = { line: scope.cover.start.line, ch: 0 };
    const b = { line: scope.cover.end.line, ch: 0 };
    expect(containsRange(scope.cover, { anchor: a, head: b })).toBe(true);
    expect(containsRange(scope.cover, { anchor: b, head: a })).toBe(true);
  });

  it('clampRange preserves orientation while pulling ends in', () => {
    const outsideAbove = { line: 0, ch: 0 };
    const outsideBelow = { line: documentLineCount(doc) - 1, ch: 0 };
    const forward = clampRange(scope.cover, { anchor: outsideAbove, head: outsideBelow });
    expect(forward.anchor).toEqual(scope.cover.start);
    expect(forward.head).toEqual(scope.cover.end);
    const backward = clampRange(scope.cover, { anchor: outsideBelow, head: outsideAbove });
    expect(backward.anchor).toEqual(scope.cover.end);
    expect(backward.head).toEqual(scope.cover.start);
  });

  it('containsNode covers the root and its descendants, and nothing else', () => {
    expect(containsNode(scope, scope.root)).toBe(true);
    const nested = walk(doc.children).find((n) => head(n).includes('nested'))!;
    expect(containsNode(scope, nested)).toBe(true);
    const top = walk(doc.children).find((n) => head(n) === '# Top')!;
    expect(containsNode(scope, top)).toBe(false);
  });

  it('isDirectChild is the outdent-refusal shape, and is not transitive', () => {
    const one = walk(doc.children).find((n) => head(n).includes('- one'))!;
    const nested = walk(doc.children).find((n) => head(n).includes('nested'))!;
    expect(isDirectChild(scope, one)).toBe(true);
    expect(isDirectChild(scope, nested)).toBe(false);
  });
});

describe('scope properties', () => {
  it('the hidden spans and the visible cover partition every line exactly once', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = parse(md);
        const total = documentLineCount(doc);
        for (let line = 0; line < total; line++) {
          const scope = resolveZoom(doc, line);
          if (!scope) continue;
          const covered = new Array<number>(total).fill(0);
          for (const span of scope.hidden) {
            for (let l = span.fromLine; l < span.toLine; l++) covered[l] = (covered[l] ?? 0) + 1;
          }
          for (let l = scope.cover.start.line; l <= scope.cover.end.line; l++) {
            covered[l] = (covered[l] ?? 0) + 1;
          }
          expect(covered.every((c) => c === 1)).toBe(true);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('the visible cover is an exact cover — escalating it is the identity', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = parse(md);
        const total = documentLineCount(doc);
        for (let line = 0; line < total; line++) {
          const scope = resolveZoom(doc, line);
          if (!scope) continue;
          const range = { anchor: scope.cover.start, head: scope.cover.end };
          expect(escalateRange(doc, range)).toEqual(range);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('the trail length equals the root depth', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = parse(md);
        const total = documentLineCount(doc);
        for (let line = 0; line < total; line++) {
          const scope = resolveZoom(doc, line);
          if (!scope) continue;
          expect(scope.trail.length).toBe(scope.depth);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('clamping any cover to the scope yields a cover — D7 own claim', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = parse(md);
        const total = documentLineCount(doc);
        for (let line = 0; line < total; line++) {
          const scope = resolveZoom(doc, line);
          if (!scope) continue;
          for (const node of walk(doc.children)) {
            const other = subtreeCoverOf(doc, node);
            const clamped = clampRange(scope.cover, { anchor: other.start, head: other.end });
            // BOTH halves, or the property is vacuous. Asserting only that the
            // result is an exact cover passes when the clamp does nothing at
            // all, because the input was already a cover — the negative control
            // caught exactly that.
            expect(containsRange(scope.cover, clamped)).toBe(true);
            // A clamp that collapsed the range to a point is a degenerate
            // cover, not a counter-example: escalation is the identity on it
            // for the same reason it is on any exact cover.
            expect(escalateRange(doc, clamped)).toEqual(clamped);
          }
        }
      }),
      { numRuns: 40 },
    );
  });
});
