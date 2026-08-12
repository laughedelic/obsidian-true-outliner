/**
 * CM6 adapter for the outline keyboard grammar: a high-precedence keymap,
 * gated per keypress on outline mode via the public editorInfoField. All
 * decisions live in the pure grammar module.
 *
 * Also carries the progressive-select-all Mod-A handler (design.md, that
 * change): same precedence tier and outline-mode gating as the grammar
 * handlers above, but its own pure decision module (`select-all-ladder.ts`)
 * rather than `grammar.ts`.
 *
 * And the node-selection-extension Shift+Arrow handlers, on the same terms
 * again with `select-extend.ts` as their decision module. The two selection
 * features share only the cover geometry beneath them and never each other:
 * both read the CURRENT selection and nothing about how it was produced, so
 * a selection reached by either behaves identically under the other (that
 * change's design.md D10).
 *
 * And the content-space-caret motion handlers (content-space-caret change,
 * design.md D1/D3-D5): ArrowLeft/Right/Up/Down/Home/End, computing their
 * target directly from the parsed tree (`../caret.ts`) rather than
 * correcting a position after a stock command produced it. The ARROW handlers
 * decline (returns `false`) on a non-empty selection, letting native collapse
 * run — measured, that lands on content, and it is NOT rescued by the filter
 * afterward as an earlier version of this comment claimed: a native collapse
 * carries no `userEvent` and so gets marker resolution only. Home/End cannot
 * decline for exactly that reason; see `makeHomeEndHandler`. Handlers also
 * decline — and dispatches with
 * no explicit `userEvent`, the same convention `makeSelectAllHandler`
 * already uses for its own selection-only dispatch: `classify.ts` treats an
 * annotation-less transaction as `programmatic` (D2's "absence is the
 * load-bearing convention"), so the target these handlers compute is never
 * run through selection ESCALATION a second time. It does still pass
 * through the filter's cursor placement resolution
 * (`resolveForeignCursors`, added so Obsidian's own unannotated cursor
 * moves can't land on chrome — Q23), which is a harmless identity here:
 * these targets are already addressable by construction.
 */

import {
  ChangeSet,
  EditorSelection,
  Prec,
  type EditorState,
  type Extension,
  type SelectionRange,
  type Text,
} from "@codemirror/state";
import { Direction, EditorView, keymap } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { Notice, editorInfoField } from "obsidian";
import { planKey, type GrammarKey } from "./grammar";
import { nextRungs } from "../select-all-ladder";
import { extendSelections, type ExtendDirection } from "../select-extend";
import { coveredForestOf } from "../escalate";
import {
  contentBoundaryCh,
  resolvePlacement,
  nodeContentEnd,
  nodeContentStart,
  planHorizontal,
} from "../caret";
import type { LinePos } from "../line-pos";
import type { OutlineDoc } from "../model";
import { nodeAtLine, nodeStartLine } from "../locate";
import { linePosToOffset, offsetToLinePos, toLineRange } from "./cm-pos";
import { parsedDoc } from "./parsed-doc";
import { resolvedOutline } from "./decorate";
import { isNestedEditor } from "./nested-editor";
import type { EditorChange } from "./dispatch";
import {
  abandonEdit,
  advanceFromEmptyPlace,
  cancelOnDelete,
  provisionalCleanup,
} from "./provisional-cleanup";

export interface ModeSource {
  isOutline(path: string): boolean;
}

function makeHandler(modes: ModeSource, key: GrammarKey) {
  return (view: EditorView): boolean => {
    if (!outlinePathOf(modes, view)) return false;

    // Multi-cursor: decline (design D7). This handler plans from
    // `selection.main` alone and dispatches ONE cursor, so acting would
    // silently discard every other range — with no document change to undo,
    // since a selection change is not a document change. The same reason
    // `soleCursor` guards the motion handlers. Stock behavior handles every
    // range, and the enforcement funnel still sees whatever it produces.
    if (view.state.selection.ranges.length !== 1) return false;

    // Only Enter and Shift+Enter act on a non-empty selection (design D7);
    // every other key keeps planning from the selection HEAD exactly as before.
    // That distinction is load-bearing: with a multi-node block cover the head
    // is the cover's END, so planning Tab from `from` instead would silently
    // change which node it indents, and would feed the mapped-cursor rule a
    // different position than the one its gap-line fallback was written for.
    //
    // `from`/`to` are already ordered by CM6, so a backward selection needs no
    // normalization. With an empty selection they equal the head, and `planKey`
    // takes its ordinary cursor path either way.
    const sel = view.state.selection.main;
    const actsOnSelection = !sel.empty && (key === 'split' || key === 'continue');
    const planFrom = actsOnSelection ? sel.from : sel.head;
    const fromLine = view.state.doc.lineAt(planFrom);
    const toLine = view.state.doc.lineAt(actsOnSelection ? sel.to : planFrom);
    // Public CM6 facet — Obsidian sets it from its own "Indent using tabs"
    // editor setting, so reading it here respects that preference without
    // touching any Obsidian-private API (confirmed live: toggling the
    // setting flips this facet's value immediately).
    const outcome = planKey(
      view.state.doc.toString(),
      {
        line: fromLine.number - 1,
        ch: planFrom - fromLine.from,
      },
      key,
      view.state.facet(indentUnit),
      {
        line: toLine.number - 1,
        ch: (actsOnSelection ? sel.to : planFrom) - toLine.from,
      },
    );

    if (outcome === null) {
      // The grammar declines on a gap line. When that line is an empty place a
      // structural keypress just made, Enter means "not here": move past it and
      // cancel the keypress, instead of falling through to a stock newline that
      // widens the gap on every press.
      if (key === "split" && advanceFromEmptyPlace(view)) return true;
      return false;
    }
    if ("notice" in outcome) {
      new Notice(outcome.notice, 1500);
      return true; // consume: stock behavior must not fire on a rejected op
    }
    const doc = view.state.doc;
    const toOffsets = (changes: readonly EditorChange[], target: Text) =>
      changes.map((change) => ({
        from: target.line(change.from.line + 1).from + change.from.ch,
        to: target.line(change.to.line + 1).from + change.to.ch,
        insert: change.text,
      }));
    const changes = toOffsets(outcome.plan.changes, doc);
    // The plan's removal edit rides along, converted against the document this
    // transaction PRODUCES — the coordinate space the plan states it in, which
    // is why the conversion needs the resulting text rather than the current
    // one. `provisional-cleanup` cannot derive it from the change set: a
    // keypress that removed a selection first fuses both steps into one
    // replacement there.
    //
    // Building that resulting text is the only reason to apply the change set
    // twice, so it happens only for the operations that state a removal —
    // indent and the moves state none, and they are the keys held down in runs.
    const annotations = outcome.plan.abandon
      ? abandonEdit.of(toOffsets(outcome.plan.abandon, ChangeSet.of(changes, doc.length).apply(doc)))
      : undefined;
    view.dispatch({
      changes,
      selection: { anchor: outcome.plan.selection },
      userEvent: outcome.plan.userEvent,
      scrollIntoView: true,
      ...(annotations ? { annotations } : {}),
    });
    return true;
  };
}

