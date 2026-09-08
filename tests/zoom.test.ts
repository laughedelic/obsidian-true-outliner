import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import {
  clampRange,
  containsNode,
  containsPos,
  containsRange,
  isDirectChild,
  editEscapes,
  operandEscapes,
  parentOf,
  splitEscapes,
  resolveZoom,
} from '../src/zoom';
import { nodeContent, segmentContent, stripBlockPrefix } from '../src/node-text';
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

describe('segmentContent: what a crumb is called', () => {
  it('strips the block syntax that encodes the node place', () => {
    expect(stripBlockPrefix('## Mid')).toBe('Mid');
    expect(stripBlockPrefix('  - [ ] todo')).toBe('todo');
    expect(stripBlockPrefix('> # Quoted heading')).toBe('Quoted heading');
    expect(stripBlockPrefix('12) ordered')).toBe('ordered');
  });

  it('falls back to the kind when nothing survives', () => {
    const doc = parse('# Top\n\n-\n');
    const bare = walk(doc.children).find((n) => n.kind === 'list-item')!;
    expect(segmentContent(bare).markdown).toBe('List item');
  });

  it('never returns an empty label, for any node in any document', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        for (const node of walk(parse(md).children)) {
          expect(segmentContent(node).markdown.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * A crumb and a footer row of the SAME node say the same thing.
   *
   * The assertion is agreement, not a particular string: what each kind shows
   * is `nodeContent`'s to decide and is asserted there. What this pins is that
   * there is only ONE decision — the trail used to reach its own weaker rule,
   * which is how a callout crumb read `[!tip] Field notes` while the footer row
   * beneath said `Field notes` (docs/research/27).
   */
  it('names a node the way a footer row of that node does', () => {
    const doc = parse(
      [
        '> [!tip] Field notes, **second pass**',
        '> body line',
        '',
        '| owner | **status** |',
        '| --- | --- |',
        '| maya | shipped |',
        '',
        '```js',
        'const severity = 3;',
        '```',
        '',
        '<div>an **html** block</div>',
        '',
      ].join('\n'),
    );

    const kinds = ['callout', 'table', 'code', 'html'] as const;
    for (const kind of kinds) {
      const node = walk(doc.children).find((n) => n.kind === kind);
      expect(node, `no ${kind} node in the fixture`).toBeDefined();
      const crumb = segmentContent(node!);
      const row = nodeContent(node!);
      expect(crumb.markdown, kind).toBe(row.markdown);
      expect(crumb.render, kind).toBe(row.render);
    }
  });

  it('leaves no block syntax in a crumb, whatever the ancestor kind', () => {
    // The three the trail leaked, named as the shapes rather than as strings:
    // a callout token, a table's pipes, a fence.
    const doc = parse(
      ['> [!tip] Field notes', '', '| owner | status |', '| --- | --- |', '', '```js', 'x', '```', ''].join('\n'),
    );
    for (const node of walk(doc.children)) {
      if (!['callout', 'table', 'code'].includes(node.kind)) continue;
      const label = segmentContent(node).markdown;
      expect(label, node.kind).not.toMatch(/^\[!/);
      expect(label, node.kind).not.toContain('|');
      expect(label, node.kind).not.toMatch(/^(?:```|~~~)/);
    }
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

        // An edit strictly INSIDE the visible range: append to one covered
        // line's text. This is the only kind the clamps permit, and the
        // property is that it cannot make the anchor resolve to a DIFFERENT
        // node while looking like the same one.
        const lines = md.split('\n');
        const target = scope.cover.start.line;
        const originalLine = lines[target] ?? '';
        const suffix = insert.replace(/\n/g, '');
        const edited = [...lines];
        edited[target] = originalLine + suffix;
        const after = parse(edited.join('\n'));
        const reresolved = resolveZoom(after, scope.startLine);
        if (reresolved === null || reresolved.startLine !== scope.startLine) return; // exited — always the safe answer

        // `reresolved.startLine === scope.startLine` alone is NOT identity —
        // it is the exact question a node sliding into the root's old line
        // would also answer yes to (review comment on this test: `survived`
        // and `mustExit` were exact complements, so the property never
        // actually checked anything). Identity is asserted independently of
        // that startLine match: the SAME first line's text, with only the
        // appended suffix different — derived from the SOURCE lines directly,
        // not from another call to the function under test.
        //
        // NOT the kind, and NOT the line count: an in-place reclassification
        // (an `hr` losing its hr-ness with nothing above it to merge into, so
        // it becomes a paragraph at the SAME startLine) or a reparse that
        // makes the edited line absorb a FOLLOWING line that used to be a
        // separate node (found by this property: `---` + a table on the next
        // line, appending `!` turns the hr into a paragraph that swallows the
        // table line as plain continuation text) are both legitimate
        // "survived" by this design — the root's OWN first line is untouched
        // by the edit apart from the append, which is what identity means
        // here. The named `hr` test below covers the kind-AND-position-change
        // case that IS an exit; `direct deletion of the root before a
        // sibling`, further below, covers the case where the first line's
        // text does NOT survive the edit at all.
        expect(reresolved.root.lines[0]).toBe(originalLine + suffix);
      }),
      { numRuns: 100 },
    );
  });

  it('direct deletion of the root before a sibling forces an exit, not a retarget onto the sibling', () => {
    // The scenario a review of the property above named directly (`outline-
    // zoom` PR #69, review on this test): deleting the root's WHOLE subtree
    // can leave a SIBLING starting on the exact line the root did. A resolver
    // that only asks "does a node start here" cannot tell that sibling apart
    // from the root having survived — this is that shape, stated at the pure
    // `resolveZoom` layer; `tests/zoom-state-triggers.test.ts` covers the same
    // shape at the CM6 reducer layer that actually guards the running plugin.
    const before = parse('- one\n  - nested\n- two\n');
    const scope = resolveZoom(before, 0)!;
    expect(scope.root.lines[0]).toBe('- one');

    const after = parse('- two\n'); // the root's own two lines, gone
    const reresolved = resolveZoom(after, 0);
    // A node DOES start on line 0 now — `- two` — so a startLine-only check
    // would call this survival. The identity check says otherwise.
    expect(reresolved).not.toBeNull();
    expect(reresolved!.startLine).toBe(0);
    expect(reresolved!.root.lines[0]).not.toBe(scope.root.lines[0]);
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

/**
 * `editEscapes` against the measured catalogue (docs/research/26).
 *
 * Every row here is a row of that note, named by its label there, so a
 * disagreement between the note and the code is visible as a failing test
 * rather than as prose drifting from behaviour.
 */
describe('editEscapes', () => {
  const LIST = '- alpha\n- beta\n  - beta child\n- gamma\n';
  /** The scope for `- beta` in `LIST` — hidden siblings on both sides. */
  const betaScope = () => {
    const doc = parse(LIST);
    const scope = resolveZoom(doc, 1);
    if (!scope) throw new Error('no scope');
    return { doc, scope };
  };

  /** `editEscapes` with the root's own line unmoved and the cover intact —
   * the shape every row but the deletions takes. */
  const judge = (afterText: string, at = { anchorLine: 1, onlyCoverRemoved: false }) => {
    const { doc, scope } = betaScope();
    return editEscapes(doc, scope, parse(afterText), at);
  };

  describe('clause 0 — a whole-subtree deletion is not an escape', () => {
    // D7, and the case an offset rule and an identity rule BOTH get wrong.
    it('allows the deletion when a sibling slides up into the root line (E2)', () => {
      const { doc, scope } = betaScope();
      const after = parse('- alpha\n- gamma\n');
      expect(editEscapes(doc, scope, after, { anchorLine: 1, onlyCoverRemoved: true })).toBe(false);

      // NEGATIVE CONTROL: without clause 0 this refuses, because `- gamma` now
      // occupies the root's line and its subtree swallows text that used to be
      // outside the cover.
      expect(editEscapes(doc, scope, after, { anchorLine: 1, onlyCoverRemoved: false })).toBe(true);
    });

    it('allows the deletion when the root ENDED the document (E2 at the end)', () => {
      const doc = parse('- alpha\n- beta\n  - beta child\n');
      const scope = resolveZoom(doc, 1);
      if (!scope) throw new Error('no scope');
      const after = parse('- alpha\n');
      expect(editEscapes(doc, scope, after, { anchorLine: 1, onlyCoverRemoved: true })).toBe(false);

      // NEGATIVE CONTROL, and a DIFFERENT failure from the row above: here the
      // trailing blank line is owned by `- alpha`, so it is the identity clause
      // that refuses. One row alone would not show that clause 0 is load-bearing
      // for both reasons.
      expect(editEscapes(doc, scope, after, { anchorLine: 1, onlyCoverRemoved: false })).toBe(true);
    });
  });

  it('clause 0 does not excuse a transaction that took hidden content too', () => {
    // The multi-range shape: one range removes the root's cover, another takes
    // a hidden sibling. `onlyCoverRemoved` is false, so clause 0 steps aside
    // and the remaining clauses see the escape. Were it keyed on the cover
    // alone, nothing would ever look at the hidden deletion.
    const { doc, scope } = betaScope();
    const after = parse('- gamma\n'); // `- alpha` went with it
    expect(editEscapes(doc, scope, after, { anchorLine: 0, onlyCoverRemoved: false })).toBe(true);
    // NEGATIVE CONTROL: keyed on the cover alone, this is waved through.
    expect(editEscapes(doc, scope, after, { anchorLine: 0, onlyCoverRemoved: true })).toBe(false);
  });

  describe('clause 1 — the root must still be the root', () => {
    it('refuses an unwrap that re-parents the children (R4)', () => {
      // `- beta` emptied then unwrapped: `  - beta child` inherits the line,
      // under `- alpha`. Nothing outside the cover changed, so only identity
      // catches this.
      expect(judge('- alpha\n  - beta child\n- gamma\n')).toBe(true);
    });

    it('refuses when the root line is emptied (R7)', () => {
      // Nothing begins on line 1 now; the blank line is owned by `- alpha`.
      // Refused either way a resolver could read it — as a differing position
      // under ownership, or as no root at all under "begins here" — so this
      // covers the row without resting on which reading is used.
      expect(judge('- alpha\n\n  - beta child\n- gamma\n')).toBe(true);
    });
  });

  describe('clause 2 — nothing outside the subtree may change', () => {
    it('refuses a merge that absorbs the hidden next sibling (B1)', () => {
      // One line break removed, and a whole hidden node disappears into the
      // subtree. The changed range is a single character; the size of the
      // removal is not the question.
      expect(judge('- alpha\n- beta\n  - beta childgamma\n')).toBe(true);
    });

    it('refuses a merge into the hidden previous sibling (X4)', () => {
      expect(judge('- alphabeta\n  - beta child\n- gamma\n', {
        anchorLine: 0,
        onlyCoverRemoved: false,
      })).toBe(true);
    });

    it('refuses a blank line inserted above a FIRST-node root', () => {
      // The empty-slice trap. Zoomed to the document's first node there is no
      // text above the cover at all, so the before-side slice is `[]`; a blank
      // line inserted above makes the after-side `['']`. Both render as the
      // empty string when joined, and the root keeps its path either way, so a
      // joined comparison reports "nothing outside changed" about a change that
      // added a preamble line outside the subtree.
      const doc = parse(LIST);
      const scope = resolveZoom(doc, 0);
      if (!scope) throw new Error('no scope');
      const after = parse('\n- alpha\n- beta\n  - beta child\n- gamma\n');
      expect(editEscapes(doc, scope, after, { anchorLine: 1, onlyCoverRemoved: false })).toBe(true);
    });

    it('refuses a paste spliced beside the root (G1)', () => {
      // Every hidden BYTE is untouched — `- alpha` and `- gamma` are exactly
      // as they were — and the paste still lands outside the subtree.
      expect(judge('- alpha\n- beta\n  - beta child\n- p\n  - q\n- gamma\n')).toBe(true);
    });
  });

  describe('the allowed side', () => {
    it('allows an appended last child (X2)', () => {
      expect(judge('- alpha\n- beta\n  - beta child\n  - \n- gamma\n')).toBe(false);
    });

    it('allows typing into the root (X5)', () => {
      expect(judge('- alpha\n- betaX\n  - beta child\n- gamma\n')).toBe(false);
    });

    it('allows an in-scope merge between two visible nodes (A5)', () => {
      expect(judge('- alpha\n- betabeta child\n- gamma\n')).toBe(false);
    });

    it('allows deleting the cover’s own trailing gap line (R6)', () => {
      const doc = parse('# One\n\npara one\n\n## Two\n\npara two\n\n## Three\n\npara three\n');
      const scope = resolveZoom(doc, 4);
      if (!scope) throw new Error('no scope');
      const after = parse('# One\n\npara one\n\n## Two\n\npara two\n## Three\n\npara three\n');
      expect(editEscapes(doc, scope, after, { anchorLine: 4, onlyCoverRemoved: false })).toBe(false);
    });

    it('allows an append when the cover ends on a trailing gap (X1)', () => {
      const doc = parse('# One\n\npara one\n\n## Two\n\npara two\n\n## Three\n\npara three\n');
      const scope = resolveZoom(doc, 4);
      if (!scope) throw new Error('no scope');
      const after = parse('# One\n\npara one\n\n## Two\n\npara two\n\n\n\n## Three\n\npara three\n');
      expect(editEscapes(doc, scope, after, { anchorLine: 4, onlyCoverRemoved: false })).toBe(false);
    });
  });

  describe('no offset shortcut stands in front of the invariant (D5)', () => {
    it('refuses a top-level heading spliced STRICTLY inside the cover', () => {
      // The reachable counter-example to the rejected gate: every changed
      // position lies between the cover's endpoints, no hidden byte moves, and
      // the pasted `# H1` still ends `## Two`'s section — so `para two` and
      // everything after leave the root's subtree.
      const doc = parse('# One\n\n## Two\n\npara two\n\nmore\n\n## Three\n');
      const scope = resolveZoom(doc, 2);
      if (!scope) throw new Error('no scope');
      const after = parse('# One\n\n## Two\n\npara two\n\n# H1\n\nmore\n\n## Three\n');
      expect(editEscapes(doc, scope, after, { anchorLine: 2, onlyCoverRemoved: false })).toBe(true);
    });
  });
});
