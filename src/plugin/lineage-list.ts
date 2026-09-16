/**
 * A grouped list of lineage rows, drawn once for every surface that shows one.
 *
 * The level above `lineage-row.ts`, which draws one squashed ancestor chain.
 * Here is what a LIST of rows needs and a single chain does not: the group head
 * a note's hits sit under, the row element and its chrome, the marker a node row
 * takes, and the three row types the model emits. Its callers are the backlinks
 * footer and the search palette; zoom's trail is not one, because it draws a
 * chain rather than a list and goes on calling `lineage-row.ts` directly.
 *
 * What differs between the two surfaces is passed in rather than branched on,
 * because the CHROME contract is the shared thing and the content rules are not
 * (`docs/research/surfaces-and-embedding`, "The two renderers"). The list is
 * told, never asked: it reads no setting, no view state and no controller, so
 * the same call draws the same rows wherever it is made.
 */

import { chevronGlyph, glyph, makeDisclosure } from './chrome-controls';
import {
  checkboxGlyph,
  markerSlot,
  ordinalMarker,
  renderLineageContent,
  segmentGlyph,
  segmentMarker,
  separatorGlyph,
} from './lineage-row';
import { applyLineChrome, lineChrome, plainGuideBackground } from './chrome-line';
import { FOLDED_NODE_CLASS, buildMarkerIcon } from './decorations';
import { markSubject, type HeadingMarkerStyle } from './marker-shapes';
import type { FooterRow, LineageSegment } from './footer-model';
import type { LineageSeparator, SegmentIcons } from './settings/footer';

type NodeRow = Extract<FooterRow, { type: 'node' }>;

/**
 * One group's heading: the note its hits come from, and whether it collapses.
 *
 * `onToggle` absent means the group does not collapse at all, and the head then
 * draws no chevron and claims no disclosure semantics — a control a reader can
 * reach and cannot use is worse than one that is not there, which is the rule
 * `lineage-row.ts` already applies to a segment.
 */
export interface GroupHead {
  readonly name: string;
  readonly folder: string;
  readonly count: number;
  readonly collapsed: boolean;
  readonly onToggle?: () => void;
}

/**
 * What a surface tells the list about itself.
 *
 * Longer than the shape suggests. The footer's own renderer reached for its
 * settings, its `App`, its component, its view state and its re-render as it
 * drew; each of those becomes a parameter rather than disappearing. The list
 * draws, and the surface decides what it draws with.
 */
export interface LineageListOptions {
  readonly icons: SegmentIcons;
  readonly separator: LineageSeparator;
  /** How a heading's mark is drawn — the editor's own style, since a row's
   * marker must be the one the editor draws (`heading-level-markers`). */
  readonly headingMarkerStyle: HeadingMarkerStyle;
  /** Whether a node row carries the guide stripes behind its indentation. */
  readonly guides: boolean;
  /**
   * The fold control on a row that withholds a subtree, or null on a surface
   * that shows no descendants and so folds nothing — the palette asks the model
   * for zero of them (`search-palette` design D3).
   */
  readonly folds: {
    expanded(sourcePath: string, nodeId: number): boolean;
    toggle(sourcePath: string, nodeId: number): void;
  } | null;
  /** A node row's own content, by whichever of the three ways it renders. */
  renderContent(el: HTMLElement, row: NodeRow, sourcePath: string): Promise<void>;
  /** One lineage segment's content. */
  renderSegment(el: HTMLElement, segment: LineageSegment, sourcePath: string): Promise<void>;
  /** A frontmatter property row's value. */
  renderProperty(el: HTMLElement, markdown: string, sourcePath: string): Promise<void>;
  /** What activating one ancestor on a lineage row means. */
  onActivateSegment(
    segment: LineageSegment,
    event: MouseEvent | KeyboardEvent,
    sourcePath: string,
  ): void;
  /**
   * What activating a node row means, or null on a surface whose rows are not
   * links. The footer's row opens its source note, so it takes `role="link"`
   * and a tab stop; the palette's is an option in a listbox it drives itself,
   * and takes its role from the caller — which is what `renderRow` hands the
   * element back for.
   */
  readonly onActivateRow:
    | ((row: NodeRow, event: MouseEvent | KeyboardEvent, sourcePath: string) => void)
    | null;
}

