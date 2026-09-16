/**
 * The lineage row's CONTENT, rendered once for every surface that shows one.
 *
 * A squashed ancestor chain — marker in the gutter, then each ancestor as its
 * own activatable segment, with per-segment icons, ordinals and separators — is
 * a visual primitive this plugin already established in the backlinks footer.
 * Zoom's breadcrumb trail is the same thing about a different chain, so it
 * renders through the same function rather than inventing a second look. The
 * first version of zoom's trail was a row of pill buttons, which is exactly the
 * new primitive this module exists to prevent.
 *
 * What is NOT here: the row element itself, its chrome, and what a segment DOES
 * when activated. Each surface owns those — the footer opens the source note at
 * that ancestor, zoom re-roots the view on it — and pretending they are the same
 * action would be a worse abstraction than two call sites.
 *
 * The marks a segment and a row carry live here too, below the row that draws
 * them: a segment's marker, its inline glyph, an ordered item's number, a task's
 * checkbox and the gutter slot they sit in. Rendering a segment's markdown does
 * NOT — that needs Obsidian's renderer and a `Component` to own its lifetime,
 * which is the reason `renderSegment` is a hook, and it lives in
 * `inline-render.ts` where the surfaces build that hook from it.
 */

import { buildMarkerIcon, buildShapesIcon } from './decorations';
import { MARKER_LEFT_SHIFT_EXPR } from './chrome-line';
import { glyph } from './chrome-controls';
import type { LineageSegment } from './footer-model';
import { checkboxShapes, markSubject, type HeadingMarkerStyle, type NodeMark } from './marker-shapes';
import type { LineageSeparator, SegmentIcons } from './settings/footer';

/** The appearance settings are the footer's own, imported rather than restated,
 * so one choice governs both surfaces and neither can drift from the settings
 * tab that writes them. */
export interface LineageRowOptions {
  readonly icons: SegmentIcons;
  readonly separator: LineageSeparator;
  /** The row's own kind and level, for the gutter marker when the first
   * segment has none. */
  readonly fallback: NodeMark;
  /** What activating one segment means on this surface. The event is always
   * the `click` or `keydown` that triggered it — never any other kind — since
   * this module is the only place that dispatches it. */
  readonly onActivate: (segment: LineageSegment, event: MouseEvent | KeyboardEvent) => void;
  /** Builds the gutter marker for the first segment. */
  readonly marker: (segment: LineageSegment | undefined, fallback: NodeMark) => HTMLElement;
  /** Builds one segment's own inline icon. */
  readonly glyph: (segment: LineageSegment) => Element;
  /** Builds the between-segments separator. */
  readonly separatorGlyph: () => Element;
  /**
   * Puts one segment's own content into its element.
   *
   * A hook rather than a call, because this module is DOM and nothing else:
   * rendering markdown needs Obsidian's renderer and a `Component` to own its
   * lifetime, and neither belongs to a function that draws a row. Each surface
   * passes its own — the footer its existing one, zoom's trail one built from
   * the widget's own component — and both get the same treatment from here.
   *
   * May resolve after the row exists; the row is complete without it.
   */
  readonly renderSegment: (el: HTMLElement, segment: LineageSegment) => void;
  /**
   * Render the marker regardless of `icons`. `icons` is an APPEARANCE
   * setting, correct for hiding a marker that is decoration — the footer's
   * own case, a kind glyph naming what the first segment is. Zoom's trail
   * puts a CONTROL there instead (the zoom-out affordance), and `icons:
   * 'none'` must not be able to remove a control a requirement states as
   * always present. Unset for the footer, which has nothing that needs it.
   */
  readonly markerRequired?: boolean;
}

/**
 * Does something INSIDE the segment own this event?
 *
 * Once a segment renders its markdown, it can contain real links — and a link
 * inside a crumb is a second destination competing with the crumb's own. The
 * link wins where the event starts on it, the segment wins everywhere else.
 *
 * Here, not in either surface's handler. The footer has a guard of this shape
 * on its ROW, answering a different question (does a click anywhere in a row
 * open the source note); zoom has none at all, so without this a click on a
 * crumb's link would follow the link AND re-root the view. Keyboard as well as
 * pointer: a rendered anchor is focusable, and its own Enter bubbles to the
 * segment around it.
 */
