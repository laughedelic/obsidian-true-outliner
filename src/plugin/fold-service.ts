/**
 * The one place that tells CodeMirror what an outline node's fold is.
 *
 * Obsidian's folding IS CodeMirror's folding: the state is
 * `@codemirror/language`'s, and `foldable()` asks a `foldService` facet that
 * already holds three providers and takes a fourth
 * (docs/research/28-fold-mechanics.md). Registering one is therefore not a
 * parallel fold engine — it changes what Obsidian itself folds, which is why
 * one provider buys the native fold command, the native placeholder, and
 * per-file persistence with nothing else built.
 *
 * Two consequences that are easy to get backwards, both measured:
 *
 * - **Declining is not a veto.** Returning `null` sends the question to the
 *   providers below us and then to syntax folding, which still reports a fold
 *   for at least one atom kind (a raw HTML block). We answer for the nodes we
 *   fold and stay out of the rest; nothing we draw follows `foldable()`, only
 *   our own answer — `foldChromeTarget` is where that distinction lives.
 * - **The chevron follows this, but only while Obsidian offers one at all.**
 *   Registering the provider at load puts a native fold indicator on every line
 *   it claims, the paragraph included — so in the default configuration nothing
 *   of ours needs drawing. Turn "Fold heading" and "Fold indent" off and the
 *   indicator disappears from every line while `foldable()` and every fold path
 *   keep working: the settings gate Obsidian's CONTROL, not the fold. That
 *   configuration is what the plugin's own affordance exists for, which is why
 *   `decorations.ts` keys it on "we fold this line and it has no native
 *   chevron" rather than on a kind.
 */

import { foldService } from '@codemirror/language';
import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { parsedDoc } from './parsed-doc';
import { isOutlineMode } from './outline-state';
import { nestedEditorField } from './nested-editor';
import { foldLines, foldTargetAtLine, entryAtLine, type FoldEntry } from './fold-model';

/**
 * The fold this line's node offers, as document offsets, or null when it offers
 * none.
 *
 * Answers on the node's FIRST line (see `foldChromeTarget`) with a range that
 * begins after its LAST own line, so a multi-line node keeps all of its own
 * text on screen while its control stays beside its marker. The two are the
 * same line for every single-line node.
 *
 * Answers for the line's OWN node only — no escalation. Escalation is a
 * property of the gesture (a caret in a leaf means "fold my branch"), not of
 * the line, and a provider that escalated would make every line inside a
 * subtree report its ancestor's fold, so `foldable()` would claim a fold on a
 * line whose own node has none.
 */
export function foldRangeAt(
  state: EditorState,
  lineNumber: number,
): { from: number; to: number } | null {
  const entry = foldChromeTarget(state, lineNumber);
  if (!entry) return null;
  const lines = foldLines(entry.node, entry.startLine);
  if (!lines) return null;
  const doc = state.doc;
  // Model lines are 0-based; CM6's are 1-based. A fold that would run past the
  // document (a stale parse against a shrinking doc) is no fold at all.
  if (lines.lastLine + 1 > doc.lines) return null;
  return {
    from: doc.line(lines.headLine + 1).to,
    to: doc.line(lines.lastLine + 1).to,
  };
}

/**
 * The node whose fold chrome belongs on this line: the line's own node, when we
 * fold it and the line is the node's FIRST line.
 *
 * The first line and not the last, even though the fold itself begins after the
 * node's last own line. Fold chrome belongs beside the MARKER, and the marker is
 * on the first line — a list item with a continuation line keeps its bullet on
 * the line above, and an affordance on the continuation would be an affordance
 * beside nothing. Obsidian's own indicator makes the same choice, which the
 * corpus diff caught us disagreeing with: keying on the last own line moved the
 * fold control one line down on every wrapped item in the test vault.
 *
 * The two lines coincide for every single-line node, which is why this is easy
 * to get wrong and invisible in a fixture built from short lines.
 *
 * Everything about our fold chrome keys off this function rather than off
 * `foldable()`: the editor's answer covers lines we deliberately offer no fold
 * on, and drawing an affordance there would surface a fold Obsidian itself
 * withholds a control for.
 */
export function foldChromeTarget(state: EditorState, lineNumber: number): FoldEntry | null {
  if (!isOutlineMode(state)) return null;
  if (state.field(nestedEditorField, false)) return null;
  const { doc } = parsedDoc(state.doc);
  const entry = entryAtLine(doc, lineNumber);
  if (!entry || entry.node.children.length === 0) return null;
  if (lineNumber !== entry.startLine) return null;
  return entry;
}

/**
 * The node a fold GESTURE on this line acts on — the line's own node when it
 * has children, else the nearest ancestor that has. `fold-model.ts` states why
 * the escalation exists.
 */
export function foldGestureTarget(state: EditorState, lineNumber: number): FoldEntry | null {
  if (!isOutlineMode(state)) return null;
  if (state.field(nestedEditorField, false)) return null;
  const { doc } = parsedDoc(state.doc);
  return foldTargetAtLine(doc, lineNumber);
}

/**
 * `Prec.high` so our answer wins on the lines Obsidian's own providers also
 * claim — a heading and a list item — and every kind's fold is the same subtree
 * cover rather than three different ones that happen to agree most of the time.
 */
export function foldServiceExtension(): Extension {
  return Prec.high(
    foldService.of((state, lineStart) =>
      foldRangeAt(state, state.doc.lineAt(lineStart).number - 1),
    ),
  );
}