export function renderGroupHead(card: HTMLElement, group: GroupHead): void {
  const { name, folder, count, collapsed } = group;
  const head = card.createDiv({ cls: 'to-lineage-group-head' });
  head.toggleClass('is-collapsed', collapsed);
  if (group.onToggle) makeDisclosure(head, !collapsed, name);
  if (group.onToggle) {
    const chevron = head.createSpan({ cls: 'to-chevron' });
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    chevron.appendChild(chevronGlyph(!collapsed));
  }
  head.createSpan({ cls: 'to-lineage-group-name', text: name });
  if (folder) head.createSpan({ cls: 'to-lineage-group-folder', text: folder });
  head.createSpan({ cls: 'to-lineage-group-count', text: String(count) });

  if (group.onToggle) head.addEventListener('click', group.onToggle);
}

/**
 * One row, drawn as an outline line.
 *
 * The row IS a line: it takes the same class and custom properties
 * `lineChrome` gives a `.cm-line`, and `styles.css` lays it out with the same
 * rules. Nothing here computes an offset. The footer's earlier version had a
 * flex gutter of its own and set `margin-inline-start` by hand, which is how
 * its bullets ended up off the editor's column and its guides absent
 * altogether (docs/research/backlinks-footer-spikes, S4).
 *
 * `nativeBlocks: false` because no row here has a block of its own: the
 * rendered `<li>` is unwrapped and no atom keeps its box (D18), so every kind
 * is laid out as an ordinary block line with our own marker. Left true, a
 * quote or table row would take the atom rule, which moves the BOX by margin
 * — and the marker, placed for a padding-shifted line, would land a gutter
 * and a half away from its column.
 */
