/**
 * The outline keyboard grammar as a pure planner: (buffer, cursor, key) →
 * either null (decline the key: stock editor behavior) or a transaction
 * plan / rejection notice. No CodeMirror imports — the CM6 keymap wrapper
 * is a thin adapter, and this module is unit-testable.
 */

import type { OutlineDoc, OutlineNode } from '../model';
import { isAtom } from '../model';
import { parse } from '../parse';
import {
  contentColumnCh,
  deleteSubtreeGroups,
  indent,
  insertSiblingHeading,
  itemContentIsEmpty,
  moveDown,
  moveUp,
  outdent,
  splitNode,
  unwrapListItem,
} from '../ops';
import type { OpOutput } from '../ops';
import type { OpResult } from '../result';
import { applyEdits, diffLines } from '../result';
import { nodeAtLine } from './locate';
import { coveredForestOf } from '../escalate';
import { groupRootsByParent } from '../enforce';
import { planCaret, type CaretOp } from '../caret-policy';
import { editsToChanges, mapCursorForward, type EditorChange, type EditorPos } from './dispatch';
import { REJECTION_MESSAGES } from './messages';

export type GrammarKey =
  | 'indent'
  | 'outdent'
  | 'move-up'
  | 'move-down'
  | 'split'
  | 'continue';

export interface TxPlan {
  changes: EditorChange[];
  /**
   * Cursor position in the NEW document, as a character offset, decided by
   * `caret-policy.ts` — see `planFromOp`, which supplies the facts.
   *
   * For indent/outdent (`minimal-change-dispatch`) the policy's answer is the
   * pre-op cursor mapped forward through the (minimal) change set with
   * assoc=1 — not the op's own cursor, and deliberately NOT left to the
   * editor's implicit default mapping either: CM6's own default assoc (-1)
   * disagrees with what `@codemirror/commands`' history redo later computes
   * (hardcoded assoc=1) whenever the cursor sits exactly at a change
   * boundary, which is common for Tab (see `dispatch.ts`'s
   * `mapCursorForward`). Computing that same assoc=1 mapping and stating it
   * explicitly keeps a live dispatch and its eventual redo mathematically
   * identical, so nothing needs recording. Every other structural operation's
   * resulting cursor is a deliberate choice (a join point, a moved node's new
   * location, the seam after a deletion) that mapping cannot recover at all.
   *
   * Indent/outdent fall back to the op's own cursor when the mapped position
   * would not be caret-addressable. That fallback IS recorded — it is a
   * dispatch whose cursor differs from the mapping, which is the axis
   * `record-decision.ts` keys on.
   */
  selection: number;
  userEvent: string;
}

export type GrammarOutcome = { plan: TxPlan } | { notice: string } | null;

function offsetInNewText(newLines: readonly string[], pos: EditorPos): number {
  let offset = 0;
  for (let i = 0; i < pos.line && i < newLines.length; i++) {
    offset += (newLines[i] ?? '').length + 1;
  }
  return offset + pos.ch;
}

function startLine(doc: OutlineDoc, target: OutlineNode): number {
  let line = doc.preamble.length;
  let found = -1;
  const walk = (node: OutlineNode): void => {
    if (found !== -1) return;
    if (node === target) {
      found = line;
      return;
    }
    line += node.lines.length + node.trailingGap.length;
    node.children.forEach(walk);
  };
  doc.children.forEach(walk);
  return found;
}

const LIST_CONT_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]+)/;

/** Offset → `{line, ch}` within an already-built lines array. */
function posInLines(lines: readonly string[], offset: number): EditorPos {
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]?.length ?? 0;
    if (offset <= acc + len) return { line: i, ch: offset - acc };
    acc += len + 1;
  }
  const last = Math.max(0, lines.length - 1);
  return { line: last, ch: lines[last]?.length ?? 0 };
}