/**
 * True when this press is NOT an outline gesture, so stock extension should own
 * it (design.md D11). Two cases: the range has no node jurisdiction at all —
 * the preamble — or it is a plain character range inside ONE node's own content
 * lines that this press would keep there.
 *
 * The node's own content lines, not its subtree and not its trailing gap: the
 * gap is chrome between nodes, so reaching it is already a boundary crossing
 * and the cover sequence owns it.
 *
 * An exact cover is rejected EXPLICITLY rather than left to the content-line
 * bounds. An earlier version relied on those bounds, reasoning that a cover
 * always reaches a node's gap or beyond — false for a leaf that owns no gap,
 * such as a final code fence, whose cover IS exactly its content lines
 * (measured: `gap=0`, cover `2..4`, content lines `2..4`). Such a cover would
 * be read as text motion, and the opposite press would fall through to stock
 * extension and SHRINK inside the node instead of stepping the sequence.
 */
function notAnOutlineGesture(
  view: EditorView,
  outlineDoc: ReturnType<typeof parsedDoc>['doc'],
  range: SelectionRange,
  direction: ExtendDirection,
): boolean {
  const doc = view.state.doc;
  // Already a cover: the sequence's business, whatever its line bounds.
  if (!range.empty && coveredForestOf(outlineDoc, toLineRange(doc, range))) return false;

  const anchorLine = doc.lineAt(range.anchor).number - 1;
  const node = nodeAtLine(outlineDoc, anchorLine);
  // No jurisdiction — a preamble range was never ours, and is planned the same
  // way a text range is so a mixed selection still moves it.
  if (!node) return true;
  if (nodeAtLine(outlineDoc, doc.lineAt(range.head).number - 1) !== node) return false;

  const first = nodeStartLine(outlineDoc, node.id);
  const last = first + node.lines.length - 1;
  if (last >= doc.lines) return false; // defensive: stale parse against the live doc
  const from = doc.line(first + 1).from;
  const to = doc.line(last + 1).to;
  if (range.from < from || range.to > to) return false;

  // Where stock extension would put the head, wrapping accounted for.
  const moved = view.moveVertically(range, direction === 'down');
  if (moved.head < from || moved.head > to) return false;

  // ...and it must genuinely reach ANOTHER ROW. At a document edge CM6 clamps
  // the head to the line's own start or end instead of moving, which lands
  // inside the node and read as row motion — so pressing Up in the first node,
  // or Down in a final gapless one, fell through to stock extension and the
  // anchor node's first cover became unreachable in that direction (measured:
  // `0,0..0,5` and `2,5..2,10` character ranges where a cover was required).
  // There is nothing beyond the edge, so that is a boundary, not motion.
  // Coordinates rather than line numbers because rows are visual: a wrapped
  // source line holds several.
  const fromTop = view.coordsAtPos(range.head)?.top;
  const toTop = view.coordsAtPos(moved.head)?.top;
  if (fromTop != null && toTop != null) return fromTop !== toTop;

  // No coordinates: the position is outside the rendered viewport, which a
  // secondary cursor in a multi-cursor selection easily is. Fall back to SOURCE
  // lines. That still catches the clamp — clamping cannot cross a source line —
  // so a document edge is still read as a boundary, and an offscreen cursor
  // stepping between the lines of a multi-line node still keeps its text
  // motion. It is only wrong for an offscreen cursor inside a WRAPPED single
  // source line, which it reads as a boundary. Choosing a fallback direction is
  // unavoidable here; this one preserves D11 for the cases that have a source
  // line to move to, rather than snapping every unrendered range to a cover.
  return doc.lineAt(moved.head).number !== doc.lineAt(range.head).number;
}

