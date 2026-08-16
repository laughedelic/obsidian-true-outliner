/**
 * The outline keyboard grammar as a pure planner: (buffer, cursor, key) →
 * either null (decline the key: stock editor behavior) or a transaction
 * plan / rejection notice. No CodeMirror imports — the CM6 keymap wrapper
 * is a thin adapter, and this module is unit-testable.
 */

import type { OutlineDoc } from '../model';
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
import { nodeAtLine, nodeStartLine } from '../locate';
import { resolvedOutline } from './decorate';
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
  /**
   * The edit that removes the empty place this operation would leave the caret
   * on, in the coordinates of the document `changes` produces. Absent when the
   * operation can leave no place at all.
   *
   * Stated here rather than derived by `provisional-cleanup.ts` because it
   * CANNOT be derived downstream: `changes` is a minimal diff of the whole
   * transformation, and where a keypress removed a selection before acting, the
   * removal and the insertion touch the same lines and are one replacement in
   * it. The two steps exist separately only here, while the plan is composed.
   *
   * Stating it does NOT mean a place was made — that is `provisional-cleanup`'s
   * own question, answered from where the caret landed, and the two answers are
   * deliberately independent (`structural-history-integration`). A plan states
   * how to remove a place if there is one; the module decides if there is.
   */
  abandon?: EditorChange[] | undefined;
}

/**
 * How a plan's `abandon` edit is formed — a per-operation decision, because the
 * two forms mean different things:
 *
 * - `reverse`: the operation's PURPOSE was to open the place, so abandoning it
 *   returns the document to the text it acted on. Everything the operation did
 *   goes, INCLUDING any renumbering or re-indentation it performed on the way
 *   in, because the edit is stated in bytes rather than reasoned about in
 *   categories.
 * - `drop-line`: the operation DISSOLVED a node into a blank line and the place
 *   is that residue. Reversing it would restore the `- ` the user pressed Enter
 *   to escape, so the line goes and the departure stands.
 * - `none`: the operation cannot leave a place to abandon.
 */
type AbandonForm = 'reverse' | 'drop-line' | 'none';

export type GrammarOutcome = { plan: TxPlan } | { notice: string } | null;

function offsetInNewText(newLines: readonly string[], pos: EditorPos): number {
  let offset = 0;
  for (let i = 0; i < pos.line && i < newLines.length; i++) {
    offset += (newLines[i] ?? '').length + 1;
  }
  return offset + pos.ch;
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
  abandonForm: AbandonForm,
  mapCursorFrom?: EditorPos,
  placeLine?: number,
): GrammarOutcome {
  if (!result.ok) return { notice: REJECTION_MESSAGES[result.rejection.reason] };
  const changes = editsToChanges(lines, result.value.edits);
  const newLines = applyEdits(lines, result.value.edits);
  const afterText = newLines.join('\n');

  const mapped =
    mapCursorFrom === undefined
      ? undefined
      : posInLines(newLines, mapCursorForward(lines, changes, mapCursorFrom));

  // The RESULT is read through the same outline the operation acted on, or the
  // caret cannot stay where it was. A place the operation carried along is still
  // a blank line in the raw parse of the result, so `caret-policy`'s
  // addressability test rejects it as a trailing gap and falls back to the moved
  // node's content start — Tab on an interior position moved the caret to the
  // item's first line, off the line the user was about to type into.
  //
  // Gated on the place's own line, and on the mapped caret still being on it:
  // indent and outdent add and remove no lines, so the place keeps its index,
  // and anywhere else this would be guessing that a blank line is a place.
  const after =
    (placeLine !== undefined && mapped?.line === placeLine
      ? resolvedOutline(afterText, mapped.line, mapped.ch)
      : null) ?? parse(afterText);

  const { caret } = planCaret(op, { before, after, anchor: result.value.anchor, mapped });

  return {
    plan: {
      changes,
      selection: offsetInNewText(newLines, caret),
      userEvent,
      abandon: abandonEdit(abandonForm, lines, newLines, caret.line),
    },
  };
}

/**
 * The `abandon` edit for a plan whose operation turned `lines` into `newLines`
 * and left the caret on `caretLine` of the result.
 *
 * Both forms are line-level and go through `editsToChanges`, the same converter
 * every structural dispatch uses. That is deliberate: it already knows how to
 * express a whole-line removal at a document's END, where there is no following
 * line break to take, so neither form needs arithmetic of its own for it.
 */
function abandonEdit(
  form: AbandonForm,
  lines: readonly string[],
  newLines: readonly string[],
  caretLine: number,
): EditorChange[] | undefined {
  switch (form) {
    case 'none':
      return undefined;
    case 'reverse':
      return editsToChanges(newLines, diffLines(newLines, lines));
    case 'drop-line':
      return editsToChanges(newLines, [
        { fromLine: caretLine, toLine: caretLine + 1, insert: [] },
      ]);
  }
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
      // A continuation's whole purpose is the position it opens, so abandoning
      // it is the reversal of this insertion — which also puts back the
      // whitespace run the split-point rule consumed.
      abandon: abandonEdit('reverse', lines, newLines, newCursorLine),
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
          // Carried through VERBATIM, and this pass-through is the whole reason
          // a place opened over a block selection can be abandoned at all. The
          // outer `changes` are a fresh diff against the ORIGINAL text, but the
          // document they and the inner plan's changes produce is the same one,
          // so the inner edit is already in the right coordinate space. It
          // returns to the post-REMOVAL text, which is what abandoning means
          // here: the selection stays deleted, only the place goes.
          abandon: inner.plan.abandon,
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
      // Same reasoning as the cover branch above: the inner edit is already in
      // the final document's coordinates, and it returns to the text with the
      // character range removed — so abandoning an Enter that replaced a word
      // leaves the word deleted, which is the same rule rather than a case.
      abandon: inner.plan.abandon,
    },
  };
}