/**
 * `mapCursorFrom`, when given, means "this op's own cursor is not the
 * semantic result — map this pre-op position forward through the change set
 * instead" (indent/outdent). Omitted, the op's own `OpOutput.cursor` is used
 * (every other structural op: its cursor is a deliberate choice, not
 * recoverable by mapping).
 *
 * Mapping is used only if it lands somewhere a caret may actually go, and
 * falls back to the operation's own cursor otherwise. The position being
 * mapped is the editor's main selection HEAD, which is a caret only when the
 * selection is empty: with a BLOCK SELECTION active it is the cover's end,
 * and a subtree cover ends on the trailing gap line it owns. Mapping a gap
 * position forward faithfully yields another gap position, so Tab on a
 * block-selected paragraph dispatched a caret onto a gap line — reported from
 * a real vault, and a regression this change introduced by preferring the
 * mapped position unconditionally.
 *
 * Testing addressability of the RESULT rather than emptiness of the input is
 * deliberate: it is the invariant that actually matters ("never dispatch a
 * caret onto a non-addressable position"), it needs no extra parameter
 * threaded from the CM6 adapter, and it also covers a genuine caret that was
 * already parked somewhere non-addressable by a programmatic placement, which
 * an emptiness test would miss. Column preservation is unaffected: a real
 * caret on content always maps to content.
 *
 * Amended by `caret-placement-policy`: that rule, and every other placement
 * rule, now lives in `caret-policy.ts`. This function supplies FACTS — the
 * before/after trees, the operation's anchor, and the mapped position when
 * the caller asked for one — plus which of the policy's four cases the
 * operation falls into. It holds no placement rule of its own, which is what
 * keeps the keyboard path from drifting away from the palette's.
 */
function planFromOp(
  lines: readonly string[],
  result: OpResult<OpOutput>,
  userEvent: string,
  op: CaretOp,
  before: OutlineDoc,
  mapCursorFrom?: EditorPos,
): GrammarOutcome {
  if (!result.ok) return { notice: REJECTION_MESSAGES[result.rejection.reason] };
  const changes = editsToChanges(lines, result.value.edits);
  const newLines = applyEdits(lines, result.value.edits);
  const after = parse(newLines.join('\n'));

  const mapped =
    mapCursorFrom === undefined
      ? undefined
      : posInLines(newLines, mapCursorForward(lines, changes, mapCursorFrom));

  const { caret } = planCaret(op, { before, after, anchor: result.value.anchor, mapped });

  return {
    plan: { changes, selection: offsetInNewText(newLines, caret), userEvent },
  };
}

/**
 * Insert `text` at a position, cursor at its end — for Shift+Enter, which is a
 * text-level (transient-state) edit.
 *
 * `consume` is the horizontal whitespace run immediately after the insertion
 * point, which the split-point whitespace rule drops: it separated two words
 * that are now on different lines and belongs to neither. That makes this a
 * REPLACEMENT rather than a pure insertion, which changes nothing about how the
 * transaction classifies — a single-line change inside one node's own line
 * still cannot cross a boundary — but `classify.ts`'s comment on the generic
 * `input` event is written against the insertion shape, so it says so there.
 */
function insertionPlan(
  lines: readonly string[],
  at: EditorPos,
  text: string,
  userEvent: string,
  consume = 0,
): GrammarOutcome {
  const lineText = lines[at.line] ?? '';
  const before = lineText.slice(0, at.ch);
  const tail = lineText.slice(at.ch + consume);
  const changes: EditorChange[] = [
    { from: at, to: { line: at.line, ch: at.ch + consume }, text },
  ];
  const inserted = text.split('\n');
  const newCursorLine = at.line + inserted.length - 1;
  const newCh =
    inserted.length === 1 ? before.length + text.length : (inserted.at(-1) ?? '').length;
  // Build enough of the new text to compute the offset.
  const newLines = [...lines];
  if (inserted.length === 1) {
    newLines[at.line] = before + text + tail;
  } else {
    newLines.splice(
      at.line,
      1,
      before + inserted[0]!,
      ...inserted.slice(1, -1),
      (inserted.at(-1) ?? '') + tail,
    );
  }
  return {
    plan: {
      changes,
      selection: offsetInNewText(newLines, { line: newCursorLine, ch: newCh }),
      userEvent,
    },
  };
}

