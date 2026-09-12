/**
 * Progressive Select All ladder (progressive-select-all change, design.md
 * D1-D5): repeated Mod-A climbs node's own content -> node's whole subtree
 * -> its siblings' combined run -> the parent's whole subtree -> repeat
 * outward -> the whole outline body, then falls through to native Select
 * All for the whole document. Stateless: every call recomputes the ladder
 * from the document tree and the CURRENT selection, with no press-count or
 * "last rung" state stored anywhere.
 *
 * The "siblings' combined run" step (real-vault experiment, added after the
 * first manual pass) sits between a node's own subtree and its parent's:
 * select this node -> select it plus all its siblings at the same level
 * (NOT the parent's own line) -> select the parent's whole subtree (the
 * parent's own line included). At the top level, "siblings' combined run"
 * already IS the whole outline body, so the ladder's dedup step collapses
 * the two into one rung there — no separate case needed.
 *
 * Pure module — no CodeMirror imports; src/plugin/keymap.ts is the CM6
 * adapter (converts to/from character offsets, decides per-range fallback
 * to native Select All). Reuses escalate.ts's `subtreeCoverOf`/`Cover`
 * rather than recomputing subtree geometry — this module only adds the
 * rung *sequence* and the *next-rung* comparison escalate.ts has no need
 * for (its own job is escalating a transaction's shape, not climbing a
 * ladder across repeated identical keypresses).
 */

import type { OutlineDoc, OutlineNode } from './model';
import { childrenAt, findPath, nodeAt } from './model';
import { nodeAtLine, nodeStartLine } from './locate';
import { markerPrefixCh } from './ops';
import { subtreeCoverOf, type Cover } from './escalate';
import { isBackward, posBefore, posEqual, type LinePos, type LineRange } from './line-pos';

function coverEqual(a: Cover, b: Cover): boolean {
  return posEqual(a.start, b.start) && posEqual(a.end, b.end);
}

/** `cover` contains the bounds `[lo, hi]` (both inclusive-endpoint
 * comparisons — a cover whose start/end exactly equals `lo`/`hi` counts as
 * containing it). */
function containsBounds(cover: Cover, lo: LinePos, hi: LinePos): boolean {
  return !posBefore(lo, cover.start) && !posBefore(cover.end, hi);
}

/**
 * A node's own content cover (rung 1): its own lines only, excluding
 * descendants and its trailing gap. A list item's cover starts where its own
 * text begins (`markerPrefixCh`, the boundary `splitNode` and the Backspace
 * merge use): after the list marker, and after the task marker too when the
 * item has one, so the first press on `- [ ] buy milk` selects `buy milk`.
 * Headings and paragraphs have no marker to exclude (design.md D4), so their
 * content starts at column 0 of their first line.
 *
 * The task marker is excluded for a reason the caret's boundary does not
 * share. Obsidian's checkbox-widget mount dispatches a selection change of its
 * own that moves a range boundary sitting at the list marker's end to column
 * 0 — the same late dispatch `content-space-caret` C8 records for a caret —
 * so a rung starting after `- ` alone settles as the whole line, marker and
 * all, with outline mode on or off (docs/research/select-all-task-content). A
 * boundary past the task marker survives it. `caret.ts`'s `contentBoundaryCh`
 * still stops after `- `, because a caret is one position, the filter clamps
 * it back off the marker, and the checkbox is addressable on purpose (Home
 * lands before it). An empty task item has no text to select, so its first
 * rung collapses to a cursor and the ladder climbs straight to the whole line.
 */
function ownContentCover(doc: OutlineDoc, node: OutlineNode): Cover {
  const start = nodeStartLine(doc, node.id);
  const firstLine = node.lines[0] ?? '';
  const startCh = node.kind === 'list-item' ? markerPrefixCh(firstLine) : 0;
  const lastLine = node.lines[node.lines.length - 1] ?? '';
  return {
    start: { line: start, ch: startCh },
    end: { line: start + node.lines.length - 1, ch: lastLine.length },
  };
}

/** The combined cover of every node in `siblings` (a non-empty sibling
 * list at one scope) — first sibling's subtree start through last
 * sibling's subtree end. At the top level this is the whole outline body;
 * at any other level it's "this node plus all its siblings," the parent's
 * own line NOT included. */
function siblingsRunCover(doc: OutlineDoc, siblings: readonly OutlineNode[]): Cover {
  const first = siblings[0]!;
  const last = siblings[siblings.length - 1]!;
  return { start: subtreeCoverOf(doc, first).start, end: subtreeCoverOf(doc, last).end };
}

