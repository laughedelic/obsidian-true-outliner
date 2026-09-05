/**
 * Zoom's breadcrumb trail: one lineage row, rendered by the same primitive the
 * backlinks footer uses, mounted as a block widget at the START of the visible
 * range (`outline-zoom` design D10).
 *
 * Two things here replaced a first attempt, both from the same review note: the
 * trail must not invent visual primitives, and it must sit in the content flow
 * rather than above the note.
 *
 * A block widget, NOT a CM6 panel. `showPanel` mounts into `.cm-panels-top`,
 * which is a sibling of `.cm-scroller` — structurally above the note's title and
 * properties, and fixed there. A panel can therefore only ever read as a
 * toolbar, which is exactly how the first version read. The footer solved the
 * mirror-image problem by anchoring a block widget at the document's end; the
 * trail anchors one at the visible range's start, so the two bracket the zoomed
 * subtree in the same way and by the same mechanism.
 *
 * The row's LOOK is `lineage-row.ts`, shared verbatim with the footer. What a
 * segment does when activated is this surface's own: re-root the view on that
 * ancestor.
 */

import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type { OutlineNode } from '../model';
import { nodeLabel } from '../node-text';
import { nodeStartLine } from '../locate';
import { rowFact, splitPath, type LineageSegment } from './footer-model';
import { renderLineageContent } from './lineage-row';
import { segmentGlyph, separatorGlyph } from './backlinks-footer';
import { lineChrome, applyLineChrome, OWN_CHROME_CLASS } from './chrome-line';
import { parsedDoc } from './parsed-doc';
import { zoomScope } from './zoom-scope';
import { zoomCleared, zoomTo } from './zoom-state';
import type { ModeSource } from './keymap';
import type { LineageSeparator, SegmentIcons } from './mode-registry';

export const TRAIL_CLASS = 'to-zoom-trail';

/** The trail reads the SAME appearance settings the footer's own lineage rows
 * read, so one choice governs both surfaces. */
export interface ZoomTrailSource extends ModeSource {
  readonly backlinksSegmentIcons: SegmentIcons;
  readonly backlinksSeparator: LineageSeparator;
}

export const MODE_MARK_CLASS = 'to-zoom-out';

/**
 * The mark at the head of the trail: the zoom-OUT control, not a kind glyph.
 *
 * Outward arrows, because the mark names an ACTION where a frame or a page
 * would name a state — and because the shared row's own marker function answers
 * "what kind is this segment", which put the paragraph glyph on the file. The
 * trail supplies this through the same `marker` hook, so the row stays one
 * implementation and only its gutter differs.
 *
 * A size up from a node's mark. Every term follows the size — the box, the
 * pull-back, the half-icon shift onto the column, the optical `ex` correction —
 * so the size lives in one CSS class rather than being written four times here.
 */
function zoomOutMark(onActivate: () => void): HTMLElement {
  const el = createSpan({ cls: `to-decor-marker-icon ${MODE_MARK_CLASS}` });
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.setAttribute('aria-label', 'Zoom out fully');
  const svg = createSvg('svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  // Two groups, so the pair can push apart on hover without anything reflowing.
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  const arm = (cls: string, points: string, x1: string, y1: string, x2: string, y2: string) => {
    const g = createSvg('g');
    g.setAttribute('class', cls);
    const poly = createSvg('polyline');
    poly.setAttribute('points', points);
    for (const [k, v] of Object.entries(stroke)) poly.setAttribute(k, v);
    const line = createSvg('line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    for (const [k, v] of Object.entries(stroke)) line.setAttribute(k, v);
    // eslint-disable-next-line no-restricted-syntax -- detached DOM, built here
    g.append(poly, line);
    return g;
  };
  // eslint-disable-next-line no-restricted-syntax -- detached DOM, built here
  svg.append(
    arm('to-zoom-out-tl', '3,6.5 3,3 6.5,3', '3', '3', '6.75', '6.75'),
    arm('to-zoom-out-br', '13,9.5 13,13 9.5,13', '13', '13', '9.25', '9.25'),
  );
  // eslint-disable-next-line no-restricted-syntax -- detached DOM before mount
  el.appendChild(svg);
  el.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  });
  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  });
  return el;
}

/** The file itself, as the trail's first segment.
 *
 * The note's own name is IN the row rather than above it, because the zoomed
 * view hides Obsidian's inline title — so this is the only place it appears, and
 * naming it in both would be the duplication that hiding the title avoids. It is
 * also what makes the trail exist at all when the root is top-level and has no
 * ancestors: without it that case renders nothing, leaving no indication of
 * being zoomed and no way to click out. */
const FILE_SEGMENT_ID = -1;

