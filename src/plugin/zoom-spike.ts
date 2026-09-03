/**
 * THROWAWAY — `outline-zoom` task 1, the mechanism spike (design D2).
 *
 * Hides everything outside a hard-coded line span with two block-level replace
 * decorations, registered ALONGSIDE the existing decoration sources rather than
 * instead of them: the question this answers is composition, not whether the
 * primitive works on its own. Nothing here is the zoom feature — there is no
 * anchor, no re-resolution, no scope, no confinement. The span is whatever the
 * plugin was told to hold, and the e2e spec tells it.
 *
 * Delete this module, its registration in `main.ts`, and its plugin field once
 * `docs/research/23-zoom-hiding-mechanism.md` records the verdict.
 *
 * Shaped after `backlinksFooterExtension`: a `StateField` providing
 * `EditorView.decorations`, recomputed from an external source on every
 * transaction. A `ViewPlugin` cannot do this at all — CodeMirror refuses
 * decorations that replace line breaks from a plugin source, and both ranges
 * here necessarily do.
 */

import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  showPanel,
  type DecorationSet,
  type Panel,
} from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type { ModeSource } from './keymap';

/** Inclusive 0-indexed source lines that stay VISIBLE. */
export interface ZoomSpikeSpan {
  readonly fromLine: number;
  readonly toLine: number;
  /**
   * Where the trailing range STOPS — the D12 comparison, measured rather than
   * argued. `doc-end` runs to `state.doc.length`, which is also where
   * `backlinks-footer` anchors its block widget. `last-line-start` stops at the
   * final line's start, leaving that line rendered, to see whether the widget
   * survives outside the replaced range.
   */
  readonly tailMode?: 'doc-end' | 'last-line-start';
}

export interface ZoomSpikeSource extends ModeSource {
  readonly zoomSpike: ZoomSpikeSpan | null;
}

const hidden = Decoration.replace({ block: true });

/**
 * The two ranges bracketing the visible span, in CM6 offsets.
 *
 * The head range runs from the document start to the START of the first visible
 * line, so it swallows the preceding lines together with the newlines that
 * terminate them. The tail range runs from the END of the last visible line —
 * before its own newline — to the document end, so it swallows that newline and
 * everything after. Getting either boundary wrong by one leaves a rendered
 * empty line where the replacement ends, which is the first artefact task 1.1
 * says to look for.
 *
 * An empty range is omitted rather than added: a zero-length block replacement
 * is not a no-op, it is a block widget of nothing.
 */
function ranges(state: EditorState, span: ZoomSpikeSpan): { from: number; to: number }[] {
  const doc = state.doc;
  const first = Math.max(1, Math.min(span.fromLine + 1, doc.lines));
  const last = Math.max(first, Math.min(span.toLine + 1, doc.lines));
  const out: { from: number; to: number }[] = [];
  const headTo = doc.line(first).from;
  if (headTo > 0) out.push({ from: 0, to: headTo });
  const tailFrom = doc.line(last).to;
  const tailTo = span.tailMode === 'last-line-start' ? doc.line(doc.lines).from : doc.length;
  if (tailFrom < tailTo) out.push({ from: tailFrom, to: tailTo });
  return out;
}

/**
 * A stand-in for the backlinks footer's own block widget, mounted at the END OF
 * THE VISIBLE SPAN rather than at `state.doc.length`. This is D12's option B,
 * asked as a mechanism question the spike can answer without editing
 * `backlinks-footer.ts`: does a block widget anchored just outside the trailing
 * replaced range still render?
 */
class SpikeFooterProbe extends WidgetType {
  toDOM(): HTMLElement {
    const el = createDiv({ cls: 'to-zoom-spike-footer' });
    el.textContent = 'Spike footer probe';
    return el;
  }
}

function compute(state: EditorState, source: ZoomSpikeSource): DecorationSet {
  const span = source.zoomSpike;
  if (!span) return Decoration.none;
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path || !source.isOutline(path)) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const parts = ranges(state, span);
  const head = parts.find((r) => r.from === 0);
  if (head) builder.add(head.from, head.to, hidden);
  // Ordered by `from`: the probe sits at the visible end, which is exactly the
  // trailing range's own `from`, so it must be added before it.
  const tail = parts.find((r) => r.from !== 0);
  if (tail) {
    builder.add(
      tail.from,
      tail.from,
      Decoration.widget({ widget: new SpikeFooterProbe(), side: -1, block: true }),
    );
    builder.add(tail.from, tail.to, hidden);
  }
  return builder.finish();
}

/** A minimal panel, only so 1.5 can answer whether `showPanel` renders inside
 * Obsidian's markdown view at all. Nothing to do with breadcrumbs. */
function spikePanel(): Panel {
  const dom = createDiv({ cls: 'to-zoom-spike-panel' });
  dom.textContent = 'Zoom spike panel';
  return { dom, top: true };
}

export function zoomSpikeExtension(source: ZoomSpikeSource): Extension {
  // `showPanel` takes a facet value, not a per-view callback that may decline,
  // so the conditional form is `showPanel.from(field, ...)` — the field is
  // already exactly "is the spike hiding anything in this view".
  return StateField.define<DecorationSet>({
    create: (state) => compute(state, source),
    update: (_value, tr) => compute(tr.state, source),
    provide: (f) => [
      EditorView.decorations.from(f),
      showPanel.from(f, (set) => (set.size > 0 ? spikePanel : null)),
    ],
  });
}