/** Apply a plan's own changes to the text they were computed against. */
function applyPlanChanges(text: string, changes: readonly EditorChange[]): string {
  const lines = text === '' ? [] : text.split('\n');
  const offsetOf = (pos: EditorPos): number => {
    let acc = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) acc += (lines[i] ?? '').length + 1;
    return acc + pos.ch;
  };
  let out = text;
  for (const change of [...changes].sort((a, b) => offsetOf(b.from) - offsetOf(a.from))) {
    out = out.slice(0, offsetOf(change.from)) + change.text + out.slice(offsetOf(change.to));
  }
  return out;
}

/**
 * Enter or Shift+Enter over a NON-EMPTY selection (design D7): remove the
 * selection as the Backspace gesture does, then apply the key at the cursor
 * that lands. One composed rule for a character range inside one node and for
 * a block selection of whole subtrees alike.
 *
 * The two steps are composed in TEXT space and the result is diffed against the
 * original, rather than concatenating two change sets. Concatenation would have
 * to map the key's own changes out of post-deletion coordinates, where a
 * line-granular edit that starts before the collapse point overlaps the
 * deletion; diffing the final text produces one minimal, ordered change set by
 * construction, and it is the same narrowing every structural dispatch uses.
 *
 * The removal is a contiguous text deletion rather than a call into
 * `deleteSubtrees`. For a block selection that is the same thing — a cover
 * already spans whole subtrees INCLUDING the trailing gaps they own — with one
 * exception worth naming: the structural delete renumbers a following ordered
 * run, and this does not. In practice the key's own operation renumbers the
 * sibling list it lands in, which is the same run; the case where it would not
 * is a selection whose removal leaves an ordered run that the key never
 * touches.
 */
function planOverSelection(
  text: string,
  from: EditorPos,
  to: EditorPos,
  key: GrammarKey,
  fallbackIndentUnit?: string,
): GrammarOutcome {
  const lines = text === '' ? [] : text.split('\n');

  // A BLOCK SELECTION — an exact cover of whole subtrees — is removed by the
  // STRUCTURAL delete, not by cutting its text out, and the key then acts at
  // the caret that deletion produces rather than at the range's start.
  //
  // Both halves were wrong before, and each broke a different case. A raw text
  // cut does not renumber, so deleting the first two of `1. 2. 3.` left the
  // survivor numbered 3 and the new item took 3 as well. And the range's start
  // is not where a deletion leaves the caret: with the last items of a list
  // selected it points at whatever FOLLOWS the list, so the key created a node
  // of that node's kind — a heading, in the reported case — instead of a list
  // item, and at the end of a document it pointed at a gap line and declined
  // outright. `caret-placement-policy`'s deletion convention answers this
  // exactly: following sibling, else preceding, else ancestor. That is what
  // keeps the caret at the level of the selection's first root instead of
  // jumping into the next subtree.
  const doc = parse(text);
  const forest = coveredForestOf(doc, { anchor: from, head: to });
  if (forest) {
    const groups = groupRootsByParent(forest.roots);
    const deletion = deleteSubtreeGroups(doc, groups);
    if (deletion.ok) {
      const afterDelete = applyEdits(lines, deletion.value.edits);
      const { caret } = planCaret(
        { kind: 'deletion', removed: groups.flat() },
        { before: doc, after: deletion.value.doc, anchor: deletion.value.anchor },
      );
      const inner = planKey(afterDelete.join('\n'), caret, key, fallbackIndentUnit);
      if (inner === null || 'notice' in inner) return inner;
      const finalLines = applyPlanChanges(afterDelete.join('\n'), inner.plan.changes).split('\n');
      return {
        plan: {
          changes: editsToChanges(lines, diffLines(lines, finalLines)),
          selection: inner.plan.selection,
          userEvent: inner.plan.userEvent,
        },
      };
    }
  }

  // A WHOLE-LINE range takes its trailing newline with it. Without this the
  // removal leaves the line boundary behind as an empty line, the collapse
  // point lands on it, and the key declines because a gap line is not one of
  // the node's own — measured against a real block selection, whose cover ends
  // at the last covered line's END rather than at the next line's start. Whole
  // lines are also what the structural delete removes, so this is the shape
  // "as the Backspace gesture does" already means.
  const wholeLines = from.ch === 0 && to.ch === (lines[to.line]?.length ?? 0);
  const cut = wholeLines && to.line + 1 < lines.length ? { line: to.line + 1, ch: 0 } : to;
  const fromOffset = offsetInNewText(lines, from);
  const toOffset = offsetInNewText(lines, cut);
  const remaining = text.slice(0, fromOffset) + text.slice(toOffset);

  // Everything before the cut is byte-identical, so the collapse point keeps
  // its own line/ch coordinates in the shortened text.
  const inner = planKey(remaining, from, key, fallbackIndentUnit);
  // Declining here declines the whole gesture: stock behavior then replaces the
  // selection itself, which is the correct fallback for a collapse point our
  // grammar has no jurisdiction over (an atom, the preamble).
  if (inner === null || 'notice' in inner) return inner;

  const finalText = applyPlanChanges(remaining, inner.plan.changes);
  const finalLines = finalText === '' ? [] : finalText.split('\n');
  return {
    plan: {
      changes: editsToChanges(lines, diffLines(lines, finalLines)),
      // Already an offset into the final document, which is the same document
      // either way the changes are expressed.
      selection: inner.plan.selection,
      userEvent: inner.plan.userEvent,
    },
  };
}