/**
 * The outline these handlers act on: the raw parse, unless a PROVISIONAL POSITION
 * is open and bisected a node, in which case the tree that position stands for
 * (`resolvedOutline`).
 *
 * Measured (the a-position-does-not-split-its-node change's Findings): against
 * the raw parse, a bisected node reads as two, so node-granular extension covers
 * only the half above the position wherever the tail becomes a SIBLING, and
 * select-all's content rung — a node's OWN lines — covers half in every shape,
 * list and paragraph alike.
 *
 * Gated on the cheap tests first (one empty cursor, on a blank line) so an
 * ordinary press costs a `trim()` rather than a second parse. A position needs a
 * single empty cursor by definition, so a multi-range selection keeps the raw
 * parse without a special case.
 */
function outlineFor(state: EditorState): OutlineDoc {
  const sel = state.selection.main;
  if (sel.empty && state.selection.ranges.length === 1) {
    const line = state.doc.lineAt(sel.head);
    if (line.text.trim() === "") {
      const resolved = resolvedOutline(
        state.doc.toString(),
        line.number - 1,
        sel.head - line.from,
      );
      if (resolved) return resolved;
    }
  }
  return parsedDoc(state.doc).doc;
}

/**
 * Shift+ArrowUp/Shift+ArrowDown (node-selection-extension): intercepts
 * keyboard extension in outline mode and replaces every range with the next
 * cover along `select-extend.ts`'s sequence — one node per press, in both
 * directions, in every document shape.
 *
 * Shaped after `makeSelectAllHandler` above, NOT after the motion handlers'
 * `soleCursor` convention (design.md D7). Those decline on multiple ranges
 * because they plan from `selection.main` alone and would silently discard
 * the rest; this handler plans every range, so declining would be a
 * regression rather than a safeguard. A range with nowhere to go is left in
 * place while others still advance (D4: each range walks its own sequence,
 * with no forced common step).
 *
 * The key falls through to stock extension only when NO range is an outline
 * gesture — every one is either plain text motion inside a node or outside any
 * node's jurisdiction. A selection that IS ours but has run out of sequence
 * consumes the key instead; see below for why declining there is wrong.
 *
 * At the sequence's end the key IS consumed without dispatching, which is what
 * "the selection remains unchanged" requires. Declining there instead looks
 * safer and is not: stock extension would move a backward cover's head inward
 * and shrink it. Declining is reserved for ranges that were never ours — the
 * preamble, and text motion inside one node.
 *
 * The dispatch carries no `userEvent`, the same convention the Mod-A handler
 * uses — `classify.ts` reads an annotation-less transaction as
 * `programmatic`, so these covers never run through selection ESCALATION a
 * second time. They are exact covers by construction, so escalation would be
 * an identity anyway; the annotation choice keeps it from being asked.
 */
function makeExtendHandler(modes: ModeSource, direction: ExtendDirection) {
  return (view: EditorView): boolean => {
    if (!outlinePathOf(modes, view)) return false;

    const doc = view.state.doc;
    const outlineDoc = outlineFor(view.state);

    // A press that only moves within one node's own text is ordinary text
    // selection, not an outline gesture (design.md D11). Decided HERE rather
    // than in `select-extend.ts` because it depends on VISUAL lines:
    // Shift+Arrow moves by rendered row, and a long paragraph that soft-wraps
    // is a single SOURCE line spanning several rows. Answering it from source
    // lines alone got the common case backwards — a wrapped paragraph looked
    // single-line and was block-selected on the first press, while a paragraph
    // genuinely broken across two source lines behaved correctly.
    // `moveVertically` is the view's own answer to "where would the caret go",
    // wrapping included, and is what stock line-wise extension uses too.
    const sel = view.state.selection;
    const stock = sel.ranges.map((range) =>
      notAnOutlineGesture(view, outlineDoc, range, direction),
    );

    // Not one outline gesture among them: decline outright, so stock extension
    // runs with all of its own bookkeeping rather than our re-implementation.
    if (stock.every((yes) => yes)) return false;

    const before = sel.ranges.map((range) => toLineRange(doc, range));
    const next = extendSelections(outlineDoc, before, direction);

    // Every range is ours and every one has run out of sequence. CONSUME the
    // key: the selection must stay unchanged, and falling through would let
    // stock extension move a backward cover's head inward and SHRINK it.
    //
    // The `!stock.some` guard is not redundant with the early return above. A
    // MIXED selection reaches here — say a preamble cursor beside an outline
    // range at its sequence end — and `extendSelections` yields `null` for
    // both, since it reports "nowhere to go" and "not in jurisdiction" the same
    // way. Consuming then would freeze the stock-owned range instead of giving
    // it its vertical motion. An earlier comment here claimed such ranges could
    // not reach this branch; they can, whenever the outline ranges beside them
    // are exhausted.
    if (!stock.some((yes) => yes) && next.every((range) => range === null)) return true;

    // Ranges are planned INDEPENDENTLY, so a mixed selection does not force one
    // reading on all of them: a cursor inside a multi-line node keeps
    // character-level extension while another that would cross a boundary steps
    // the cover sequence. An earlier all-or-nothing gate made a single crossing
    // range block-extend every other one, silently overriding D11 for ranges
    // that had already answered "this is text". `moveVertically` returns a
    // range carrying its own goal column, so vertical motion still tracks the
    // column across presses the way stock extension does.
    const ranges = sel.ranges.map((range, i) => {
      if (stock[i]) {
        // `moveVertically` is MOTION, not extension — it returns where a
        // cursor would land, so using it directly collapsed the range. Keep
        // the anchor and take only the head, carrying the goal column so
        // vertical motion tracks the column across presses. This is exactly
        // what `@codemirror/commands`' own `extendSel` does.
        const moved = view.moveVertically(range, direction === 'down');
        return EditorSelection.range(range.anchor, moved.head, moved.goalColumn);
      }
      const target = next[i];
      if (!target) return range;
      return EditorSelection.range(
        linePosToOffset(doc, target.anchor),
        linePosToOffset(doc, target.head),
      );
    });
    view.dispatch({
      selection: EditorSelection.create(ranges, sel.mainIndex),
      scrollIntoView: true,
    });
    return true;
  };
}

