import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Text } from '@codemirror/state';
import { hiddenOffsetRanges } from '../src/plugin/zoom-offsets';
import { parse } from '../src/parse';
import { resolveZoom } from '../src/zoom';
import { documentLineCount } from '../src/locate';
import { arbMarkdownText } from './generators';

const DOC = `# Top

## Mid

- one
  - nested
- two

Trailing para.
`;

function lineOf(text: string, needle: string): number {
  const idx = text.split('\n').findIndex((l) => l.includes(needle));
  if (idx < 0) throw new Error(`no line containing ${JSON.stringify(needle)}`);
  return idx;
}

/**
 * The lines a set of block replacements leaves rendered.
 *
 * Stated over LINES, not characters, because a block replacement covers whole
 * lines: the line break beside a range is consumed as the block's own boundary
 * rather than left behind as an empty line. A character-level splice would be
 * describing the text instead of the render — the ranges stop one position
 * short of the line they keep at each end, so both breaks survive a splice.
 *
 * The two edges read differently because their decorations do
 * (`zoom-decorations.ts`): the head's start is INCLUSIVE and sits on a line it
 * removes, so containment is the whole test; the tail's is NON-inclusive and
 * sits on a line it keeps, so a line goes only if it begins strictly after that
 * position. `80-outline-zoom` measures the render this models, at both edges and
 * with a widget atom on the far side of the tail.
 */
function visibleLines(doc: Text, ranges: { from: number; to: number }[]): string[] {
  const out: string[] = [];
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const hidden = ranges.some((r) =>
      r.from === 0 ? line.to <= r.to : line.from > r.from && line.to <= r.to,
    );
    if (!hidden) out.push(line.text);
  }
  return out;
}

describe('hiddenOffsetRanges: the boundary arithmetic', () => {
  it('hides both sides of a mid-document root, leaving exactly its own lines', () => {
    const doc = Text.of(DOC.split('\n'));
    const scope = resolveZoom(parse(DOC), lineOf(DOC, '- one'))!;
    const ranges = hiddenOffsetRanges(doc, scope);
    expect(ranges).toHaveLength(2);
    // `- one` owns its nested child; `- two` and the trailing paragraph do not
    // belong to it, and neither does anything above.
    expect(visibleLines(doc, ranges)).toEqual(['- one', '  - nested']);
  });

  it('emits no head range for a root at the document start', () => {
    const text = `- one\n  - nested\n- two\n`;
    const doc = Text.of(text.split('\n'));
    const scope = resolveZoom(parse(text), 0)!;
    const ranges = hiddenOffsetRanges(doc, scope);
    expect(ranges.every((r) => r.from > 0)).toBe(true);
    expect(visibleLines(doc, ranges)).toEqual(['- one', '  - nested']);
  });

  it('emits no tail range for a root reaching the document end', () => {
    const doc = Text.of(DOC.split('\n'));
    const scope = resolveZoom(parse(DOC), lineOf(DOC, 'Trailing para.'))!;
    const ranges = hiddenOffsetRanges(doc, scope);
    expect(ranges.every((r) => r.to < doc.length)).toBe(true);
  });

  it('hides frontmatter with the head range', () => {
    const text = `---\ntag: x\n---\n\n# Top\n\n## Mid\n\ntext\n`;
    const doc = Text.of(text.split('\n'));
    const scope = resolveZoom(parse(text), lineOf(text, '## Mid'))!;
    const ranges = hiddenOffsetRanges(doc, scope);
    expect(visibleLines(doc, ranges)).not.toContain('tag: x');
    expect(visibleLines(doc, ranges)).toContain('## Mid');
  });

  it('stops each range one position short of the line it keeps', () => {
    // Those positions are where every point decoration on the neighbouring
    // visible line is anchored — a line decoration sorts BEFORE the position it
    // marks — so a replacement reaching them swallows the lot. At the head that
    // cost the zoom root its whole rendering, ours and Obsidian's alike: no
    // marker, no depth, and a list root drawn with an unstyled bullet at the
    // wrong column. At the tail, beginning exactly where the next node's own
    // replacement begins is a TIE, resolved by decoration precedence, and
    // Obsidian's table widget won it — zooming into a code fence rendered the
    // sibling table below the footer. `80-outline-zoom` asserts both
    // renderings; this pins the arithmetic underneath them.
    const doc = Text.of(DOC.split('\n'));
    const scope = resolveZoom(parse(DOC), lineOf(DOC, '- one'))!;
    const [head, tail] = hiddenOffsetRanges(doc, scope);
    const firstVisible = doc.line(scope.cover.start.line + 1);
    const lastVisible = doc.line(scope.cover.end.line + 1);
    expect(head!.to).toBe(firstVisible.from - 1);
    expect(tail!.from).toBe(lastVisible.to);
    // The head covers the whole of the line it stops on; the tail stops on a
    // line it KEEPS, and its non-inclusive start is what leaves that line alone
    // (`zoom-decorations.ts`).
    expect(head!.to).toBe(doc.line(scope.cover.start.line).to);
    expect(tail!.from).toBe(doc.line(scope.cover.end.line + 2).from - 1);
  });

  it('keeps a zero-length range, which is what a single blank line looks like', () => {
    // A blank line has no character to cover, only a line. A zero-length block
    // replacement there does hide it — measured in `80-outline-zoom`, both
    // ways: with the range dropped, the blank line renders.
    const blankFirst = `\n# H1\n\nbody\n`;
    const doc = Text.of(blankFirst.split('\n'));
    const ranges = hiddenOffsetRanges(doc, resolveZoom(parse(blankFirst), 1)!);
    expect(ranges).toEqual([{ from: 0, to: 0 }]);
    expect(visibleLines(doc, ranges)).toEqual(['# H1', '', 'body', '']);
  });

  it('a trailing newline in the kept text is the cover own gap, not an artefact', () => {
    // Written as an assertion because the obvious version of this property is
    // WRONG and was tried first: "the kept text never ends in a newline" fails,
    // and correctly so. The subtree cover is gap-inclusive by design (D3), so a
    // root whose trailing gap is the document's final blank line legitimately
    // keeps that line. The honest statement of the no-stray-edge property is
    // the exact-cover one below; this case pins WHY the weaker proxy is not it.
    const text = `# Top\n\n## Mid\n\n- one\n`;
    const doc = Text.of(text.split('\n'));
    const scope = resolveZoom(parse(text), lineOf(text, '- one'))!;
    expect(scope.cover.end.line).toBe(5); // the empty final line, owned as a gap
    expect(visibleLines(doc, hiddenOffsetRanges(doc, scope))).toEqual(['- one', '']);
  });

  it('keeps exactly the cover lines, for every root in every document', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const lines = md.split('\n');
        const doc = Text.of(lines);
        const parsed = parse(md);
        for (let line = 0; line < documentLineCount(parsed); line++) {
          const scope = resolveZoom(parsed, line);
          if (!scope) continue;
          const expected = lines.slice(scope.cover.start.line, scope.cover.end.line + 1);
          expect(visibleLines(doc, hiddenOffsetRanges(doc, scope))).toEqual(expected);
        }
      }),
      { numRuns: 60 },
    );
  });
});