export function renderRow(
  body: HTMLElement,
  sourcePath: string,
  row: FooterRow,
  pending: Promise<void>[],
  options: LineageListOptions,
): HTMLElement {
  const el = body.createDiv({ cls: 'to-lineage-row' });
  // The row says what KIND of node it holds. The chrome class says how it is
  // laid out (every footer row is a block line) and the marker says the kind
  // in glyphs, but neither is readable — by a stylesheet, by a snippet, or by the
  // conformance matrix, which has to check that each kind got the treatment
  // its own rule promises.
  el.dataset.kind = row.type === 'node' ? row.fact.kind : row.type;
  // Guides are off by default. The footer is a quotation of a tree, not the
  // tree itself, and at a card's scale the stripes crowded a body that is only
  // ever a few rows deep — indentation alone carries the depth here. The model
  // reports `guideDepths` either way; this is the one site that declines to
  // draw them, so the model has one shape under test rather than one per
  // setting combination (design D7).
  //
  // Two conditions, not one: its own setting, and the guide layer being drawn
  // at all. A reader who turned the layer off does not expect it here.
  applyLineChrome(
    el,
    lineChrome(row.fact, {
      nativeBlocks: false,
      ...(options.guides ? { guides: plainGuideBackground(row.guideDepths) } : {}),
    }),
  );

  if (row.type === 'property') {
    el.addClass('is-property');
    // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
    el.appendChild(markerSlot(propertyGlyph()));
    const content = el.createSpan({ cls: 'to-lineage-content' });
    content.createSpan({ cls: 'to-lineage-prop-name', text: row.property });
    pending.push(options.renderProperty(content.createSpan(), row.markdown, sourcePath));
    return el;
  }

  if (row.type === 'lineage') {
    // The look is `lineage-row.ts`'s shared primitive, verbatim — the same
    // one `zoom-trail.ts` renders its own breadcrumb through. What differs
    // is only what THIS surface does when a segment activates: open the
    // source note at that ancestor, rather than re-root the view on it.
    renderLineageContent(el, row.segments, {
      icons: options.icons,
      separator: options.separator,
      fallback: row.fact,
      marker: (segment, fallback) => segmentMarker(segment, fallback, options.headingMarkerStyle),
      glyph: (segment) => segmentGlyph(segment, options.headingMarkerStyle),
      separatorGlyph,
      // Collected, not discarded. `render()` measures every group's height
      // once `pending` settles, to decide caps and "show more" — so a lineage
      // row still filling in at that point is measured empty, and the numbers
      // come from heights that no longer exist a frame later.
      renderSegment: (target, segment) => {
        pending.push(options.renderSegment(target, segment, sourcePath));
      },
      onActivate: (segment, event) => options.onActivateSegment(segment, event, sourcePath),
    });
    return el;
  }

  if (row.isHit) el.addClass('is-hit');

  if (row.foldable && options.folds) {
    // Keyed on the row HAVING a subtree, never on it being folded right now.
    // The old condition (`foldedCount > 0`) stopped being true the moment a
    // reader expanded the row, so the control that could close it again was
    // never drawn — expansion was a one-way door.
    const { folds } = options;
    const expanded = folds.expanded(sourcePath, row.nodeId);
    // The editor's own fold chrome, in the editor's own column — but a real
    // BUTTON, which the editor's is not. Chrome is what the two surfaces
    // share; semantics are not. An editor line has a fold command behind it
    // and a footer row has nothing, so this element is the only route a
    // keyboard reader has, and it keeps its role, its label and a state that
    // tracks both directions.
    // The row itself carries the folded state, so its marker takes the same
    // treatment a folded node's does in the editor. The class goes on the row
    // rather than the control because that is what the marker is inside.
    el.toggleClass(FOLDED_NODE_CLASS, !expanded);
    const fold = el.createEl('button', { cls: 'to-lineage-fold to-decor-fold-toggle' });
    fold.type = 'button';
    fold.setAttribute('aria-label', expanded ? 'Hide children' : `Show ${row.foldedCount} hidden`);
    fold.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    fold.toggleClass('is-collapsed', !expanded);
    // The DOWN chevron, as the editor's own control draws it: the shared
    // `.is-collapsed` rotation turns a down-pointing glyph to the right,
    // which is what "folded" looks like everywhere else. Starting from the
    // right-pointing glyph turned it to point UP when folded.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
    fold.appendChild(chevronGlyph(true));
    const toggle = (event: Event) => {
      event.stopPropagation();
      folds.toggle(sourcePath, row.nodeId);
    };
    fold.addEventListener('click', toggle);
    // Enter and Space handled explicitly, though a `button` activates on both
    // by itself: inside the editor's own key handling the default action does
    // not survive to reach it — measured, a focused row control that ignored
    // every press. The row's own activation handler makes the same choice for
    // the same reason.
    fold.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle(event);
    });
  }

  // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
  el.appendChild(markerFor(row, options.headingMarkerStyle));

  const content = el.createSpan({ cls: 'to-lineage-content' });
  // The rendered content gets its own span: `MarkdownRenderer` resolves
  // asynchronously, and `unwrapBlocks` only unwraps a LONE wrapper — so a tag
  // appended beside it in the meantime left the `<p>` in place, which is a
  // block element in a row and exactly what the model forbids.
  pending.push(options.renderContent(content.createSpan(), row, sourcePath));
  if (row.referenceKind === 'embed') {
    content.createSpan({ cls: 'to-lineage-tag', text: 'embed' });
  }
  // Reachable AND operable from the keyboard, on the same terms as a lineage
  // segment. The row was clickable and nothing else: a keyboard-only reader
  // could tab to the links INSIDE a mention — which go to the link's own
  // target — and had no way at all to reach the thing the row is for, which is
  // the referencing node. `role="link"` without a key handler would be worse
  // than nothing: it advertises a control the keyboard can reach and cannot
  // use.
  if (!options.onActivateRow) return el;
  el.setAttribute('role', 'link');
  el.tabIndex = 0;
  el.addEventListener('click', (event) => options.onActivateRow?.(row, event, sourcePath));
  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    // A nested link owns Enter when the focus is on IT, not on the row.
    if (event.target !== el) return;
    // Order matters — see the segment handler above.
    options.onActivateRow?.(row, event, sourcePath);
    event.preventDefault();
  });
  return el;
}

/**
 * The marker for a node row, by the mechanism its kind needs.
 *
 * Three, because the footer's content comes from the reading-mode renderer and
 * that renderer answers in three shapes:
 *
 * - An ORDERED item's number is not notation, it is what the item is called.
 *   Unwrapping the `<ol>` discards it, so it is read back off the source line
 *   and drawn in the gutter, right-aligned against the text the way a list
 *   numbers itself.
 * - An ATOM (quote, callout, table, code, html) arrives as a real block with no
 *   text run to sit beside, so its marker is positioned against the row's box —
 *   the same absolute mechanism the editor uses for its widget atoms. Note the
 *   set is wider here than in the editor, where a quote and a code fence are
 *   still `.cm-line`s; this renderer returns a block for every one of them.
 * - Everything else sits in the inline flow, beside the first text run.
 */
function markerFor(row: NodeRow, style: HeadingMarkerStyle): HTMLElement {
  if (row.task !== undefined) return markerSlot(checkboxGlyph(row.task));
  if (row.ordinal) return ordinalMarker(row.ordinal);
  return markerSlot(buildMarkerIcon(markSubject(row.fact, style)));
}

function propertyGlyph(): SVGSVGElement {
  return glyph(16, ['M2 4.5h4M9 4.5h5M2 11.5h5M10 11.5h4'], {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round',
  });
}