/**
 * Progressive Select All (design.md D2/D3): intercepts Mod-A in outline
 * mode and, for every range in the current selection, replaces it with the
 * next rung of `select-all-ladder.ts`'s ladder. Returns `false` — letting
 * native Select All run — when every range has no further rung (already at
 * the ladder's top, or outside any node's jurisdiction), so the ladder's
 * own top is a pass-through to stock whole-document behavior rather than a
 * hand-computed duplicate of it. A range with no further rung but where
 * SOME other range in the selection does still climb is left in place
 * (unchanged), not swept into whole-document selection — each range's own
 * ladder is independent (design.md D5).
 */
function makeSelectAllHandler(modes: ModeSource) {
  return (view: EditorView): boolean => {
    if (!outlinePathOf(modes, view)) return false;

    const doc = view.state.doc;
    const outlineDoc = outlineFor(view.state);
    const before = view.state.selection.ranges.map((range) =>
      toLineRange(doc, range),
    );
    const next = nextRungs(outlineDoc, before);
    if (next.every((range) => range === null)) return false;

    const ranges = before.map((original, i) => {
      const escalated = next[i];
      const target = escalated ?? original;
      return EditorSelection.range(
        linePosToOffset(doc, target.anchor),
        linePosToOffset(doc, target.head),
      );
    });
    view.dispatch({
      selection: EditorSelection.create(ranges, view.state.selection.mainIndex),
      scrollIntoView: true,
    });
    return true;
  };
}

/**
 * The outline-mode note this view is editing, or `undefined` to decline.
 *
 * Excludes NESTED editors. Obsidian mounts a table cell being edited as its own
 * tiny `EditorView`, `registerEditorExtension` installs this keymap there too,
 * and `editorInfoField` resolves to the same outer note — so without the
 * DOM-ancestry check a handler applies outline rules to a document that is only
 * the cell's raw text.
 *
 * EVERY binding in `grammarExtension` must gate through this, not just the
 * motion ones. That was the original defect and it has now bitten twice: the
 * structural keys (Tab/Shift-Tab/Alt-Arrow/Enter) and Mod-A each kept a private
 * `editorInfoField` + `isOutline` check that looked equivalent and was not.
 * Measured inside `.cm-embed-block`: Alt-ArrowUp raised the "Nothing above to
 * move past." outline rejection; Mod-A on a cell reading `- word` selected only
 * `word`, treating the user's literal text as a list marker; Home, Right and
 * ArrowDown all reported invoked AND consumed.
 */
function outlinePathOf(
  modes: ModeSource,
  view: EditorView,
): string | undefined {
  if (isNestedEditor(view)) return undefined;
  const info = view.state.field(editorInfoField, false);
  const path = info?.file?.path;
  return path && modes.isOutline(path) ? path : undefined;
}

/**
 * Dispatches a cursor position. A plain dispatch on purpose: motion
 * handlers do NOT defend their own landing position afterward.
 *
 * Obsidian core can move the caret again right after ours lands — measured
 * on a checkbox list item, where its widget mount issues a separate,
 * unannotated selection-only dispatch back to column 0, onto the marker
 * (docs/research/04 Q25). That correction belongs to the transaction
 * filter, which sees every selection change regardless of origin, not to a
 * re-assert timer here: an earlier version of this helper re-dispatched on
 * a later frame, which is inherently a race — widened to cover more cases
 * it silently reverted a genuinely later real click back to this
 * dispatch's own target, and narrowed to one frame it did not reliably
 * win at all. `resolveForeignCursors` in transaction-filter.ts closes the
 * hole at the layer that owns the addressable-position invariant.
 */
function dispatchCursor(
  view: EditorView,
  offset: number,
  scrollIntoView = true,
): void {
  view.dispatch({ selection: EditorSelection.cursor(offset), scrollIntoView });
}

/**
 * The single empty range every motion handler below is written against, or
 * `undefined` to decline.
 *
 * Declining on MULTIPLE ranges is load-bearing, not defensive: the handlers
 * plan from `selection.main` alone while `dispatchCursor` replaces the whole
 * selection with one cursor, so under multi-cursor a bound key would silently
 * discard every non-main range — destroying editing state the user built up,
 * with no undo entry to show for it since a selection change is not a document
 * change. Falling through to stock CM6 keeps native multi-cursor motion
 * working, and the transaction filter still resolves each resulting range's
 * placement, so the addressable-position invariant holds either way. Planning
 * every range properly is a real feature, not a bug fix; until then, decline.
 */
