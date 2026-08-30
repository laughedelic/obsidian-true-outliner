import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { project, isEmptyProjection, type NodePredicate } from '../src/project';
import { collapseLineage, lineageText, type LineageRow } from '../src/lineage';
import { arbMarkdownText } from './generators';
import type { OutlineDoc, OutlineNode } from '../src/model';

/** Every node in a tree, in document order. */
function walk(nodes: readonly OutlineNode[]): OutlineNode[] {
  return nodes.flatMap((n) => [n, ...walk(n.children)]);
}

/** A node's first line, which is how these tests name it. */
const head = (n: OutlineNode): string => n.lines[0] ?? '';

/** Matches nodes whose first line contains `needle`. */
const containing =
  (needle: string): NodePredicate =>
  (n) =>
    head(n).includes(needle);

/** A compact, comparable rendering of a projection, for readable failures. */
function shape(doc: OutlineDoc): string[] {
  const out: string[] = [];
  const go = (nodes: readonly OutlineNode[], depth: number): void => {
    for (const n of nodes) {
      out.push(`${'  '.repeat(depth)}${head(n).trim()}`);
      go(n.children, depth + 1);
    }
  };
  go(doc.children, 0);
  return out;
}

/** The user-supplied branching shape from docs/research/18, D4. */
const BRANCHING = `- a
\t- b
\t\t- x first mention
\t\t- c
\t\t\t- d
\t\t\t\t- x second mention
\t\t- e
\t\t\t- f
\t\t\t\t- g
\t\t\t\t\t- x third mention
`;

describe('project: subset guarantees', () => {
  it('keeps only the paths that reach a match', () => {
    const doc = parse(`# Root

## Kept

- has target here

## Dropped

- nothing of interest
`);
    const out = project(doc, containing('target'), { descendantDepth: 0 });
    expect(shape(out)).toEqual(['# Root', '  ## Kept', '    - has target here']);
  });

  it('keeps every ancestor of a match, in order, still nested', () => {
    const doc = parse(BRANCHING);
    const out = project(doc, containing('first mention'), { descendantDepth: 0 });
    expect(shape(out)).toEqual(['- a', '  - b', '    - x first mention']);
  });

  it('keeps descendants only to the requested depth', () => {
    const doc = parse(`- target
\t- child
\t\t- grandchild
\t\t\t- great-grandchild
`);
    expect(shape(project(doc, containing('target'), { descendantDepth: 0 }))).toEqual(['- target']);
    expect(shape(project(doc, containing('target'), { descendantDepth: 1 }))).toEqual([
      '- target',
      '  - child',
    ]);
    expect(shape(project(doc, containing('target'), { descendantDepth: 2 }))).toEqual([
      '- target',
      '  - child',
      '    - grandchild',
    ]);
  });

  it('carries node content through unmodified', () => {
    const doc = parse(`## Heading

Paragraph mentioning target.
It has a continuation line.

\`\`\`ts
const atom = true;
\`\`\`
`);
    const out = project(doc, containing('target'), { descendantDepth: 0 });
    const source = walk(doc.children).find((n) => head(n).includes('Paragraph mentioning'));
    const projected = walk(out.children).find((n) => head(n).includes('Paragraph mentioning'));
    expect(projected).toBeDefined();
    expect(projected!.kind).toBe(source!.kind);
    expect(projected!.lines).toEqual(source!.lines);
    expect(projected!.trailingGap).toEqual(source!.trailingGap);
    expect(projected!.level).toBe(source!.level);
    expect(projected!.listStyle).toEqual(source!.listStyle);
  });

  it('yields an empty document when nothing matches, without throwing', () => {
    const doc = parse(BRANCHING);
    const out = project(doc, containing('nothing here'), { descendantDepth: 1 });
    expect(isEmptyProjection(out)).toBe(true);
    expect(out.children).toEqual([]);
  });

  it('drops the preamble: frontmatter has no place in the tree', () => {
    const doc = parse(`---
project: "[[target]]"
---

- mentions target
`);
    expect(doc.preamble.length).toBeGreaterThan(0);
    expect(project(doc, containing('target'), { descendantDepth: 0 }).preamble).toEqual([]);
  });
});

describe('project: properties', () => {
  it('is idempotent — re-projecting a projection changes nothing', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = parse(md);
        const all = walk(doc.children);
        if (all.length === 0) return;
        // Match on a real substring of a real node, so the predicate selects
        // something on most inputs rather than trivially nothing.
        const needle = head(all[Math.floor(all.length / 2)]!).trim().slice(0, 4);
        if (!needle) return;
        const once = project(doc, containing(needle), { descendantDepth: 1 });
        const twice = project(once, containing(needle), { descendantDepth: 1 });
        expect(shape(twice)).toEqual(shape(once));
      }),
      { numRuns: 200 },
    );
  });

  it('preserves source document order among surviving nodes', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = parse(md);
        const all = walk(doc.children);
        if (all.length === 0) return;
        const needle = head(all[0]!).trim().slice(0, 3);
        if (!needle) return;
        const out = project(doc, containing(needle), { descendantDepth: 2 });

        const sourceOrder = all.map(head);
        const survivorOrder = walk(out.children).map(head);
        // Every survivor appears in the source, and the relative order matches.
        let cursor = -1;
        for (const text of survivorOrder) {
          const next = sourceOrder.indexOf(text, cursor + 1);
          expect(next).toBeGreaterThan(cursor);
          cursor = next;
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a predicate matching everything reproduces the source tree', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = parse(md);
        const out = project(doc, () => true, { descendantDepth: Number.MAX_SAFE_INTEGER });
        expect(shape(out)).toEqual(shape(doc));
      }),
      { numRuns: 200 },
    );
  });

  it('never synthesises a node: every survivor exists in the source', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = parse(md);
        const all = walk(doc.children);
        if (all.length === 0) return;
        const needle = head(all[0]!).trim().slice(0, 3);
        if (!needle) return;
        const sourceLines = new Set(all.map((n) => n.lines.join('\n')));
        for (const n of walk(project(doc, containing(needle), { descendantDepth: 1 }).children)) {
          expect(sourceLines.has(n.lines.join('\n'))).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});

