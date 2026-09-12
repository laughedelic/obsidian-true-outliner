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