function soleCursor(view: EditorView): SelectionRange | undefined {
  const sel = view.state.selection;
  if (sel.ranges.length !== 1) return undefined;
  return sel.main.empty ? sel.main : undefined;
}

/**
 * ArrowLeft/ArrowRight (design.md D4): declines on a non-empty selection —
 * native collapse runs, and the resulting cursor is caught by the
 * transaction filter's placement resolution — and on `planHorizontal`
 * returning `null` (a document boundary, or the preamble), letting the key
 * fall through to stock CM6, which is already correct in both cases (a
 * true no-op at the document edge, or entering the preamble, D10).
 */
/**
 * Dev-build-only probe: reports every bound key this keymap is ASKED to
 * handle, and whether it consumed it. Wired to a status bar readout by
 * main.ts (dev installs only, see `showDevBuildStamp`); inert otherwise.
 *
 * It exists because "our handler ran and computed the wrong target" and "our
 * handler was never invoked because something else claimed the key" are
 * indistinguishable from the outside — both just look like wrong caret
 * behavior. Guessing between them cost several rounds of rewriting logic that
 * was never running (docs/research/04 Q27), so the distinction is now
 * observable from inside the app rather than inferred. `invoked` counts what
 * CM6 routed here; `consumed` counts what we returned true for. A key that
 * never appears at all was never routed to this keymap.
 */
type MotionProbe = (key: string, consumed: boolean) => void;
let motionProbe: MotionProbe | undefined;

export function setMotionProbe(probe: MotionProbe | undefined): void {
  motionProbe = probe;
}

/** Wraps a bound handler so every invocation is reported before its result is
 * returned — placed OUTSIDE the outline-mode gate on purpose, so "invoked but
 * declined" stays distinguishable from "never invoked". */
function probed(key: string, run: (view: EditorView) => boolean) {
  return (view: EditorView): boolean => {
    const consumed = run(view);
    motionProbe?.(key, consumed);
    return consumed;
  };
}

function makeHorizontalHandler(modes: ModeSource, direction: "left" | "right") {
  return (view: EditorView): boolean => {
    if (!outlinePathOf(modes, view)) return false;
    const sel = soleCursor(view);
    if (!sel) return false;

    const doc = view.state.doc;
    const { doc: outlineDoc } = parsedDoc(doc);
    const pos = offsetToLinePos(doc, sel.head);
    const target = planHorizontal(outlineDoc, pos, direction);
    if (target === null) return false; // preamble: stock CM6
    // Consumed, deliberately: at a document edge there is nowhere to go, and
    // letting the key through would step onto a non-addressable line for the
    // filter to undo.
    if (target === 'noop') return true;

    // The planner decides WHETHER this press crosses a boundary; for an ordinary
    // step that stays on the same line, CM6 decides WHERE.
    //
    // `planHorizontal` works in logical offsets, and logical order is not visual
    // order: inside an RTL or mixed-direction run, ArrowLeft can mean "later in
    // the string". `view.moveByChar` is bidi-aware (and grapheme-aware) — this
    // handler replaced native motion, so it has to reproduce native semantics
    // rather than approximate them. Same lesson as the surrogate-pair bug one
    // review round earlier, one layer further down.
    //
    // Boundary crossings stay with the planner: which node or line comes next in
    // CONTENT space is a question about the parsed tree, not about glyph order,
    // and CM6 cannot answer it.
    //
    // KNOWN LIMITATION, filed in docs/research/13: the planner decides whether a
    // press crosses using LOGICAL position, so in an RTL run the crossing fires
    // at the logical line start/end rather than the visual one. Within-line
    // motion — the common case — is now native and correct; making crossings
    // bidi-correct means reworking what "the next content position" means for
    // mixed-direction text, which is a design question, not a review fix.
    if (target.line === pos.line) {
      // The LTR/RTL flip lives in the COMMAND, not in `moveByChar` — measured:
      // `moveByChar(range, true)` returns the same offset as a logical +1 even
      // where `textDirectionAt` reports RTL, exactly as CM6's own
      // `cursorCharLeft` computes `forward` from the direction at the cursor and
      // then calls `moveByChar`. Without this line the delegation changed
      // nothing, which a negative-control run proved before it shipped.
      const ltr = view.textDirectionAt(sel.head) === Direction.LTR;
      const forward = direction === "right" ? ltr : !ltr;
      const nativePos = offsetToLinePos(doc, view.moveByChar(sel, forward).head);
      if (nativePos.line === pos.line) {
        const node = nodeAtLine(outlineDoc, pos.line);
        const lineIndex = node ? pos.line - nodeStartLine(outlineDoc, node.id) : 0;
        const boundary = node ? contentBoundaryCh(node, node.lines[lineIndex] ?? "") : 0;
        // Never let a visual step land inside chrome; `max` is safe rightward too,
        // since native motion cannot go below the boundary in that direction.
        const ch = Math.max(nativePos.ch, boundary);
        dispatchCursor(view, linePosToOffset(doc, { line: pos.line, ch }));
        return true;
      }
      // Native motion left the line although the planner did not expect it to:
      // fall through and trust the planner.
    }

    dispatchCursor(view, linePosToOffset(doc, target));
    return true;
  };
}

