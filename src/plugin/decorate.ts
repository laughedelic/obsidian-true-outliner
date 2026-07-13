/**
 * Pure per-line decoration facts for outline mode's visual node chrome.
 * Every node kind is decorated — headings, paragraphs, list items, and
 * atoms all get the same tree-depth indentation and a consistent, prominent
 * marker, so the tree reads as one hierarchy regardless of how a node is
 * encoded in markdown. List items already have a native marker glyph
 * (bullet/number) and native hanging-indent positioning for it; rather than
 * replacing that mechanism, decorations.ts reuses it — the SAME
 * `padding-left`/`text-indent` pair Obsidian already uses to hang bullets
 * is applied uniformly (one fixed unit, not Obsidian's own per-level
 * values) to every kind, so list bullets/checkboxes hang correctly at our
 * depth-based position without needing separate positioning logic, and
 * kinds without a native marker (paragraphs, headings, atoms) get a
 * `::before` glyph that hangs the exact same way. No CM6 imports —
 * decorations.ts is a thin adapter.
 */

import type { OutlineDoc, OutlineNode } from '../model';
import { isAtom } from '../model';

export interface LineDecorationFact {
  /** 0-indexed absolute line number in the document. */
  readonly lineNumber: number;
  /** Distance from the document root; top-level nodes are depth 0. */
  readonly depth: number;
  /** True only for a node's own first line — carries the hang + marker. */
  readonly isFirstLine: boolean;
  /**
   * True for list-item first lines: they already have a native marker
   * glyph (bullet/number) that should be restyled in place, not
   * supplemented with our own `::before` marker.
   */
  readonly hasNativeMarker: boolean;
  /**
   * True for atom nodes (code/table/quote/callout/html/hr). `padding-left`
   * only shifts an element's own *content*, never its own border/background
   * box — invisible for plain text, but atoms render a visible background/
   * border box whose edges stay put regardless of padding. Atoms need
   * `margin-left` instead, which actually moves the box; decorations.ts
   * uses this flag to pick the right CSS property.
   */
  readonly isAtom: boolean;
}

/**
 * Walks the parsed tree in document order (a node's own lines, then its
 * children — the same layout `nodeAtLine`/`startLine` assume: trailingGap
 * lines sit between a node's own lines and its children, and carry no fact
 * of their own).
 */
export function decorate(doc: OutlineDoc): LineDecorationFact[] {
  const facts: LineDecorationFact[] = [];
  let current = doc.preamble.length;

  const walk = (node: OutlineNode, depth: number): void => {
    const atom = isAtom(node);
    for (let i = 0; i < node.lines.length; i++) {
      facts.push({
        lineNumber: current + i,
        depth,
        isFirstLine: i === 0,
        hasNativeMarker: node.kind === 'list-item' && i === 0,
        isAtom: atom,
      });
    }
    current += node.lines.length + node.trailingGap.length;
    node.children.forEach((child) => walk(child, depth + 1));
  };

  doc.children.forEach((node) => walk(node, 0));
  return facts;
}
