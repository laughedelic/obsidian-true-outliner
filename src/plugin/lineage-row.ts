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
 */

import type { NodeKind } from '../model';
import type { LineageSegment } from './footer-model';
import type { LineageSeparator, SegmentIcons } from './mode-registry';

/** The appearance settings are the footer's own, imported rather than restated,
 * so one choice governs both surfaces and neither can drift from the settings
 * tab that writes them. */
export interface LineageRowOptions {
  readonly icons: SegmentIcons;
  readonly separator: LineageSeparator;
  /** The row's own kind, for the gutter marker when the first segment has none. */
  readonly kind: NodeKind;
  /** What activating one segment means on this surface. */
  readonly onActivate: (segment: LineageSegment, event: Event) => void;
  /** Builds the gutter marker for the first segment. */
  readonly marker: (segment: LineageSegment | undefined, fallbackKind: NodeKind) => HTMLElement;
  /** Builds one segment's own inline icon. */
  readonly glyph: (segment: LineageSegment) => Element;
  /** Builds the between-segments separator. */
  readonly separatorGlyph: () => Element;
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
  if (options.icons !== 'none') {
    // eslint-disable-next-line no-restricted-syntax -- detached DOM: the row is still detached.
    el.appendChild(options.marker(segments[0], options.kind));
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
    // that a segment and a node row of the same kind say the same thing.
    seg.appendText(segment.text);
    // Focusable AND operable. `role="link"` with a tab stop and no key handler
    // is a control the keyboard can reach and cannot use, which is worse than
    // one it cannot reach at all — it advertises itself and then does nothing.
    seg.setAttribute('role', 'link');
    seg.tabIndex = 0;
    seg.addEventListener('click', (event) => {
      event.stopPropagation();
      options.onActivate(segment, event);
    });
    seg.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
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