/**
 * ArrowUp/ArrowDown (design.md D3): one wrap-aware step via CM6's own
 * `moveVertically`, then — when that lands on a gap line — CONTINUE by
 * walking raw lines (never wrapped, so plain arithmetic suffices) until
 * real content or the document edge; or, when it lands on content whose
 * column the goal merely missed, CLAMP within that line (a marker prefix).
 * At a document edge reached mid-walk, lands on that node's own content
 * boundary (D3's "toward the document edge" case) instead of its gap.
 *
 * Cross-keypress memory (design.md D3's risk) tracks TWO values, in two
 * DIFFERENT coordinate spaces that measured NOT interchangeable:
 * `SelectionRange.goalColumn` (fed back into `moveVertically`, whose own
 * internal frame it's already in) and a real page-pixel X, read via
 * `coordsAtPos`/used via `posAtCoords` for the gap-walk's landing column
 * (measured: `goalColumn`'s numeric value is NOT a `posAtCoords`-compatible
 * X — mixing them resolved every column to 0). Neither survives a real
 * `view.dispatch()` on its own (an explicit `goalColumn` reads back
 * `undefined` immediately after dispatching one), so this handler keeps
 * its own view-scoped memory for both rather than relying on CM6 state to
 * carry either across separate keypresses (native arrow keys avoid this
 * because `@codemirror/commands`' own cursor commands track continuation
 * through a similar mechanism of their own, outside state). Keyed by
 * `head` so a press that DIDN'T come from this same uninterrupted
 * vertical-motion chain (a click, typing, anything else) is correctly
 * treated as fresh, matching native goal-column reset-on-interruption
 * behavior.
 */
const verticalGoalColumn = new WeakMap<
  EditorView,
  {
    readonly head: number;
    readonly goalColumn: number;
    readonly pixelX: number;
    readonly tick: number;
  }
>();

/**
 * Counts every selection or document change per view, so the vertical handler
 * can tell "the caret is where my last press left it" from "this is still the
 * same uninterrupted chain".
 *
 * Matching the head alone is not enough, and the difference is reachable: move
 * from column 7 down onto a short line (landing at column 2), then press Left
 * and Right. The head is back at the remembered offset, so a head-only check
 * calls the next Down a continuation and restores column 7 — when the user's
 * last horizontal move should have started a fresh column-2 chain. Native
 * goal-column tracking resets on any non-vertical motion; this reproduces that.
 */
const viewTick = new WeakMap<EditorView, number>();

function tickOf(view: EditorView): number {
  return viewTick.get(view) ?? 0;
}

const tickCounter = EditorView.updateListener.of((update) => {
  if (update.docChanged || update.selectionSet) {
    viewTick.set(update.view, tickOf(update.view) + 1);
  }
});

