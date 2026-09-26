/**
 * A structural dispatch lands as the plugin planned it, whatever Obsidian's
 * live list renumbering makes of it.
 *
 * With "Smart lists" on, Obsidian installs a transaction filter that renumbers
 * the ordered list around every changed line and appends the new numbers to the
 * same transaction (`userEvent: 'input.renumber'`). It measures a list item's
 * level in whole tabs or four-space groups, so an item nested at three columns —
 * under a `1. ` parent, where its content column puts it — reads to it as a
 * SIBLING of that parent. Around such an item it renumbers lines in a list the
 * change never touched: an Enter after `   1. a` in `1. p` / `   1. a` / `2. q`
 * turns `2. q` into `3. q`.
 *
 * Our operations renumber the runs they change themselves
 * (`structural-operations`, "Ordered-run renumbering"), so for a transaction
 * this plugin planned, the planned document is the whole answer. Each such
 * dispatch carries its change set in `plannedChanges`, and the filter below,
 * which runs after every filter of default precedence, puts back any marker
 * number that differs from the planned document. Only marker numbers: a line
 * that differs in any other way is some other filter's change and is left to
 * stand, and a transaction whose line count no longer matches the plan is left
 * whole.
 *
 * Typing and every other edit this plugin does not plan are not covered here:
 * they pass through with whatever Obsidian appends, as off-mode edits do.
 */

import {
  Annotation,
  EditorState,
  Prec,
  type ChangeSet,
  type ChangeSpec,
  type Extension,
  type Text,
} from '@codemirror/state';

/** The change set a plugin dispatch intends, in its start document's offsets. */
export const plannedChanges = Annotation.define<ChangeSet>();

/** An ordered marker: the container prefix, the number, then the rest of the line. */
const ORDERED_MARKER_RE = /^([>\s]*)(\d+)([.)](?:[ \t].*)?)$/;

/**
 * The changes that take `actual` back to `intended` wherever the two differ in
 * an ordered marker's number and nowhere else on that line, in `actual`'s
 * offsets. Empty when the line counts differ.
 */
export function markerNumberRestorations(intended: Text, actual: Text): ChangeSpec[] {
  if (intended.lines !== actual.lines) return [];
  const restorations: ChangeSpec[] = [];
  for (let n = 1; n <= actual.lines; n++) {
    const want = intended.line(n).text;
    const line = actual.line(n);
    if (line.text === want) continue;
    const a = ORDERED_MARKER_RE.exec(line.text);
    const w = ORDERED_MARKER_RE.exec(want);
    if (!a || !w || a[1] !== w[1] || a[3] !== w[3]) continue;
    const from = line.from + a[1]!.length;
    restorations.push({ from, to: from + a[2]!.length, insert: w[2]! });
  }
  return restorations;
}

export function plannedChangesExtension(): Extension {
  // `Prec.highest` because CM6 runs transaction filters from the lowest
  // precedence up: this one sees the transaction after Obsidian's has added to it.
  return Prec.highest(
    EditorState.transactionFilter.of((tr) => {
      const planned = tr.annotation(plannedChanges);
      if (!planned || !tr.docChanged || planned.length !== tr.startState.doc.length) return tr;
      const intended = planned.apply(tr.startState.doc);
      if (intended.eq(tr.newDoc)) return tr;
      const restorations = markerNumberRestorations(intended, tr.newDoc);
      return restorations.length > 0 ? [tr, { changes: restorations, sequential: true }] : tr;
    }),
  );
}