/** Renders lineage rows the way the design doc writes them, for comparison. */
function render(rows: LineageRow[]): string[] {
  return rows.map((r) =>
    r.type === 'lineage'
      ? `${'  '.repeat(r.depth)}${lineageText(r)
          .map((t) => t.replace(/^[\t -]+/, '').trim())
          .join(' > ')}`
      : `${'  '.repeat(r.depth)}. ${head(r.node).replace(/^[\t -]*/, '').trim()}`,
  );
}

describe('lineage: collapsing', () => {
  it('collapses each sub-branch independently, not only the common prefix', () => {
    // The exact shape and expected output from docs/research/18, D4.
    const doc = parse(BRANCHING);
    const matches = containing('mention');
    const rows = collapseLineage(project(doc, matches, { descendantDepth: 0 }).children, matches);
    expect(render(rows)).toEqual([
      'a > b',
      '  . x first mention',
      '  c > d',
      '    . x second mention',
      '  e > f > g',
      '    . x third mention',
    ]);
  });

  it('absorbs a terminating branch point into the chain', () => {
    const doc = parse(`- outer
\t- branch
\t\t- x one
\t\t- x two
`);
    const matches = containing('x ');
    const rows = collapseLineage(project(doc, matches, { descendantDepth: 0 }).children, matches);
    expect(render(rows)).toEqual(['outer > branch', '  . x one', '  . x two']);
  });

  it('does not absorb a terminating match into the chain', () => {
    const doc = parse(`- outer
\t- inner
\t\t- x only
`);
    const matches = containing('x ');
    const rows = collapseLineage(project(doc, matches, { descendantDepth: 0 }).children, matches);
    expect(render(rows)).toEqual(['outer > inner', '  . x only']);
  });

  it('forms a chain even for a single ancestor', () => {
    const doc = parse(`## Section

- x one
- x two
`);
    const matches = containing('x ');
    const rows = collapseLineage(project(doc, matches, { descendantDepth: 0 }).children, matches);
    expect(rows[0]!.type).toBe('lineage');
    expect(render(rows)).toEqual(['## Section', '  . x one', '  . x two']);
  });

  it('produces no chain for a match with no ancestors', () => {
    const doc = parse(`- x alone
`);
    const matches = containing('x ');
    const rows = collapseLineage(project(doc, matches, { descendantDepth: 0 }).children, matches);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('node');
  });

  it('reports the first element kind and keeps elements addressable', () => {
    const doc = parse(`## Section

- item
\t- x deep
`);
    const matches = containing('x ');
    const rows = collapseLineage(project(doc, matches, { descendantDepth: 0 }).children, matches);
    const chain = rows.find((r) => r.type === 'lineage');
    expect(chain).toBeDefined();
    if (chain?.type !== 'lineage') throw new Error('expected a lineage row');
    expect(chain.kind).toBe('heading');
    expect(chain.elements).toHaveLength(2);
    expect(lineageText(chain)).toEqual(['## Section', '- item']);
  });

  it("renders a match's own descendants as plain nodes, never collapsed", () => {
    const doc = parse(`- outer
\t- x hit
\t\t- child one
\t\t- child two
`);
    const matches = containing('x ');
    const rows = collapseLineage(project(doc, matches, { descendantDepth: 1 }).children, matches);
    expect(render(rows)).toEqual([
      'outer',
      '  . x hit',
      '    . child one',
      '    . child two',
    ]);
  });

  /**
   * The invariant the backlinks footer's guides rest on. A row draws one guide
   * per ancestor row above it, and it computes that set from its own depth
   * alone (`guideDepthsFor` in footer-model.ts) — which is only correct if the
   * emitted rows form a strict preorder with no depth ever skipped. Asserted
   * here, at the function that has to keep it, rather than trusted from a
   * reading of the code.
   */
  it('emits a strict preorder: a row at depth d always has an ancestor row at every shallower depth', () => {
    fc.assert(
      fc.property(arbMarkdownText, (text) => {
        const doc = parse(text);
        const all = walk(doc.children);
        if (all.length === 0) return;
        // A predicate matching a slice of the tree, so chains actually form.
        const matches: NodePredicate = (n) => n.id % 3 === 0;
        const projected = project(doc, matches, { descendantDepth: 1 });
        const rows = collapseLineage(projected.children, matches);

        // The depth of the row most recently seen at each level.
        const open: number[] = [];
        for (const row of rows) {
          expect(row.depth).toBeLessThanOrEqual(open.length);
          open.length = row.depth;
          open.push(row.depth);
        }
      }),
      { numRuns: 200 },
    );
  });
});