function makeVerticalHandler(modes: ModeSource, forward: boolean) {
  return (view: EditorView): boolean => {
    if (!outlinePathOf(modes, view)) return false;
    const sel = soleCursor(view);
    if (!sel) return false;

    const doc = view.state.doc;
    const { doc: outlineDoc } = parsedDoc(doc);

    const remembered = verticalGoalColumn.get(view);
    // Both conditions matter: the head proves the caret has not moved, the tick
    // proves nothing else happened in between (see `viewTick`).
    const fresh =
      !remembered ||
      remembered.head !== sel.head ||
      remembered.tick !== tickOf(view);
    const seed: SelectionRange = fresh
      ? sel
      : EditorSelection.cursor(
          sel.head,
          undefined,
          undefined,
          remembered.goalColumn,
        );
    const pixelX = fresh
      ? (view.coordsAtPos(sel.head)?.left ?? 0)
      : remembered.pixelX;

    // ONE step via `view.moveVertically` at its DEFAULT distance
    // (design.md D3) -- CM6's own accurate, wrap-aware primitive, called
    // exactly once. It moves exactly one VISUAL row, whether that's still
    // within a soft-wrapped logical line (an earlier raw-line-number-based
    // rewrite broke this -- see docs/research/04 Q24 -- always jumping a
    // whole raw line and skipping the wrapped continuation of the CURRENT
    // line entirely) or across a block that renders taller than a plain
    // paragraph line. Measured: calling it a SECOND time chained off its
    // own in-memory (never-dispatched) result is unreliable near a
    // widget-rendered single-line atom (a horizontal rule's own line was
    // skipped entirely when chained this way, even though it's reached
    // correctly by two separate, individually-dispatched real keypresses)
    // -- so "continue past a gap" below never calls it a second time. Gap
    // lines are always exactly one row (never wrapped), so walking them
    // with plain raw-line arithmetic is both simpler and reliable.
    const moved = view.moveVertically(seed, forward);
    if (moved.head === sel.head) return false; // no further row in this direction
    const goalColumn = moved.goalColumn ?? 0;

    const dispatchAt = (pos: LinePos): void => {
      const offset = linePosToOffset(doc, pos);
      dispatchCursor(view, offset);
      // Read the tick AFTER dispatching: `view.dispatch` applies synchronously,
      // so the listener has already counted our own change by now.
      verticalGoalColumn.set(view, {
        head: offset,
        goalColumn,
        pixelX,
        tick: tickOf(view),
      });
    };

    const startLine = doc.lineAt(sel.head).number - 1;
    const movedLine = doc.lineAt(moved.head).number - 1;
    if (movedLine === startLine) {
      // `moveVertically` stayed on the SAME raw line: this can only be a
      // soft wrap (a different VISUAL row of one logical line), which is
      // exactly the case its own geometry is trusted for — an earlier
      // raw-line-number-based rewrite broke this entirely (see
      // docs/research/04 Q24), always jumping a whole raw line and
      // skipping the wrapped continuation of the CURRENT line.
      const movedPos = offsetToLinePos(doc, moved.head);
      const movedNode = nodeAtLine(outlineDoc, movedPos.line);
      if (!movedNode) return false; // landed in the preamble: out of jurisdiction
      const movedLineIndex =
        movedPos.line - nodeStartLine(outlineDoc, movedNode.id);
      const lineText = movedNode.lines[movedLineIndex] ?? "";
      const boundary = contentBoundaryCh(movedNode, lineText);
      dispatchAt(
        movedPos.ch < boundary
          ? { line: movedPos.line, ch: boundary }
          : movedPos,
      );
      return true;
    }

    // `moveVertically` crossed to a genuinely DIFFERENT raw line: measured,
    // its own landing line is NOT trusted here — a single default-distance
    // step can overshoot multiple rows of a widget-rendered multi-row block
    // (a table's own internal per-row geometry isn't what `moveVertically`
    // steps by; a fully-rendered table crossed into from outside landed on
    // its LAST row instead of its first, in one step). Walk raw lines
    // (always exactly one row each, never wrapped) from the line
    // IMMEDIATELY adjacent to the ORIGINAL position instead — deterministic
    // from the parsed tree alone, independent of `moveVertically`'s own
    // pixel geometry — until real content or the document edge.
    let line = startLine;
    let node = nodeAtLine(outlineDoc, startLine);
    if (!node) return false; // preamble
    for (let guard = 0; guard < doc.lines + 1; guard++) {
      const nextLine = forward ? line + 1 : line - 1;
      if (nextLine < 0 || nextLine >= doc.lines) {
        // Document edge reached mid-walk: land on this node's own content
        // boundary rather than leaving the caret on its gap.
        dispatchAt(
          forward
            ? nodeContentEnd(outlineDoc, node)
            : nodeContentStart(outlineDoc, node),
        );
        return true;
      }
      const nextNode = nodeAtLine(outlineDoc, nextLine);
      if (!nextNode) return false; // walked into the preamble
      line = nextLine;
      node = nextNode;

      const lineIndex = line - nodeStartLine(outlineDoc, node.id);
      if (lineIndex >= node.lines.length) continue; // still a gap (a run of several blank lines)

      // Real content found, on a line `moveVertically` never itself
      // pointed at -- resolve its column via real rendered coordinates,
      // targeting the FIRST visual row when entering from above (forward)
      // or the LAST when entering from below (backward), not an average
      // across however many rows this raw line happens to wrap into.
      // `lineBlockAt`'s `top`/`height` are DOCUMENT-relative, while
      // `coordsAtPos`/`posAtCoords` are viewport-relative; `documentTop` is
      // the conversion CM6 itself documents for this exact pairing.
      const lineObj = doc.line(line + 1);
      const block = view.lineBlockAt(lineObj.from);
      const rowOffset = view.defaultLineHeight / 2;
      const y = forward
        ? view.documentTop + block.top + rowOffset
        : view.documentTop + block.top + block.height - rowOffset;
      // `precise: false` on purpose. The default lookup returns null for a line
      // outside the rendered viewport, which a long gap walk can easily target,
      // and the old `?? lineObj.to` fallback then sent the caret to that line's
      // END — silently discarding the goal column this whole mechanism exists to
      // preserve. CM6's imprecise mode returns an offscreen ESTIMATE instead,
      // which is approximate in exactly the dimension that is already
      // approximate (a pixel column) and never null.
      const rawOffset = view.posAtCoords({ x: pixelX, y }, false);
      const rawPos = offsetToLinePos(
        doc,
        Math.min(Math.max(rawOffset, lineObj.from), lineObj.to),
      );

      const lineText = node.lines[lineIndex] ?? "";
      const boundary = contentBoundaryCh(node, lineText);
      dispatchAt(
        rawPos.ch < boundary ? { line: rawPos.line, ch: boundary } : rawPos,
      );
      return true;
    }
    return false;
  };
}

/**
 * Home/End (design.md D5, as revised in docs/research/04 Q26): ONE rung.
 * Home goes to the caret's own RAW LINE's content start, End to its end, and
 * a further press changes nothing.
 *
 * No escalation, and deliberately not wrap-aware. Two earlier designs
 * escalated — visual row then node, and before that visual row, raw line,
 * then node — and both were retired after real-vault use. The escalating
 * ladder made a single keypress mean different things depending on invisible
 * state (where the previous press left the caret, and where the renderer
 * happened to wrap the text), which is exactly the kind of guessing this
 * change set out to remove from caret motion. A user pressing Home wants the
 * start of the line they are looking at, every time.
 *
 * Not using `view.moveToLineBoundary` is the other half of the point: the
 * target is now computed from the parsed line alone, so it cannot vary with
 * CM6/Obsidian version differences in that primitive's own wrap handling —
 * Q26 closed with an unreproducible-on-1.12.7 report of the ladder sticking
 * mid-node on 1.13, and a rule with no geometry in it cannot have that class
 * of bug at all.
 *
 * Chrome correction applies to Home only: a marker or a continuation line's
 * alignment is always a line PREFIX, never a suffix, so End needs none.
 */