function segmentsFor(fileName: string, trail: readonly OutlineNode[]): LineageSegment[] {
  return [
    { text: fileName, nodeId: FILE_SEGMENT_ID, kind: 'paragraph' },
    ...trail.map((node) => ({
      text: nodeLabel(node),
      nodeId: node.id,
      kind: node.kind,
    })),
  ];
}

class ZoomTrailWidget extends WidgetType {
  constructor(
    private readonly view: () => EditorView | null,
    private readonly modes: ZoomTrailSource,
    private readonly key: string,
  ) {
    super();
  }

  /** Rebuild only when the trail itself changed. The key is the segment texts,
   * so typing inside the zoomed subtree does not churn the row. */
  override eq(other: ZoomTrailWidget): boolean {
    return other.key === this.key;
  }

  override toDOM(view: EditorView): HTMLElement {
    // Chrome, not a rendering of the zoom root's line: the widget-line patch
    // reads this class and leaves everything but the theme's base margin alone.
    const el = createDiv({ cls: `${TRAIL_CLASS} ${OWN_CHROME_CLASS}` });
    const scope = zoomScope(view.state, this.modes);
    if (!scope) return el;

    const row = el.createDiv({ cls: 'to-backlinks-row' });
    row.dataset.kind = 'lineage';
    // The same chrome a footer lineage row takes, at depth 0 and with no guides:
    // the trail is one row about one chain, so there is no depth for a stripe to
    // describe.
    applyLineChrome(row, lineChrome(rowFact('paragraph', 0), { nativeBlocks: false }));

    const file = view.state.field(editorInfoField, false)?.file;
    const name = file ? splitPath(file.path).name : 'Note';
    const clear = (): void => {
      (this.view() ?? view).dispatch({ effects: zoomCleared.of(null) });
    };
    renderLineageContent(row, segmentsFor(name, scope.trail), {
      icons: this.modes.backlinksSegmentIcons,
      // ALWAYS separated, whatever the footer's setting says: the trail is a
      // single horizontal path where the join between two ancestors is the only
      // thing telling them apart, while a footer lineage row sits in a card
      // whose structure already groups it (design D10).
      separator: 'chevron',
      kind: scope.trail[0]?.kind ?? 'paragraph',
      // The gutter mark is the zoom-out control, not this segment's kind.
      marker: () => zoomOutMark(clear),
      glyph: segmentGlyph,
      separatorGlyph,
      onActivate: (segment) => {
        const target = this.view() ?? view;
        if (segment.nodeId === FILE_SEGMENT_ID) {
          clear();
          return;
        }
        // Resolved from the CURRENT parse rather than from the node captured
        // when the row was built: a crumb activated after an edit must re-root
        // on where that ancestor is now.
        const { doc } = parsedDoc(target.state.doc);
        const line = nodeStartLine(doc, segment.nodeId);
        if (line < 0) return;
        target.dispatch({ effects: zoomTo.of(target.state.doc.line(line + 1).from) });
      },
    });
    return el;
  }

  /** The trail is chrome, not text: its clicks are its own. */
  override ignoreEvent(): boolean {
    return true;
  }
}

function compute(state: EditorState, modes: ZoomTrailSource, view: () => EditorView | null): DecorationSet {
  const scope = zoomScope(state, modes);
  if (!scope) return Decoration.none;
  const file = state.field(editorInfoField, false)?.file;
  const name = file ? splitPath(file.path).name : 'Note';
  const key = segmentsFor(name, scope.trail)
    .map((s) => s.text)
    .join(' ');
  // `side: -1`, and the sign is not a preference. At a line's start a block
  // widget sorts above the line with a negative side and INSIDE it with a
  // positive one, which splits the root line in two and puts the trail between
  // the halves. The head hidden range stops one position short of this
  // position (`zoom-offsets`), so a widget here is outside it either way.
  const at = state.doc.line(scope.cover.start.line + 1).from;
  return Decoration.set([
    Decoration.widget({ widget: new ZoomTrailWidget(view, modes, key), side: -1, block: true }).range(at),
  ]);
}

export function zoomTrailExtension(modes: ZoomTrailSource): Extension {
  let live: EditorView | null = null;
  const field = StateField.define<DecorationSet>({
    create: (state) => compute(state, modes, () => live),
    update: (_value, tr) => compute(tr.state, modes, () => live),
    provide: (f) => EditorView.decorations.from(f),
  });
  return [
    field,
    // The widget needs a view to dispatch into after an edit has replaced the
    // one it was built with; `toDOM`'s own argument is the view at BUILD time.
    EditorView.updateListener.of((update) => {
      live = update.view;
    }),
  ];
}