/**
 * The ordered ladder of rungs for `node`, smallest first: own content, then
 * — at `node`'s own level, then each ancestor's level outward — that
 * level's own subtree followed by that level's siblings' combined run,
 * ending at the whole outline body. Consecutive equal covers (a leaf
 * node's content and subtree coincide; a lone top-level node's subtree
 * equals its own siblings' run, which is the whole outline body) collapse
 * to one rung, so the next-rung search below never needs to special-case a
 * zero-growth step.
 */
function ladderFor(doc: OutlineDoc, node: OutlineNode): readonly Cover[] {
  const path = findPath(doc, node.id);
  if (!path) return [];

  const covers: Cover[] = [ownContentCover(doc, node)];
  for (let len = path.length; len >= 1; len--) {
    const levelNode = nodeAt(doc, path.slice(0, len));
    if (!levelNode) continue;
    covers.push(subtreeCoverOf(doc, levelNode));
    const siblings = childrenAt(doc, path.slice(0, len - 1));
    if (siblings.length > 0) covers.push(siblingsRunCover(doc, siblings));
  }

  const deduped: Cover[] = [];
  for (const cover of covers) {
    if (deduped.length === 0 || !coverEqual(deduped[deduped.length - 1]!, cover)) {
      deduped.push(cover);
    }
  }
  return deduped;
}

/**
 * The next rung up the ladder for one selection range (design.md D3):
 * recomputed from the CURRENT range and the document tree, no stored
 * state. The node context is resolved from the range's `anchor`. Returns
 * the smallest rung that both contains the range and differs from it —
 * ladder rungs nest monotonically by construction, so once a rung exactly
 * matches the range, every later rung also contains it and the search can
 * simply continue past the match rather than special-casing it.
 *
 * Returns `null` when there is no further node-shaped rung to climb to:
 * the range already equals the ladder's top rung (whole outline body), or
 * the anchor isn't inside any node's jurisdiction at all (e.g. resting in
 * the preamble, or past the document's very final trailing gap) — in both
 * cases the caller should let native Select All run for this range.
 */
export function nextRung(
  doc: OutlineDoc,
  range: LineRange,
  bound?: Cover,
): LineRange | null {
  const node = nodeAtLine(doc, range.anchor.line);
  if (!node) return null;

  let lo = isBackward(range) ? range.head : range.anchor;
  let hi = isBackward(range) ? range.anchor : range.head;

  const ladder = ladderFor(doc, node);
  // A cursor inside the node's marker prefix — where Home leaves it on a task
  // item, where a click on the checkbox lands, where Obsidian's widget mount
  // moves it — climbs from the content rung like a cursor on the text does.
  // The rung is the first place to climb TO, not one the caret has to have
  // reached: without this the first press skipped the text and took the
  // whole line.
  const own = ladder[0];
  if (own && posEqual(lo, hi) && lo.line === own.start.line && lo.ch < own.start.ch) {
    lo = own.start;
    hi = own.start;
  }

  for (const cover of ladder) {
    // `outline-zoom` D7: an active scope BOUNDS the enumeration rather than
    // truncating its output. Rungs that reach past the zoom root are dropped
    // from the sequence, so the root's own subtree becomes the top and every
    // rung the ladder still offers is an exact cover. Clipping the answer
    // instead would hand back a range that is not a cover, which
    // `node-selection-extension` requires its dispatches to be.
    if (bound && !containsBounds(bound, cover.start, cover.end)) continue;
    if (!containsBounds(cover, lo, hi)) continue;
    if (posEqual(cover.start, lo) && posEqual(cover.end, hi)) continue; // already here — keep climbing
    return isBackward(range)
      ? { anchor: cover.end, head: cover.start }
      : { anchor: cover.start, head: cover.end };
  }
  return null;
}

/**
 * Multi-range entry point (design.md D5): each range climbs its own ladder
 * independently — there is no uniform/forced-common-rung step here, unlike
 * `escalateRanges`' multi-range rule. Returns one entry per input range,
 * `null` where that range has no further rung (see `nextRung`); the CM6
 * adapter decides what `null` means for dispatch (leave that range as-is,
 * or — when every range is `null` — fall through to native Select All
 * entirely).
 */
export function nextRungs(
  doc: OutlineDoc,
  ranges: readonly LineRange[],
  bound?: Cover,
): readonly (LineRange | null)[] {
  return ranges.map((range) => nextRung(doc, range, bound));
}