function ownedByChild(seg: HTMLElement, event: Event): boolean {
  if (event.defaultPrevented) return true;
  const target = event.target as HTMLElement | null;
  if (!target || target === seg) return false;
  const owner = target.closest('a, button, input, [role="link"], [role="button"]');
  return owner !== null && owner !== seg && seg.contains(owner);
}

/**
 * Fills `el` with a lineage row's marker and segments.
 *
 * The comments below are the footer's own reasoning, kept with the code they
 * explain rather than left behind at the site it moved from.
 */
export function renderLineageContent(
  el: HTMLElement,
  segments: readonly LineageSegment[],
  options: LineageRowOptions,
): void {
  el.addClass('is-lineage');
  // The gutter marker IS the first segment's, so it takes that segment's own
  // state — a task ancestor gets its checkbox and an ordered one its number,
  // the same rule a node row follows. The row's kind alone gave both of them
  // the generic bullet.
  if (options.icons !== 'none' || options.markerRequired) {
    // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
    el.appendChild(options.marker(segments[0], options.fallback));
  }
  const content = el.createSpan({ cls: 'to-backlinks-content' });
  segments.forEach((segment, i) => {
    // Between two ancestors, so outside both — a separator that sat inside a
    // segment would share that ancestor's target and activate it.
    if (i > 0 && options.separator === 'chevron') {
      const sep = content.createSpan({ cls: 'to-backlinks-seg-sep' });
      sep.setAttribute('aria-hidden', 'true');
      // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
      sep.appendChild(options.separatorGlyph());
    }
    // Each ancestor is its own target. One handler on the row could only reach
    // the chain as a whole, which is not what "a lineage element navigates to
    // that ancestor" promises — a chain is several ancestors on one line.
    const seg = content.createSpan({ cls: 'to-backlinks-seg' });
    // Every ancestor names its own kind. The FIRST one's marker is the row's,
    // already drawn in the gutter above, so only the rest need one here — and it
    // goes inside the segment, not between two of them, so it shares that
    // ancestor's target and its hover rather than sitting in dead space.
    if (i > 0) {
      if (segment.ordinal) {
        // Its number IS its mark, and the model has taken it out of the text — a
        // bullet here would drop it entirely. Drawn whatever the icon setting
        // says, because it is CONTENT the model removed from the text rather
        // than notation added to it: without it the row reads "Item" where the
        // note reads "10. Item". No gutter slot: this one sits in the text run,
        // where the number needs its own width.
        seg.createSpan({ cls: 'to-backlinks-seg-ord', text: segment.ordinal });
      } else if (options.icons === 'all') {
        const icon = seg.createSpan({ cls: 'to-backlinks-seg-icon' });
        // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
        icon.appendChild(options.glyph(segment));
      }
    }
    // Already stripped by whatever built the segments, which owns the rule so
    // that a segment and a node row of the same kind say the same thing. What is
    // left is INLINE content, and it reaches the DOM through the same renderer a
    // node row uses — `appendText` here is what put `**bold**` in a crumb with
    // its asterisks (docs/research/lineage-text-rendering).
    //
    // Into its OWN span, empty at the point the renderer gets it. The renderer
    // unwraps the document `MarkdownRenderer` answers with — a `<p>` around one
    // line — and that unwrapping only fires when the wrapper is the element's
    // ONLY child. Handed the segment itself, which already holds the kind icon,
    // it found two children and left the paragraph in place: a block element
    // inside a row, which is the one thing a row may not contain.
    options.renderSegment(seg.createSpan(), segment);
    // The shortening mark sits OUTSIDE the rendered content, so it is never
    // parsed as markdown and never lands inside a link the node's text opened.
    if (segment.shortened === true) seg.appendText('…');
    // Focusable AND operable. `role="link"` with a tab stop and no key handler
    // is a control the keyboard can reach and cannot use, which is worse than
    // one it cannot reach at all — it advertises itself and then does nothing.
    seg.setAttribute('role', 'link');
    seg.tabIndex = 0;
    seg.addEventListener('click', (event) => {
      if (ownedByChild(seg, event)) return;
      event.stopPropagation();
      options.onActivate(segment, event);
    });
    seg.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (ownedByChild(seg, event)) return;
      // The action BEFORE `preventDefault`, not after. The footer's own guard is
      // `event.defaultPrevented`, which exists to let a nested link that has
      // already handled itself win — so preventing the default first made the
      // handler veto its own call, and Enter on a segment did nothing at all.
      // Shipped that way once: the segment was focusable and inert.
      options.onActivate(segment, event);
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

/**
 * A lineage segment's mark, by the same rule `markerFor` applies to a node row:
 * a task's checkbox and an ordered item's number replace the bullet, because
 * they are state the reader is looking for rather than presentation (D18).
 *
 * `fallback` covers a chain with no elements, which the model does not
 * produce but the type permits: the row's own fact, whose kind is the chain's
 * first element's, and so is its level.
 */
export function segmentMarker(
  segment: LineageSegment | undefined,
  fallback: NodeMark,
  style: HeadingMarkerStyle,
): HTMLElement {
  if (!segment) return markerSlot(buildMarkerIcon(markSubject(fallback, style)));
  if (segment.task !== undefined) return markerSlot(checkboxGlyph(segment.task));
  if (segment.ordinal) return ordinalMarker(segment.ordinal);
  return markerSlot(buildMarkerIcon(markSubject(segment, style)));
}

/** The same choice as `segmentMarker`, as a bare glyph for an INLINE segment
 * icon — which sits in the text run and needs no gutter slot around it. An
 * ordered segment never reaches here: its number is drawn as text instead,
 * since no fixed-width icon box holds `10.`. */
export function segmentGlyph(segment: LineageSegment, style: HeadingMarkerStyle): Element {
  if (segment.task !== undefined) return checkboxGlyph(segment.task);
  return buildMarkerIcon(markSubject(segment, style));
}

/**
 * An ordered item's number, in the marker's place.
 *
 * Inline rather than absolute, and sized so its LEFT edge lands on the block
 * icon's — which is the rule the editor's own ordered markers follow, and for
 * the reason recorded there: a fixed left edge reads as a column, where centring
 * each number on its own width leaves `10.` and `100.` ragged and eats the room
 * the fold chevron needs. A number too wide for the slot grows right and pushes
 * its own text out, exactly as it does in the editor.
 */
export function ordinalMarker(label: string): HTMLElement {
  return createSpan({ cls: 'to-backlinks-ordinal', text: label });
}

/** A task's state, drawn where its bullet would be. Not interactive: the footer
 * is read-only (D2), and a checkbox that looks clickable and is not is worse
 * than one that does not. */
export function checkboxGlyph(done: boolean): SVGSVGElement {
  return buildShapesIcon(checkboxShapes(done));
}

/**
 * A row's marker, built exactly the way the editor builds a plain line's: an
 * inline `.to-decor-marker-icon` span carrying the shared left shift, sitting
 * at the start of the row's own text.
 *
 * Same class, same shift expression, same inline-flow mechanism — so the icon
 * lands on `depth * unit`, the column its guide is drawn on, and it aligns to
 * the row text's own baseline rather than to the row box (the reason the editor
 * chose inline flow over absolute positioning: a heading's box carries
 * asymmetric spacing that would pull the icon visibly high).
 */
export function markerSlot(icon: Element): HTMLElement {
  const el = createSpan({ cls: 'to-decor-marker-icon' });
  el.setCssProps({ '--to-marker-left': MARKER_LEFT_SHIFT_EXPR });
  // `el` was created on the line above and is not mounted until the caller
  // attaches the row it belongs to.
  // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
  el.appendChild(icon);
  return el;
}

/** What stands between two ancestors when the separator setting asks for one.
 * Exported: zoom's own trail (`zoom-trail.ts`) builds a lineage row through the
 * same shared primitive and reuses this glyph rather than drawing a second
 * chevron. */
export function separatorGlyph(): SVGSVGElement {
  return glyph(24, ['M9 5l7 7-7 7'], {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
}
