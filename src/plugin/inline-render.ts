/**
 * One node's inline content into one element, for every surface that quotes a
 * node.
 *
 * Its own module rather than `lineage-row.ts`'s, which draws the row this text
 * lands in. That module holds no runtime import on purpose: rendering markdown
 * needs Obsidian's renderer and a `Component` to own its lifetime, and neither
 * belongs to a function that draws a row — which is why a surface hands the row
 * a `renderSegment` hook instead of its markdown. The hook has to be built from
 * something, and this is what every surface builds it from.
 *
 * Callers: the backlinks footer, the lineage list the footer and the search
 * palette share, and zoom's breadcrumb trail.
 */

import { MarkdownRenderer, type App, type Component } from 'obsidian';
import type { RowRender } from './footer-model';

/**
 * An HTML block's entities, decoded — `&amp;` shown as `&`.
 *
 * `htmlTextOf` deliberately leaves them encoded and says "left to the DOM", but
 * the DOM never saw them: `setText` writes textContent, which ESCAPES rather
 * than decodes, so a block containing `A &amp; B` displayed the ampersand's
 * source instead of the ampersand.
 *
 * `DOMParser` rather than `innerHTML` on a scratch element: it parses without a
 * live document, so nothing loads, runs, or is inserted anywhere. Safe on
 * content this plugin does not control, which a note's HTML block is. The result
 * still goes through `setText`, so a decoded `&lt;script&gt;` stays the text
 * `<script>` and is never markup.
 */
function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return (
    new DOMParser().parseFromString(text, 'text/html').documentElement.textContent ?? text
  );
}

/**
 * Strips the block wrappers `MarkdownRenderer` returns, leaving inline content.
 *
 * Applied repeatedly from the outside in, because a list item arrives as
 * `<ul><li>…` — two wrappers deep — and a single pass would leave the `<li>`
 * behind with its list-item display and its marker box. Stops at the first
 * element that is not a lone wrapper, so a row whose markdown genuinely holds
 * several blocks keeps them.
 *
 * The safety net, not the mechanism: the model strips block syntax before the
 * renderer ever sees the text (D18), so a lone `<p>` is all this normally
 * unwraps. The wider set stays because a stripping miss must not put a block
 * element in a row — the one invariant the whole model rests on.
 */
const BLOCK_WRAPPERS = new Set(['P', 'UL', 'OL', 'LI', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/**
 * One node's inline content, into one element, by the one rule every surface
 * that quotes a node follows.
 *
 * Three modes, and only `markdown` reaches Obsidian. By then the model has
 * already removed the node's block syntax, so the renderer is asked for inline
 * content and returns a single paragraph, which `unwrapBlocks` flattens.
 *
 * `sourcePath` is the REFERENCING note, so its relative links resolve from
 * where they were written rather than from the note being read.
 *
 * `media` is D1's one difference between a chain and a quotation. Applied as a
 * pass over the RENDERED fragment rather than as a rewrite of the markdown: the
 * only thing that knows what a string parses into is the parser, and stripping
 * embed syntax by regex ahead of it would get escapes and code spans wrong the
 * same way a hand-rolled inline stripper would (design D2).
 *
 * Resolves after the element already exists. Callers that cannot wait — a CM6
 * widget's `toDOM` — get a complete row whose text fills in a moment later.
 */
export async function renderInline(
  app: App,
  el: HTMLElement,
  content: { readonly markdown: string; readonly render: RowRender },
  sourcePath: string,
  component: Component,
  options: { readonly media: boolean },
): Promise<void> {
  if (content.markdown.length === 0) return;
  if (content.render === 'text') {
    el.setText(decodeEntities(content.markdown));
    return;
  }
  if (content.render === 'code') {
    el.createEl('code', { cls: 'to-backlinks-code', text: content.markdown });
    return;
  }
  // An embed is taken out of the SOURCE where a chain is being drawn, not only
  // out of the result. Obsidian builds an embed's element on its own schedule —
  // a wrapper first, its content and sometimes its final tag later — so a single
  // pass after `render()` resolves is racing that pipeline: locally the elements
  // were already there to remove, and on a slower machine two of them arrived
  // afterwards and stayed. Removing the syntax means none is ever created.
  //
  // `dropMedia` still runs behind it. The transform reads markdown, so it cannot
  // see an `<img>` written as HTML, and a backstop that catches what is present
  // costs nothing.
  const source = options.media ? content.markdown : withoutEmbeds(content.markdown);
  await MarkdownRenderer.render(app, source, el, sourcePath, component);
  unwrapBlocks(el);
  if (!options.media) dropMedia(el);
}

/**
 * Embed syntax replaced by what it would have shown.
 *
 * Narrow on purpose: `![[…]]` and `![…](…)` and nothing else. This is the one
 * markdown rewrite this module does — the general case is what
 * `MarkdownRenderer` is for — and it is confined to a chain, where the rule is
 * already that no media renders. A literal `![[` inside a code span is the
 * false positive it can produce, and the cost there is alt text where the
 * source characters were.
 *
 * The alt, then the target, then nothing: an embed whose alt is empty still has
 * to leave something behind, or a segment carrying only that embed is blank and
 * unclickable.
 */
function withoutEmbeds(markdown: string): string {
  return markdown
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) =>
      (alias ?? target).trim(),
    )
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, src: string) =>
      alt.trim().length > 0 ? alt.trim() : src.trim(),
    );
}

