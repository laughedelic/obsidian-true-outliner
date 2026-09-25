import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildStylesheet, stylesheetParts } from '../scripts/styles.mjs';

/**
 * The stylesheet's own structural integrity.
 *
 * This exists because a merge resolution silently ate one closing brace, and
 * nothing noticed. CSS does not fail loudly: every rule after the missing brace
 * was swallowed into the unclosed one and simply stopped applying, which looks
 * exactly like a theme that never styled those elements. `chrome-tokens.ts`
 * makes the same point about custom properties — "a CSS variable that nobody
 * defines fails by falling back, not by complaining" — and this is that hazard
 * one level up.
 *
 * Checked per part rather than on the joined output, so a failure names the
 * file — and so a part with an unclosed rule cannot be rescued by a stray brace
 * in the part after it.
 */
const parts = stylesheetParts().map((file) => ({ name: basename(file), css: readFileSync(file, 'utf-8') }));
const css = buildStylesheet();

/** Braces inside comments and strings are not structure. */
function structuralCss(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

describe('styles/ structure', () => {
  it.each(parts)('$name has balanced braces', ({ css }) => {
    const src = structuralCss(css);
    let depth = 0;
    let line = 1;
    for (const ch of src) {
      if (ch === '\n') line++;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        expect(depth, `unmatched '}' at line ${line}`).toBeGreaterThanOrEqual(0);
      }
    }
    expect(depth, 'unclosed rule — some rule swallowed everything after it').toBe(0);
  });

  it.each(parts)('$name is a whole file: one trailing newline, no leading blank', ({ css }) => {
    // The join's contract (scripts/styles.mjs): a part ends with exactly one
    // newline and the join supplies the blank line between neighbours, so
    // the spacing between parts never depends on which part came before.
    expect(css.endsWith('\n')).toBe(true);
    expect(css.endsWith('\n\n')).toBe(false);
    expect(css.startsWith('\n')).toBe(false);
  });

  it('joins the parts in filename order', () => {
    // Filename order is cascade order — the prefixes exist to state it.
    const names = parts.map((p) => p.name);
    expect(names).toEqual([...names].sort());
    expect(names.length).toBeGreaterThan(1);
  });

  it('declares the zoom trail and the zoomed-editor rule', () => {
    // Not a style assertion — a presence one. The trail deliberately carries
    // almost no CSS of its own (its row is the footer's shared primitive), so
    // "the zoom styles are here at all" is worth pinning separately from how
    // they look.
    expect(css).toContain('.to-zoom-trail');
    expect(css).toContain('.cm-editor.to-zoomed .inline-title');
    expect(css).toContain('.cm-editor.to-zoomed .metadata-container');
  });

  it('no longer declares the crumb buttons the trail used to invent', () => {
    expect(css).not.toContain('to-zoom-crumb');
  });
});

/**
 * The split between the lineage list's rules and the footer's own.
 *
 * Two surfaces draw a lineage row, and a scope class alone would not have kept
 * the footer's rules off the other one: most of the footer's part was written
 * as bare element-class selectors, which reach any surface that renders the
 * element whatever scope wraps it. So the shared classes were renamed, and this
 * is what keeps the rename meaning something — the alternative is a footer rule
 * that silently applies to the search palette, which is exactly the defect the
 * extraction exists to prevent.
 *
 * The footer may still SPECIALISE a shared row, and does: a selector there may
 * name a `to-lineage-*` class as long as it is rooted at `.to-backlinks`, which
 * reaches nothing else.
 */
describe('styles/ the lineage list and the footer keep to their own', () => {
  const partNamed = (name: string): string => {
    const part = parts.find((p) => p.name === name);
    if (!part) throw new Error(`no such part: ${name}`);
    return structuralCss(part.css);
  };

  /** Every selector in a part: what sits before each `{`, comments removed. */
  const selectorsIn = (css: string): string[] =>
    css
      .split('}')
      .flatMap((chunk) => chunk.split('{').slice(0, -1))
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('@'));

  it('the shared part names no footer class', () => {
    const offenders = selectorsIn(partNamed('15-lineage-list.css')).filter((s) =>
      /\.to-backlinks/.test(s),
    );
    expect(offenders).toEqual([]);
  });

  it('the footer part reaches a shared class only under its own scope', () => {
    const offenders = selectorsIn(partNamed('20-backlinks-footer.css')).filter(
      (s) => /\.to-lineage[-\w]*|\.to-chevron\b/.test(s) && !/\.to-backlinks/.test(s),
    );
    expect(offenders).toEqual([]);
  });
});