export function planKey(
  text: string,
  cursor: EditorPos,
  key: GrammarKey,
  fallbackIndentUnit?: string,
  selectionEnd?: EditorPos,
): GrammarOutcome {
  if (
    selectionEnd !== undefined &&
    (selectionEnd.line !== cursor.line || selectionEnd.ch !== cursor.ch) &&
    (key === 'split' || key === 'continue')
  ) {
    return planOverSelection(text, cursor, selectionEnd, key, fallbackIndentUnit);
  }
  const doc = parse(text);
  const node = nodeAtLine(doc, cursor.line);
  if (!node) return null; // preamble or nothing: stock behavior
  const lines = text === '' ? [] : text.split('\n');
  const nodeStart = startLine(doc, node);
  const onFirstLine = cursor.line === nodeStart;
  const onOwnLines = cursor.line < nodeStart + node.lines.length;

  // Atom interiors are opaque: only whole-atom ops from the first line.
  if (isAtom(node)) {
    if (!onFirstLine) return null;
    if (key === 'split' || key === 'continue') {
      // Declining is right for every atom whose stock behavior is already the
      // next line of its own kind — a `> ` line in a quote, a row in a table,
      // a plain line in a code fence. A THEMATIC BREAK has neither text to
      // split nor a next line of its own kind, and the stock newline turns
      // `---` into a paragraph plus an empty list item, destroying the node.
      if (node.kind === 'hr') return { notice: REJECTION_MESSAGES['cannot-split'] };
      return null;
    }
  }
  // Cursor on a gap line: structural ops act on the owning node; text-level
  // keys behave stock.
  if (!onOwnLines && (key === 'split' || key === 'continue')) return null;

  switch (key) {
    case 'indent':
      return planFromOp(
        lines,
        indent(doc, node.id, fallbackIndentUnit),
        'input.structure.indent',
        { kind: 'derived' },
        doc,
        cursor,
      );
    case 'outdent':
      return planFromOp(
        lines,
        outdent(doc, node.id, fallbackIndentUnit),
        'input.structure.outdent',
        { kind: 'derived' },
        doc,
        cursor,
      );
    case 'move-up':
      return planFromOp(lines, moveUp(doc, node.id), 'move.structure', { kind: 'subject' }, doc);
    case 'move-down':
      return planFromOp(lines, moveDown(doc, node.id), 'move.structure', { kind: 'subject' }, doc);
    case 'split': {
      // ORDER IS LOAD-BEARING (design D4): an empty item's content start IS its
      // end, so the ladder and `splitNode`'s own content-start rule overlap on
      // exactly that shape. Testing the ladder first makes the overlap
      // harmless. The content-start case itself lives in `splitNode`, where the
      // enforcement path reaches it too.
      if (node.kind === 'list-item' && itemContentIsEmpty(node)) {
        // Leave the list rather than stack another empty bullet. Outdent's own
        // rules decide whether the move is expressible; where they say no — at
        // the top level, or directly under a heading — the item is unwrapped
        // instead. Deliberately a fall-through rather than a second copy of
        // those rules, which would drift from the ones outdent tests.
        const outdented = outdent(doc, node.id, fallbackIndentUnit);
        if (outdented.ok) {
          return planFromOp(
            lines,
            outdented,
            'input.structure.outdent',
            { kind: 'derived' },
            doc,
            cursor,
          );
        }
        return planFromOp(
          lines,
          unwrapListItem(doc, node.id),
          'input.structure.unwrap',
          { kind: 'exact' },
          doc,
        );
      }
      return planFromOp(
        lines,
        splitNode(doc, node.id, cursor, fallbackIndentUnit),
        'input.structure.split',
        { kind: 'exact' },
        doc,
      );
    }
    case 'continue': {
      // A heading has no continuation line of its own, so the key is free for
      // the gesture that drafts a document's structure: a new sibling at the
      // same level, carrying whatever follows the cursor.
      if (node.kind === 'heading') {
        const titleLine = node.lines[0] ?? '';
        const from = Math.min(
          Math.max(cursor.ch, contentColumnCh(titleLine)),
          titleLine.length,
        );
        // Only the title line has a remainder; on a setext underline there is
        // no title text under the cursor at all.
        const remainder = onFirstLine ? titleLine.slice(from) : '';
        return planFromOp(
          lines,
          insertSiblingHeading(doc, node.id, remainder),
          'input.structure.sibling-heading',
          { kind: 'exact' },
          doc,
        );
      }

      const lineText = lines[cursor.line] ?? '';
      // Clamp out of chrome, the same rule Enter applies: a break inside a
      // marker or a node's indentation would split the chrome itself.
      const boundary = onFirstLine
        ? contentColumnCh(lineText)
        : (/^[ \t]*/.exec(lineText)?.[0].length ?? 0);
      const at: EditorPos = {
        line: cursor.line,
        ch: Math.min(Math.max(cursor.ch, boundary), lineText.length),
      };
      const consume = /^[ \t]*/.exec(lineText.slice(at.ch))?.[0].length ?? 0;
      // The new line starts at the node's own content column: a list item's
      // continuation indent on its first line, and otherwise the line's own
      // leading whitespace — which is what carries an INDENTED paragraph's
      // indentation instead of dropping the continuation at column 0, where it
      // survived only by CommonMark's lazy-continuation rule.
      const prefix =
        node.kind === 'list-item' && onFirstLine
          ? (() => {
              const match = LIST_CONT_RE.exec(node.lines[0] ?? '');
              return match
                ? `${match[1]}${' '.repeat(match[2]!.length + match[3]!.length)}`
                : '';
            })()
          : (/^[ \t]*/.exec(lineText)?.[0] ?? '');
      // A DISTINCT event, not the generic `input` this used to carry. It is
      // deliberately NOT in `classify.ts`'s plugin-own list, so the transaction
      // still classifies by shape exactly as before — a single-line change
      // inside one node's own line, which cannot cross a boundary. What the
      // name buys is a marker `provisional-cleanup.ts` can key on: recognising
      // this dispatch by its SHAPE (an `input` event inserting a line break)
      // also matched CodeMirror's own Enter, which runs in outline mode
      // whenever the grammar declines — on a gap line reached by a programmatic
      // placement, for instance — and that stock newline would then be recorded
      // as ours and undone when the caret moved.
      return insertionPlan(lines, at, `\n${prefix}`, 'input.structure.continue', consume);
    }
  }
}