/**
 * Media out of a chain, alt text in its place.
 *
 * A lineage row is one line of context; an image is not text and there is no
 * size at which it belongs there. The alt is what the node SAYS, so it stays —
 * a segment emptied of its only content is blank, and a blank segment is
 * unclickable, which is the failure the kind-label fallback already exists to
 * prevent.
 *
 * Obsidian's own internal embeds are `.internal-embed` spans that resolve
 * later, so they are matched by class as well as by tag: by the time one has
 * become an `<img>` the row has already been drawn.
 */
function dropMedia(el: HTMLElement): void {
  // NOT a bare `svg`. Obsidian renders inline math as an SVG inside its MathJax
  // container, and math is inline content this rule is required to keep — a
  // chain carrying `$E = mc^2$` would have lost the formula entirely. Only the
  // SVG that IS a drawing is media; `canvas` joins it, as the row's own bound
  // already recognised.
  const media = el.querySelectorAll(
    'img, video, audio, iframe, canvas, svg.excalidraw-svg, .internal-embed',
  );
  media.forEach((node) => {
    // An attribute that is present but empty is absent for this purpose:
    // `getAttribute('alt')` answers `''` for `alt=""`, which `??` accepts, so
    // an image whose alt is empty replaced itself with nothing — and a segment
    // whose only content was that image became blank and still focusable,
    // which is the failure the fallback chain exists to prevent.
    const first = (...values: Array<string | null>): string =>
      values.find((v) => v !== null && v.trim().length > 0)?.trim() ?? '';
    node.replaceWith(
      first(node.getAttribute('alt'), node.getAttribute('src'), node.getAttribute('title')),
    );
  });
}

function unwrapBlocks(el: HTMLElement): void {
  for (;;) {
    const only = el.children.length === 1 ? el.firstElementChild : null;
    if (!only || !BLOCK_WRAPPERS.has(only.tagName)) break;
    only.replaceWith(...Array.from(only.childNodes));
  }
  trimEdgeWhitespace(el);
}

/**
 * Drops the whitespace Obsidian's own HTML carries between a wrapper and its
 * content — the newline inside an `<li>`, say.
 *
 * Inside a block that whitespace would collapse away entirely, which is why it
 * is invisible in Obsidian's own rendering. Here the content follows an inline
 * marker, so it collapses to a real SPACE instead: measured, it pushed a list
 * row's text 3.6px right of the column, against the 13.2px gap the editor's own
 * lines hold between marker and text.
 */
function trimEdgeWhitespace(el: HTMLElement): void {
  const isBlank = (n: ChildNode): boolean => n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim();
  while (el.firstChild && isBlank(el.firstChild)) el.firstChild.remove();
  while (el.lastChild && isBlank(el.lastChild)) el.lastChild.remove();
  const first = el.firstChild;
  if (first?.nodeType === Node.TEXT_NODE) {
    first.textContent = (first.textContent ?? '').replace(/^\s+/, '');
  }
}
