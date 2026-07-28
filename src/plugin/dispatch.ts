/**
 * Minimal line edits → editor change ranges ({line, ch} positions), for a
 * single `Editor.transaction`. Pure module, property-tested against the
 * library's own applyEdits (`minimal-change-dispatch`).
 *
 * Each `Edit` (a whole line-range replacement) is narrowed to the smallest
 * set of character-level ranges that produce the same resulting document:
 * unchanged leading/trailing lines are dropped, and the remaining lines are
 * diffed either per-line (when the edit doesn't change how many lines there
 * are — indent, outdent) or as one trimmed character span (when it does —
 * merge, split, delete). See design.md D2 for why both branches are needed:
 * a whole-region trim alone is minimal enough for a merge but not for an
 * indent, which changes several lines' leading whitespace independently.
 */

import type { Edit } from '../result';

export interface EditorPos {
  line: number;
  ch: number;
}

export interface EditorChange {
  from: EditorPos;
  to: EditorPos;
  text: string;
}

function commonPrefixLen(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

/** Common suffix length, bounded by `max` so it never overlaps a prefix already counted. */
function commonSuffixLen(a: string, b: string, max: number): number {
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/** How many lines match at the start and end of `oldLines`/`newLines`, without overlap. */
function trimCommonEnds(
  oldLines: readonly string[],
  newLines: readonly string[],
): { leading: number; trailing: number } {
  const maxLeading = Math.min(oldLines.length, newLines.length);
  let leading = 0;
  while (leading < maxLeading && oldLines[leading] === newLines[leading]) leading++;
  const maxTrailing = maxLeading - leading;
  let trailing = 0;
  while (
    trailing < maxTrailing &&
    oldLines[oldLines.length - 1 - trailing] === newLines[newLines.length - 1 - trailing]
  ) {
    trailing++;
  }
  return { leading, trailing };
}

/** Walk `pos` forward by `n` characters through `lines`, crossing newlines as single characters. */
function advance(lines: readonly string[], pos: EditorPos, n: number): EditorPos {
  let { line, ch } = pos;
  let remaining = n;
  while (remaining > 0) {
    const avail = (lines[line]?.length ?? 0) - ch;
    if (remaining <= avail) return { line, ch: ch + remaining };
    remaining -= avail + 1;
    line += 1;
    ch = 0;
  }
  return { line, ch };
}

/** Walk `pos` backward by `n` characters through `lines`, crossing newlines as single characters. */
function retreat(lines: readonly string[], pos: EditorPos, n: number): EditorPos {
  let { line, ch } = pos;
  let remaining = n;
  while (remaining > 0) {
    if (remaining <= ch) return { line, ch: ch - remaining };
    remaining -= ch + 1;
    line -= 1;
    ch = lines[line]?.length ?? 0;
  }
  return { line, ch };
}

/**
 * Same line count on both sides (indent, outdent, and any op that changes
 * lines' content without changing how many there are): diff each line pair
 * independently so an unrelated middle line — or the unchanged part of a
 * changed line — never ends up in the change set.
 */
function perLineChanges(
  startLine: number,
  oldMid: readonly string[],
  newMid: readonly string[],
): EditorChange[] {
  const changes: EditorChange[] = [];
  for (let i = 0; i < oldMid.length; i++) {
    const oldLine = oldMid[i]!;
    const newLine = newMid[i]!;
    if (oldLine === newLine) continue;
    const prefix = commonPrefixLen(oldLine, newLine);
    const suffix = commonSuffixLen(oldLine, newLine, Math.min(oldLine.length, newLine.length) - prefix);
    const line = startLine + i;
    changes.push({
      from: { line, ch: prefix },
      to: { line, ch: oldLine.length - suffix },
      text: newLine.slice(prefix, newLine.length - suffix),
    });
  }
  return changes;
}

/**
 * The whole-line-range envelope for replacing lines [fromLine, toLine) with
 * `insert`, plus the exact old text that envelope spans (needed to trim it
 * character-wise below). Handles the same doc-boundary cases the original
 * whole-region dispatch did: a replacement ending before EOF covers whole
 * lines including their trailing newlines; one reaching EOF has no trailing
 * newline to include, and a pure deletion through EOF must consume the
 * newline BEFORE it instead, since there is none after.
 */
function lineRangeEnvelope(
  lines: readonly string[],
  fromLine: number,
  toLine: number,
  insert: readonly string[],
): { from: EditorPos; to: EditorPos; text: string; oldSpanText: string } {
  const endOfDoc: EditorPos = {
    line: Math.max(0, lines.length - 1),
    ch: lines[lines.length - 1]?.length ?? 0,
  };

  // A pure APPEND past the last line — `fromLine === toLine === lines.length`,
  // which `diffLines` produces for an edit that only adds lines at the end.
  // There is no line `fromLine` to anchor at: `{line: lines.length, ch: 0}` is
  // one past the document, and the caller converts it with
  // `doc.line(from.line + 1)`, which throws. It also came out reversed
  // (`from` after `to`, since `to` is `endOfDoc`). Represent it as what it
  // actually is: an insertion AT the end of the document, carrying the
  // newline that has to separate it from the current last line.
  //
  // Reachable by pressing Enter at the end of a document's final paragraph,
  // with or without a trailing newline — `splitNode` emits
  // `[n, n) -> ['', '']` there. Pre-existing: the whole-region `editToChange`
  // this replaced had the identical final branch, so the shape was always
  // wrong; the per-line narrowing simply never made it right either.
  if (fromLine >= lines.length) {
    return {
      from: endOfDoc,
      to: endOfDoc,
      // The separator exists to detach the appended lines from the CURRENT
      // last line. An empty buffer (`lines` is `[]` — how every caller spells
      // `text === ''`) has none, so prepending one would insert a leading
      // blank line the edit never asked for: `[0,0) -> ['text']` produced
      // "\ntext" where `applyEdits` gives "text".
      text: (lines.length > 0 ? '\n' : '') + insert.join('\n'),
      oldSpanText: '',
    };
  }

  if (toLine < lines.length) {
    return {
      from: { line: fromLine, ch: 0 },
      to: { line: toLine, ch: 0 },
      text: insert.length > 0 ? insert.join('\n') + '\n' : '',
      oldSpanText: fromLine === toLine ? '' : lines.slice(fromLine, toLine).join('\n') + '\n',
    };
  }

  if (insert.length === 0) {
    if (fromLine === 0) {
      return { from: { line: 0, ch: 0 }, to: endOfDoc, text: '', oldSpanText: lines.join('\n') };
    }
    return {
      from: { line: fromLine - 1, ch: lines[fromLine - 1]?.length ?? 0 },
      to: endOfDoc,
      text: '',
      oldSpanText: '\n' + lines.slice(fromLine, lines.length).join('\n'),
    };
  }
  return {
    from: { line: fromLine, ch: 0 },
    to: endOfDoc,
    text: insert.join('\n'),
    oldSpanText: lines.slice(fromLine, lines.length).join('\n'),
  };
}

/**
 * Different line count on the two sides (merge, split, delete/insert a
 * line): the shape isn't per-line comparable, so trim the whole span as one
 * character-level unit — a merge's entire effect is a single deleted
 * line-break span, not several independently changed lines.
 */
function wholeRegionChange(
  lines: readonly string[],
  fromLine: number,
  toLine: number,
  newMid: readonly string[],
): EditorChange[] {
  const envelope = lineRangeEnvelope(lines, fromLine, toLine, newMid);
  const prefix = commonPrefixLen(envelope.oldSpanText, envelope.text);
  const suffix = commonSuffixLen(
    envelope.oldSpanText,
    envelope.text,
    Math.min(envelope.oldSpanText.length, envelope.text.length) - prefix,
  );
  const from = advance(lines, envelope.from, prefix);
  const to = retreat(lines, envelope.to, suffix);
  const text = envelope.text.slice(prefix, envelope.text.length - suffix);
  if (text === '' && from.line === to.line && from.ch === to.ch) return [];
  return [{ from, to, text }];
}

/**
 * Narrow one line-range `Edit` into the smallest set of character-level
 * changes that produce the same result (`minimal-change-dispatch`).
 */
export function editToChanges(lines: readonly string[], edit: Edit): EditorChange[] {
  const { fromLine, toLine, insert } = edit;
  const oldRegion = lines.slice(fromLine, toLine);
  const { leading, trailing } = trimCommonEnds(oldRegion, insert);
  const oldMid = oldRegion.slice(leading, oldRegion.length - trailing);
  const newMid = insert.slice(leading, insert.length - trailing);
  if (oldMid.length === 0 && newMid.length === 0) return [];

  const midFromLine = fromLine + leading;
  if (oldMid.length === newMid.length) return perLineChanges(midFromLine, oldMid, newMid);
  return wholeRegionChange(lines, midFromLine, toLine - trailing, newMid);
}

export function editsToChanges(lines: readonly string[], edits: readonly Edit[]): EditorChange[] {
  return edits.flatMap((edit) => editToChanges(lines, edit));
}

function offsetOf(lines: readonly string[], pos: EditorPos): number {
  let offset = 0;
  for (let i = 0; i < pos.line; i++) offset += (lines[i]?.length ?? 0) + 1;
  return offset + pos.ch;
}

/**
 * Map `oldPos` (a position in the pre-op buffer `lines`) forward through
 * `changes` (as produced by `editsToChanges` — ascending, non-overlapping)
 * to its corresponding flat character offset in the resulting text, using
 * assoc=1: a position sitting exactly at a change's boundary lands AFTER
 * that change's inserted text, never before it.
 *
 * This is not an arbitrary choice — it is the ONLY assoc that keeps a live
 * dispatch and a later redo of the same transaction in agreement.
 * `@codemirror/commands`' history redo restores a position with
 * `event.startSelection.map(event.changes.invertedDesc, 1)` — hardcoded
 * assoc=1 — regardless of what selection the original transaction stated,
 * UNLESS that selection was separately recorded into `selectionsAfter` (the
 * mechanism this change removes). CM6's own default live-mapping assoc is
 * -1 (`EditorSelection.map`'s default), so leaving indent/outdent to that
 * default disagrees with what redo later computes whenever the cursor sits
 * exactly at an edit boundary — e.g. Tab at a line's very start, converting
 * a paragraph into a list item, inserts the marker AT the cursor position:
 * live dispatch would leave the cursor at the very start of the line
 * (before the marker) while redo would land it after the marker. Computing
 * the SAME assoc=1 mapping here and dispatching it as an explicit selection
 * makes the two mathematically identical, with no recording needed.
 */
export function mapCursorForward(
  lines: readonly string[],
  changes: readonly EditorChange[],
  oldPos: EditorPos,
): number {
  const target = offsetOf(lines, oldPos);
  let delta = 0;
  for (const change of changes) {
    const from = offsetOf(lines, change.from);
    const to = offsetOf(lines, change.to);
    if (target < from) break;
    if (target <= to) return from + delta + change.text.length;
    delta += change.text.length - (to - from);
  }
  return target + delta;
}