function makeHomeEndHandler(modes: ModeSource, forward: boolean) {
  return (view: EditorView): boolean => {
    if (!outlinePathOf(modes, view)) return false;
    // Handles a NON-EMPTY single range too, unlike the other motion handlers,
    // because declining left the caret on a non-addressable position. Measured:
    // on an escalated boundary-crossing selection, whose head is the last node's
    // trailing gap line by design, native Home/End collapse to that gap and STAY
    // there — and the resulting transaction carries no `userEvent`, so it
    // classifies `programmatic` and `resolveForeignCursors` gives it marker
    // resolution only, never the gap half. The invariant was broken by the one
    // path that assumed the filter would cover it.
    //
    // Arrows are fine and still decline: measured on the same selection, their
    // native collapse lands on content (the cover's own start, or the previous
    // node's content end), never on a gap.
    const selection = view.state.selection;
    if (selection.ranges.length !== 1) return false; // multi-cursor: see soleCursor
    const sel = selection.main;

    const doc = view.state.doc;
    const { doc: outlineDoc } = parsedDoc(doc);
    const raw = offsetToLinePos(doc, sel.head);
    const node = nodeAtLine(outlineDoc, raw.line);
    if (!node) return false; // preamble: stock Home/End

    // A caret CAN legitimately be sitting on a gap line: D2 scopes gap
    // resolution to real user gestures, so a programmatic placement (a plugin's
    // `Editor.setSelection`, a workspace restore, a nested editor's focus
    // hand-off) is left there deliberately. Without this, such a gap line reads
    // as an empty node line — `node.lines[lineIndex]` is undefined, its content
    // boundary is 0, the computed target equals the current position, and the
    // handler consumes the key while doing nothing at all. Resolve to the
    // owning node's content end first, then apply the ordinary rule from there,
    // so Home/End always move the caret somewhere real.
    const pos = resolvePlacement(outlineDoc, raw);
    const lineIndex = pos.line - nodeStartLine(outlineDoc, node.id);
    const line = node.lines[lineIndex] ?? "";
    const target: LinePos = forward
      ? { line: pos.line, ch: line.length }
      : { line: pos.line, ch: contentBoundaryCh(node, line) };

    // A non-empty range must always be dispatched, even when the computed target
    // equals the head: the dispatch is what collapses it.
    if (!sel.empty || target.line !== raw.line || target.ch !== raw.ch) {
      dispatchCursor(view, linePosToOffset(doc, target));
    }
    return true; // consume either way — a further press at the outer rung does nothing
  };
}

/**
 * Backspace/Delete on a place a structural keypress just created cancel it,
 * treating a provisional position as the empty node it stands for. Declines in
 * every other case, so the merge rules and native gap editing are untouched —
 * the guard is "this exact place, from this exact keypress, still on top of the
 * history", not "the caret is on a blank line".
 */
function makeCancelHandler(modes: ModeSource, forward: boolean) {
  return (view: EditorView): boolean => {
    if (!outlinePathOf(modes, view)) return false;
    return cancelOnDelete(view, forward);
  };
}

export function grammarExtension(modes: ModeSource): Extension {
  return [
    tickCounter,
    // Gated on outline mode per update: the listener is installed in every
    // editor view, so without this it would act on stock editing too.
    provisionalCleanup((view) => outlinePathOf(modes, view) !== undefined),
    Prec.highest(
      keymap.of([
        { key: "Backspace", run: makeCancelHandler(modes, false) },
        { key: "Delete", run: makeCancelHandler(modes, true) },
        { key: "Tab", run: probed("Tab", makeHandler(modes, "indent")) },
        { key: "Shift-Tab", run: makeHandler(modes, "outdent") },
        // Move up/down are deliberately NOT bound here. Tab/Enter must live in
        // this keymap because they have to beat stock Obsidian behavior
        // (list indent, list continuation) at `Prec.highest`. Move has no stock
        // behavior to beat — measured on 1.13.3, Alt+Arrow is unbound in
        // Obsidian and does nothing — so binding it here bought nothing and
        // cost everything a CM6 keymap costs: invisible in Settings > Hotkeys,
        // not rebindable, not removable. It now ships as a default hotkey on
        // the `move-node-up`/`move-node-down` commands instead (see main.ts),
        // which is also what obsidian-outliner and Logseq use (Mod+Shift+Arrow).
        { key: "Enter", run: makeHandler(modes, "split") },
        { key: "Shift-Enter", run: makeHandler(modes, "continue") },
        { key: "Mod-a", run: makeSelectAllHandler(modes) },
        {
          key: "Shift-ArrowUp",
          run: probed("Shift-Up", makeExtendHandler(modes, "up")),
        },
        {
          key: "Shift-ArrowDown",
          run: probed("Shift-Down", makeExtendHandler(modes, "down")),
        },
        {
          key: "ArrowLeft",
          run: probed("Left", makeHorizontalHandler(modes, "left")),
        },
        {
          key: "ArrowRight",
          run: probed("Right", makeHorizontalHandler(modes, "right")),
        },
        {
          key: "ArrowUp",
          run: probed("Up", makeVerticalHandler(modes, false)),
        },
        {
          key: "ArrowDown",
          run: probed("Down", makeVerticalHandler(modes, true)),
        },
        { key: "Home", run: probed("Home", makeHomeEndHandler(modes, false)) },
        { key: "End", run: probed("End", makeHomeEndHandler(modes, true)) },
      ]),
    ),
  ];
}