export function planKey(
  text: string,
  cursor: EditorPos,
  key: GrammarKey,
  fallbackIndentUnit?: string,
  selectionEnd?: EditorPos,
  placeLine?: number,
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
  const nodeStart = nodeStartLine(doc, node.id);
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

  // A structural operation acts on the OUTLINE, which is not the raw parse while
  // a provisional position is open interior to a node: the blank line bisects
  // that node, so `moveDown` walks half a paragraph past the other half, `indent`
  // turns half of one into a list item, and a cover stops at the position (all
  // measured — see the change's Findings). `resolvedOutline` is that tree, in the
  // buffer's own text so the edits it produces are correct against the buffer.
  //
  // `placeLine` — the line a structural keypress of OURS put a place on, which
  // only the adapter can know (`provisional-cleanup.ts`'s `createdPlaceLine`) —
  // is what makes this safe. The document alone cannot tell a place from a blank
  // line the user authored between two paragraphs, and here the difference has
  // teeth: measured, Tab with the caret on the gap between `para` and `last`
  // read the two as one node and indented both. The rendering layer takes the
  // truthful reading either way (`decorate-provisional-positions` D5); an
  // operation may not guess.
  //
  // Deliberately NOT used for the gates above. They decide whether the key is
  // declined at all, and the resolved tree makes the position one of the node's
  // own lines — so `onOwnLines` would become true there, and Enter on a position
  // would start splitting it instead of advancing past it
  // (`provisional-cleanup.ts`'s `advanceFromEmptyPlace`). What the key targets
  // changes; whether the key applies does not.
  const outline =
    placeLine === cursor.line ? resolvedOutline(text, cursor.line, cursor.ch) : null;
  const opDoc = outline ?? doc;
  const opNode = outline ? nodeAtLine(outline, cursor.line) : node;
  if (!opNode) return null;

  switch (key) {
    case 'indent':
      return planFromOp(
        lines,
        indent(opDoc, opNode.id, fallbackIndentUnit),
        'input.structure.indent',
        { kind: 'derived' },
        opDoc,
        'none',
        cursor,
        placeLine,
      );
    case 'outdent':
      return planFromOp(
        lines,
        outdent(opDoc, opNode.id, fallbackIndentUnit),
        'input.structure.outdent',
        { kind: 'derived' },
        opDoc,
        // Shift+Tab reaches the same operation the empty-item ladder does, and
        // an outdent that lands an empty item under a paragraph dissolves it
        // into a blank line. Stating the form by OPERATION rather than by key
        // is what keeps the two agreeing — the module that consumes this
        // already keys on where the caret landed, not on which key ran.
        'drop-line',
        cursor,
        placeLine,
      );
    case 'move-up':
      return planFromOp(
        lines,
        moveUp(opDoc, opNode.id),
        'move.structure',
        { kind: 'subject' },
        opDoc,
        'none',
      );
    case 'move-down':
      return planFromOp(
        lines,
        moveDown(opDoc, opNode.id),
        'move.structure',
        { kind: 'subject' },
        opDoc,
        'none',
      );
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
            'drop-line',
            cursor,
          );
        }
        return planFromOp(
          lines,
          unwrapListItem(doc, node.id),
          'input.structure.unwrap',
          { kind: 'exact' },
          doc,
          // Leaving the list is what the user asked for; only the blank line it
          // left behind is debris. A reversal here would put the `- ` back.
          'drop-line',
        );
      }
      return planFromOp(
        lines,
        splitNode(doc, node.id, cursor, fallbackIndentUnit),
        'input.structure.split',
        { kind: 'exact' },
        doc,
        'reverse',
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
          'reverse',
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
      // A DISTINCT event, not the generic `input` this used to carry. It IS in
      // `classify.ts`'s plugin-own list — it was excluded at first, on the
      // grounds that a continuation is always a single-line change inside one
      // node's own line and so cannot cross a boundary, which stopped being
      // true when this key started acting on a selection first: over a block
      // cover the composed change set deletes whole subtrees, classifies as
      // boundary-crossing, and gets REWRITTEN. What the name buys beyond the
      // short-circuit is a marker `provisional-cleanup.ts` can key on: recognising
      // this dispatch by its SHAPE (an `input` event inserting a line break)
      // also matched CodeMirror's own Enter, which runs in outline mode
      // whenever the grammar declines — on a gap line reached by a programmatic
      // placement, for instance — and that stock newline would then be recorded
      // as ours and undone when the caret moved.
      return insertionPlan(lines, at, `\n${prefix}`, 'input.structure.continue', consume);
    }
  }
}
