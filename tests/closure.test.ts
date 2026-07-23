import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual, walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { indent, outdent, moveDown, moveUp } from '../src/ops';
import { applyEdits } from '../src/result';
import { arbTree } from './generators';

const OPS = { indent, outdent, moveUp, moveDown } as const;
type OpName = keyof typeof OPS;

const arbOp: fc.Arbitrary<OpName> = fc.constantFrom('indent', 'outdent', 'moveUp', 'moveDown');

const KNOWN_REASONS = new Set([
  'node-not-found',
  'at-h1-bound',
  'at-h6-bound',
  'no-previous-sibling',
  'at-top-level',
  'no-sibling-above',
  'no-sibling-below',
  'not-expressible-under-target',
  'cannot-reorder-across-heading-boundary',
]);

/** Pick the nth node (document order) — deterministic target selection. */
function nthNode(doc: OutlineDoc, n: number): OutlineNode | undefined {
  const all = [...walkNodes(doc)];
  return all.length === 0 ? undefined : all[n % all.length];
}

describe('5.1 op closure over the mapping', () => {
  it('accepted results re-parse to the same tree; edits reproduce the encoding', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), arbOp, (doc, n, opName) => {
        const target = nthNode(doc, n);
        if (!target) return true;
        const source = encode(doc);
        const result = OPS[opName](doc, target.id);
        if (!result.ok) {
          return KNOWN_REASONS.has(result.rejection.reason);
        }
        const text = encode(result.value.doc);
        // Closure: the result tree IS the parse of its own encoding.
        if (!treesEqual(result.value.doc, parse(text))) return false;
        // Edits applied to the source reproduce the encoding exactly.
        const viaEdits = applyEdits(source === '' ? [] : source.split('\n'), result.value.edits);
        return viaEdits.join('\n') === text;
      }),
      { numRuns: 1500 },
    );
  });
});

describe('5.2 minimal edits', () => {
  it('nodes outside the moved subtree keep their lines verbatim', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), arbOp, (doc, n, opName) => {
        const target = nthNode(doc, n);
        if (!target) return true;
        const result = OPS[opName](doc, target.id);
        if (!result.ok) return true;

        const touched = new Set<number>();
        const markSubtree = (node: OutlineNode): void => {
          touched.add(node.id);
          node.children.forEach(markSubtree);
        };
        markSubtree(target);

        // Every untouched node's verbatim line block must appear intact in
        // the result. (Generator is bullets-only, so the ordered-renumber
        // exception never fires here.)
        const before = [...walkNodes(doc)]
          .filter((node) => !touched.has(node.id))
          .map((node) => node.lines.join('\n'));
        const afterText = encode(result.value.doc);
        return before.every((block) => afterText.includes(block));
      }),
      { numRuns: 1500 },
    );
  });
});

describe('5.3 inverse laws', () => {
  it('heading indent∘outdent is identity away from the bounds', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        const source = encode(doc);
        for (const node of walkNodes(doc)) {
          if (node.kind !== 'heading') continue;
          const indented = indent(doc, node.id);
          if (!indented.ok) continue; // at the h6 bound
          // Locate the demoted heading by text + expected level; skip when
          // duplicate texts make the relocation ambiguous.
          const text = (node.lines[0] ?? '').replace(/^#+\s*/, '');
          const candidates = [...walkNodes(indented.value.doc)].filter(
            (m) =>
              m.kind === 'heading' &&
              m.level === (node.level ?? 1) + 1 &&
              (m.lines[0] ?? '').replace(/^#+\s*/, '') === text,
          );
          if (candidates.length !== 1) continue;
          const restored = outdent(indented.value.doc, candidates[0]!.id);
          if (!restored.ok) return false;
          if (encode(restored.value.doc) !== source) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('top-level paragraph indent∘outdent restores the document byte-identically', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        const source = encode(doc);
        for (let i = 1; i < doc.children.length; i++) {
          const node = doc.children[i]!;
          const prev = doc.children[i - 1]!;
          if (node.kind !== 'paragraph' || prev.kind !== 'paragraph') continue;
          // Skip ambiguous duplicates — relocation is done by text.
          const text = (node.lines[0] ?? '').trim();
          const indented = indent(doc, node.id);
          if (!indented.ok) return false; // must be accepted: prev is a paragraph
          const moved = [...walkNodes(indented.value.doc)].filter(
            (m) => (m.lines[0] ?? '').replace(/^[-\s]*/, '').trim() === text,
          );
          if (moved.length !== 1) continue;
          const restored = outdent(indented.value.doc, moved[0]!.id);
          if (!restored.ok) return false;
          if (encode(restored.value.doc) !== source) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('pure nested-list documents never flatten on outdent', () => {
    const nested = parse('- a\n\t- b\n\t\t- c\n\t- d\n- e\n\t- f\n');
    for (const node of [...walkNodes(nested)]) {
      const result = outdent(nested, node.id);
      if (!result.ok) continue;
      for (const out of walkNodes(result.value.doc)) {
        expect(out.kind, `node "${out.lines[0]}" after outdenting "${node.lines[0]}"`).toBe(
          'list-item',
        );
      }
    }
  });

  it('outdent with following siblings still closes (parse(encode(surgery)) round-trips)', () => {
    // docs/research/04-open-questions.md Q17: outdenting a node with
    // following siblings under the same parent used to drop them instead of
    // re-parenting them — regression coverage for closure on that path.
    const doc = parse('- p\n\t- x\n\t- y\n\t- z\n');
    const x = [...walkNodes(doc)].find((n) => n.lines[0] === '\t- x')!;
    const result = outdent(doc, x.id);
    if (!result.ok) throw new Error(`unexpected rejection: ${result.rejection.reason}`);
    const text = encode(result.value.doc);
    expect(treesEqual(result.value.doc, parse(text))).toBe(true);
    const viaEdits = applyEdits(encode(doc).split('\n'), result.value.edits).join('\n');
    expect(viaEdits).toBe(text);
    expect(text).toBe('- p\n- x\n\t- y\n\t- z\n');
  });
});

describe('5.4 rejections are total and typed', () => {
  it('every op on every node either closes or rejects with a known reason — never throws', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        for (const node of walkNodes(doc)) {
          for (const opName of Object.keys(OPS) as OpName[]) {
            const result = OPS[opName](doc, node.id);
            if (!result.ok && !KNOWN_REASONS.has(result.rejection.reason)) return false;
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('a rejected op returns no edits and the input doc is unchanged', () => {
    const md = '###### Tiny\n';
    const doc = parse(md);
    const before = encode(doc);
    const result = indent(doc, [...walkNodes(doc)][0]!.id);
    expect(result.ok).toBe(false);
    expect(encode(doc)).toBe(before);
  });
});
