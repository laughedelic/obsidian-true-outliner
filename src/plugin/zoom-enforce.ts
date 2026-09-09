/**
 * The seam where a zoom refusal is substituted for an enforcement verdict
 * (`outline-zoom`, design D3).
 *
 * Its own module, free of `obsidian`, for the reason `zoom-state.ts` gives for
 * the same split: the enforcement filter imports `Notice` and so is unreachable
 * from the unit suite, and this decision is exactly the part worth testing
 * there. Resolving the scope needs `editorInfoField`, so the caller does that
 * and passes the scope in.
 */

import { ChangeSet, type ChangeDesc, type Text, type Transaction } from '@codemirror/state';
import type { OutlineDoc } from '../model';
import { encodeLines } from '../encode';
import type { Verdict } from '../enforce';
import { editEscapes, type ZoomScope } from '../zoom';
import { editsToChangeSpec } from './dispatch';
import { parsedDoc } from './parsed-doc';
import { footprintOf, visibleBoundsOf } from './zoom-state';

/**
 * Would the change this verdict dispatches place content outside the zoom
 * scope? (`outline-zoom`)
 *
 * Judged over what will LAND, which for a rewrite is the verdict's own edits
 * rather than the keystroke's: a structural paste is spliced at a node
 * boundary, so a caret inside the subtree can still produce an insertion beside
 * the root. Judging `tr.changes` would pass exactly that case.
 *
 * A `veto` is left alone — it is already refused, with a reason of its own that
 * says more than this one would. That check is FIRST, and it is the whole of
 * "an existing veto keeps its reason": a first-node Backspace at a zoom root
 * reports the first-node cue because this returns before looking at the scope
 * at all.
 *
 * The scope is passed IN rather than resolved here, so this is reachable from
 * the unit suite — resolving it needs `editorInfoField`, and nothing else in
 * this function does.
 *
 * Both documents come from `parsed-doc.ts`'s cache. The before-state's parse is
 * already in it (this filter took it on this same transaction), and parsing the
 * after-state is an EARLIER parse rather than an extra one: the next
 * transaction reads that same `Text` as its own `startState.doc`. A rewrite
 * needs neither — its verdict carries the document its edits produce.
 */
export function escapesZoom(
  tr: Pick<Transaction, 'changes' | 'newDoc'> & { startState: { doc: Text } },
  scope: ZoomScope | null,
  before: OutlineDoc,
  verdict: Verdict,
): boolean {
  if (verdict.kind === 'veto') return false;
  if (!scope) return false;

  const startDoc = tr.startState.doc;
  const bounds = visibleBoundsOf(startDoc, scope);
  const anchor = startDoc.line(scope.startLine + 1).from;

  let changes: ChangeDesc;
  let newDoc: Text;
  let after: OutlineDoc;
  if (verdict.kind === 'rewrite') {
    const set = ChangeSet.of(
      editsToChangeSpec(startDoc, encodeLines(before), verdict.edits),
      startDoc.length,
    );
    changes = set;
    newDoc = set.apply(startDoc);
    after = verdict.after;
  } else {
    changes = tr.changes;
    newDoc = tr.newDoc;
    after = parsedDoc(newDoc).doc;
  }

  return editEscapes(before, scope, after, footprintOf(changes, newDoc, bounds, anchor));
}

