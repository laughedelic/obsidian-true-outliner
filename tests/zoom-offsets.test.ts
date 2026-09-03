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

/** The text a set of hidden ranges would remove, and what survives. */
function visibleText(text: string, ranges: { from: number; to: number }[]): string {
  let out = '';
  let at = 0;
  for (const r of [...ranges].sort((a, b) => a.from - b.from)) {
    out += text.slice(at, r.from);
    at = r.to;
  }
  return out + text.slice(at);
}

describe('hiddenOffsetRanges: the boundary arithmetic', () => {
  it('hides both sides of a mid-document root, leaving exactly its own lines', () => {
    const doc = Text.of(DOC.split('\n'));
    const scope = resolveZoom(parse(DOC), lineOf(DOC, '- one'))!;
    const ranges = hiddenOffsetRanges(doc, scope);
    expect(ranges).toHaveLength(2);
    // `- one` owns its nested child; `- two` and the trailing paragraph do not
    // belong to it, and neither does anything above.
    expect(visibleText(DOC, ranges)).toBe('- one\n  - nested');
  });

  it('emits no head range for a root at the document start', () => {
    const text = `- one\n  - nested\n- two\n`;
    const doc = Text.of(text.split('\n'));
    const scope = resolveZoom(parse(text), 0)!;
    const ranges = hiddenOffsetRanges(doc, scope);
    expect(ranges.every((r) => r.from > 0)).toBe(true);
    expect(visibleText(text, ranges)).toBe('- one\n  - nested');
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
    expect(visibleText(text, ranges)).not.toContain('tag: x');
    expect(visibleText(text, ranges)).toContain('## Mid');
  });

  it('never emits an empty range — a zero-length block replacement is a widget of nothing', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const doc = Text.of(md.split('\n'));
        for (let line = 0; line < documentLineCount(parse(md)); line++) {
          const scope = resolveZoom(parse(md), line);
          if (!scope) continue;
          for (const r of hiddenOffsetRanges(doc, scope)) {
            expect(r.to).toBeGreaterThan(r.from);
          }
        }
      }),
      { numRuns: 60 },
    );
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
    expect(visibleText(text, hiddenOffsetRanges(doc, scope))).toBe('- one\n');
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
          const expected = lines
            .slice(scope.cover.start.line, scope.cover.end.line + 1)
            .join('\n');
          expect(visibleText(md, hiddenOffsetRanges(doc, scope))).toBe(expected);
        }
      }),
      { numRuns: 60 },
    );
  });
});
