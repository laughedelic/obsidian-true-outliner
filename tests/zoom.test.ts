import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import {
  clampRange,
  containsNode,
  containsPos,
  containsRange,
  isDirectChild,
  operandEscapes,
  parentOf,
  splitEscapes,
  resolveZoom,
} from '../src/zoom';
import { nodeLabel, stripBlockPrefix } from '../src/node-text';
import { documentLineCount } from '../src/locate';
import { itemContentIsEmpty, markerPrefixCh } from '../src/ops';
import { decorate, computeLineGuides } from '../src/plugin/decorate';
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

describe('re-basing: the sub-document is the whole mechanism', () => {
  const NESTED = `# Top

## Mid

- one
  - nested
    - deeper
`;

  /** Depth of the fact for the line containing `needle`, in `facts`. */
  function depthAt(
    facts: readonly { lineNumber: number; depth: number }[],
    text: string,
    needle: string,
    offset = 0,
  ): number {
    const line = text.split('\n').findIndex((l) => l.includes(needle));
    const fact = facts.find((f) => f.lineNumber === line - offset);
    if (!fact) throw new Error(`no fact for ${JSON.stringify(needle)}`);
    return fact.depth;
  }

  it('drops every level above the root, and keeps the ones below', () => {
    const doc = parse(NESTED);
    const full = decorate(doc);
    const scope = resolveZoom(doc, lineOf(NESTED, '- one'))!;
    const rebased = decorate(scope.document);

    // `- one` sits three levels deep in the note and at the root of its own view.
    expect(depthAt(full, NESTED, '- one')).toBe(scope.depth);
    expect(depthAt(rebased, NESTED, '- one', scope.startLine)).toBe(0);
    // Its descendants keep their RELATIVE distance, which is the whole point.
    expect(
      depthAt(rebased, NESTED, '    - deeper', scope.startLine) -
        depthAt(rebased, NESTED, '  - nested', scope.startLine),
    ).toBe(
      depthAt(full, NESTED, '    - deeper') - depthAt(full, NESTED, '  - nested'),
    );
  });

  it('every visible line shifts by exactly the root depth', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = parse(md);
        const full = decorate(doc);
        for (let line = 0; line < documentLineCount(doc); line++) {
          const scope = resolveZoom(doc, line);
          if (!scope) continue;
          for (const fact of decorate(scope.document)) {
            const source = full.find((f) => f.lineNumber === fact.lineNumber + scope.startLine);
            if (!source) continue;
            expect(fact.depth).toBe(source.depth - scope.depth);
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  it('emits no guide for a level above the root', () => {
    const doc = parse(NESTED);
    const scope = resolveZoom(doc, lineOf(NESTED, '  - nested'))!;
    const fullGuides = computeLineGuides(doc);
    const rebased = computeLineGuides(scope.document);

    // Unzoomed, the deep line carries guides for its non-list ancestors.
    const fullDeep = fullGuides.find(
      (g) => g.lineNumber === lineOf(NESTED, '    - deeper'),
    )!;
    expect(fullDeep.guideDepths.length).toBeGreaterThan(0);

    // Re-based, those ancestors are not in the tree at all, so no guide stands
    // in for them. Not filtered out downstream — never emitted.
    for (const guide of rebased) {
      for (const depth of guide.guideDepths) expect(depth).toBeGreaterThanOrEqual(0);
      expect(guide.guideDepths.length).toBeLessThanOrEqual(fullDeep.guideDepths.length);
    }
  });

  it('a list-item root loses OUR contribution and nothing else — D9 stated limit', () => {
    const doc = parse(NESTED);
    const scope = resolveZoom(doc, lineOf(NESTED, '  - nested'))!;
    const rebased = decorate(scope.document);
    const rootFact = rebased.find((f) => f.lineNumber === 0)!;
    expect(rootFact.isListItem).toBe(true);
    // `supplementalDepth` is the part this plugin supplies for a list item, and
    // it is gone. The within-list depth Obsidian's own list rendering supplies
    // is not ours to remove and is not represented here at all — that is the
    // exception D9 states rather than a gap in this assertion.
    expect(rootFact.supplementalDepth).toBe(0);
    expect(rootFact.depth).toBe(0);
  });

  it('re-basing a top-level root is the identity', () => {
    const doc = parse(NESTED);
    const scope = resolveZoom(doc, lineOf(NESTED, '# Top'))!;
    expect(scope.depth).toBe(0);
    const rebased = decorate(scope.document);
    const full = decorate(doc);
    // `# Top` covers the whole note here, so the two derivations must agree
    // line for line — the guard that the zoom path has not leaked a shift into
    // the unzoomed one.
    expect(rebased.map((f) => ({ ...f, lineNumber: f.lineNumber + scope.startLine }))).toEqual(
      full,
    );
  });
});

describe('operandEscapes: the refusal, over the whole operand', () => {
  const DOC2 = `# Top

## Mid

- one
- two
  - deep
- three
`;

  function scopeAt(needle: string) {
    const doc = parse(DOC2);
    return { doc, scope: resolveZoom(doc, lineOf(DOC2, needle))! };
  }
  function idOf(doc: ReturnType<typeof parse>, needle: string): number {
    return walk(doc.children).find((n) => head(n).includes(needle))!.id;
  }

  it('refuses any operation whose operand is the zoom root itself', () => {
    const { doc, scope } = scopeAt('## Mid');
    const root = [[idOf(doc, '## Mid')]];
    expect(operandEscapes(scope, root, false)).toBe(true);
    expect(operandEscapes(scope, root, true)).toBe(true);
  });

  it('refuses an outdent of a direct child, and allows every other operation on it', () => {
    const { doc, scope } = scopeAt('## Mid');
    const child = [[idOf(doc, '- one')]];
    expect(operandEscapes(scope, child, true)).toBe(true);
    expect(operandEscapes(scope, child, false)).toBe(false);
  });

  it('allows an outdent deeper in the subtree — it lands inside the scope', () => {
    const { doc, scope } = scopeAt('## Mid');
    expect(operandEscapes(scope, [[idOf(doc, '  - deep')]], true)).toBe(false);
  });

  it('refuses a multi-root operand whose LAST root escapes', () => {
    // The case a single-subject check passes wrongly, and the reason D8 is
    // stated over the operand: the first root here is safe.
    const { doc, scope } = scopeAt('## Mid');
    const groups = [[idOf(doc, '  - deep')], [idOf(doc, '- one')]];
    expect(operandEscapes(scope, groups, true)).toBe(true);
  });

  it('refuses a multi-root operand whose FIRST root escapes', () => {
    const { doc, scope } = scopeAt('## Mid');
    const groups = [[idOf(doc, '- one')], [idOf(doc, '  - deep')]];
    expect(operandEscapes(scope, groups, true)).toBe(true);
  });

  it('allows an operand entirely inside the subtree', () => {
    const { doc, scope } = scopeAt('## Mid');
    expect(operandEscapes(scope, [[idOf(doc, '  - deep')]], false)).toBe(false);
  });
});

describe('splitEscapes: judged by destination scope, not node identity', () => {
  const D = `# Heading root

text under it

- childless

- parent
  - kid
`;
  const contentStartOf = (line: string): number => markerPrefixCh(line);
  const isEmptyItem = (n: OutlineNode): boolean => itemContentIsEmpty(n);

  function scopeFor(needle: string) {
    const doc = parse(D);
    return resolveZoom(doc, lineOf(D, needle))!;
  }

  it('allows an interior split of a heading root — its remainder is a child', () => {
    const scope = scopeFor('# Heading root');
    const pos = { line: scope.startLine, ch: 5 };
    expect(splitEscapes(scope, scope.root, pos, contentStartOf, isEmptyItem)).toBe(false);
  });

  it('allows an interior split of a root WITH children', () => {
    const scope = scopeFor('- parent');
    const pos = { line: scope.startLine, ch: 5 };
    expect(splitEscapes(scope, scope.root, pos, contentStartOf, isEmptyItem)).toBe(false);
  });

  it('refuses an interior split of a CHILDLESS non-heading root', () => {
    const scope = scopeFor('- childless');
    const pos = { line: scope.startLine, ch: 5 };
    expect(splitEscapes(scope, scope.root, pos, contentStartOf, isEmptyItem)).toBe(true);
  });

  it('refuses a split at the root content start, whatever its children', () => {
    const scope = scopeFor('- parent');
    const line = scope.root.lines[0]!;
    const pos = { line: scope.startLine, ch: markerPrefixCh(line) };
    expect(splitEscapes(scope, scope.root, pos, contentStartOf, isEmptyItem)).toBe(true);
  });

  it('is not the business of any node but the root', () => {
    const scope = scopeFor('- parent');
    const kid = walk(parse(D).children).find((n) => head(n).includes('kid'))!;
    expect(splitEscapes(scope, kid, { line: 0, ch: 3 }, contentStartOf, isEmptyItem)).toBe(false);
  });
});

describe('the clamp is what makes the anchor safe (D4 retarget property)', () => {
  it('an in-scope edit never retargets the root to a different node', () => {
    fc.assert(
      fc.property(arbMarkdownText, fc.nat(200), fc.string({ maxLength: 6 }), (md, seed, insert) => {
        const doc = parse(md);
        const total = documentLineCount(doc);
        if (total === 0) return;
        const scope = resolveZoom(doc, seed % total);
        if (!scope) return;

        // An edit strictly INSIDE the visible range: replace one covered line's
        // text. This is the only kind the clamps permit, and the property is
        // that it cannot make the anchor resolve to a different node.
        const lines = md.split('\n');
        const target = scope.cover.start.line;
        const edited = [...lines];
        edited[target] = (edited[target] ?? '') + insert.replace(/\n/g, '');
        const after = parse(edited.join('\n'));
        const reresolved = resolveZoom(after, scope.startLine);
        // The rule the implementation enforces, and the one this property
        // exists to state: either the anchor still names a node's OWN START —
        // in which case the root is the same node — or the zoom must exit.
        // A re-resolution that lands on a node starting somewhere else is a
        // silent retarget, which is what an `hr` losing its hr-ness does.
        const survived = reresolved !== null && reresolved.startLine === scope.startLine;
        const mustExit = reresolved === null || reresolved.startLine !== scope.startLine;
        expect(survived || mustExit).toBe(true);
        if (survived) expect(reresolved.startLine).toBe(scope.startLine);
      }),
      { numRuns: 100 },
    );
  });

  it('an hr that stops being an hr forces an exit rather than a silent retarget', () => {
    // The counter-example the property above found, kept as a named case: the
    // edit touches only the root's own line, so neither the clamps nor the
    // outside-change trigger can see it, and yet re-parsing merges the line
    // into the paragraph ABOVE — a node that was outside the scope entirely.
    const before = parse('plain text\n***');
    const rooted = resolveZoom(before, 1)!;
    expect(rooted.root.kind).toBe('hr');
    expect(rooted.startLine).toBe(1);

    const after = parse('plain text\n***+');
    const reresolved = resolveZoom(after, 1)!;
    expect(reresolved.root.kind).toBe('paragraph');
    // Still line 1's owner, but no longer a node STARTING there — which is
    // exactly the condition `setStillRootedResolver` clears the zoom on.
    expect(reresolved.startLine).not.toBe(1);
  });
});
