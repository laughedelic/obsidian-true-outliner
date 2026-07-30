/**
 * Minimal line edits → editor change ranges ({line, ch} positions), for a
 * single `Editor.transaction`. Pure module, property-tested against the
 * library's own applyEdits (`minimal-change-dispatch`).
 *
 * Each `Edit` (a whole line-range replacement) is narrowed to the smallest
 * set of character-level ranges that produce the same resulting document.
 * The narrowing is a line-level ALIGNMENT first: lines the edit keeps —
 * wherever they end up — are matched and excluded, leaving a set of changed
 * runs. Each run is then diffed either per-line (when it has the same
 * number of lines on both sides — indent, outdent) or as one trimmed
 * character span (when it doesn't — merge, split, delete). See design.md D2
 * for why both per-run branches are needed: a whole-region trim alone is
 * minimal enough for a merge but not for an indent, which changes several
 * lines' leading whitespace independently.
 *
 * The alignment is what makes a REORDER expressible. `diffLines` describes
 * every operation as one contiguous line-range replacement, and a swap
 * preserves line count, so without alignment a move takes the per-line
 * branch and is narrowed into "every line in the region was edited in
 * place" — including partial character edits INSIDE lines the move never
 * touched. That is not merely unminimal, it is a false description of what
 * happened, and Obsidian's live table widget corrupts its own document when
 * it reconciles against it (a sibling moving past a table split the table's
 * header from its body). Aligned, the same move becomes what it is: the
 * moved lines deleted from one side and inserted on the other, with the
 * passed-over block's characters in no change range at all.
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

/**
 * A run of lines the edit actually changes: old lines
 * [oldStart, oldEnd) become new lines [newStart, newEnd). Either side may
 * be empty — a pure insertion or a pure deletion.
 */
interface ChangedRun {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

/**
 * Lines occurring EXACTLY ONCE on both sides, paired by content and reduced
 * to the longest chain of pairs increasing on both sides — the anchoring
 * rule from patience diff.
 *
 * Uniqueness is the whole point. Matching any equal line would anchor on
 * blank lines and repeated markers, fragmenting a relocated block into
 * spurious runs; matching only lines that are unambiguous on both sides
 * keeps a moved block whole, and ambiguous lines simply fall into a changed
 * run, where the character-level narrowing still trims them. Anchors need
 * not be recovered exhaustively: missing one costs minimality, never
 * correctness.
 */
function uniqueAnchors(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const indexUnique = (lines: readonly string[]): Map<string, number> => {
    const seen = new Map<string, number>();
    lines.forEach((line, i) => seen.set(line, seen.has(line) ? -1 : i));
    return seen;
  };
  const inA = indexUnique(a);
  const inB = indexUnique(b);

  const pairs: Array<[number, number]> = [];
  for (const [line, i] of inA) {
    if (i === -1) continue;
    const j = inB.get(line);
    if (j === undefined || j === -1) continue;
    pairs.push([i, j]);
  }
  pairs.sort((x, y) => x[0] - y[0]);

  // Longest increasing subsequence on the second coordinate.
  const tails: number[] = [];
  const previous = new Array<number>(pairs.length).fill(-1);
  for (let p = 0; p < pairs.length; p++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]!]![1] < pairs[p]![1]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous[p] = tails[lo - 1]!;
    tails[lo] = p;
  }
  const chain: Array<[number, number]> = [];
  for (let p = tails.length > 0 ? tails[tails.length - 1]! : -1; p !== -1; p = previous[p]!) {
    chain.push(pairs[p]!);
  }
  return chain.reverse();
}

/**
 * Align `a` against `b` at the line level, appending the runs that differ
 * to `out` in ascending order. Common leading and trailing lines are
 * dropped, unique anchors split what remains, and each gap between anchors
 * is aligned the same way — so a block that merely moved is matched at its
 * new position and never appears in a run.
 *
 * Iterative rather than recursive. Uniqueness is decided per segment, so a
 * line that was ambiguous in the whole region can become an anchor once the
 * region is narrowed — which means the number of times this can subdivide is
 * bounded by the line count, not by anything smaller, and a deep enough chain
 * of such narrowings would exhaust the call stack. That would take a
 * pathological document to reach and none was found, but "narrowing a change
 * set must not be able to throw" is cheaper to guarantee than to argue: the
 * segments live on an explicit stack instead. They are pushed in reverse so
 * they pop in document order, which is what keeps `out` ascending.
 */
interface AlignSegment {
  readonly a: readonly string[];
  readonly b: readonly string[];
  readonly aOffset: number;
  readonly bOffset: number;
}

function alignLines(
  a: readonly string[],
  b: readonly string[],
  aOffset: number,
  bOffset: number,
  out: ChangedRun[],
): void {
  const pending: AlignSegment[] = [{ a, b, aOffset, bOffset }];

  while (pending.length > 0) {
    const segment = pending.pop()!;
    const { a: segA, b: segB } = segment;

    const maxLeading = Math.min(segA.length, segB.length);
    let leading = 0;
    while (leading < maxLeading && segA[leading] === segB[leading]) leading++;
    const maxTrailing = maxLeading - leading;
    let trailing = 0;
    while (
      trailing < maxTrailing &&
      segA[segA.length - 1 - trailing] === segB[segB.length - 1 - trailing]
    ) {
      trailing++;
    }

    const aMid = segA.slice(leading, segA.length - trailing);
    const bMid = segB.slice(leading, segB.length - trailing);
    if (aMid.length === 0 && bMid.length === 0) continue;

    const aMidOffset = segment.aOffset + leading;
    const bMidOffset = segment.bOffset + leading;
    const anchors = aMid.length > 0 && bMid.length > 0 ? uniqueAnchors(aMid, bMid) : [];

    if (anchors.length === 0) {
      out.push({
        oldStart: aMidOffset,
        oldEnd: aMidOffset + aMid.length,
        newStart: bMidOffset,
        newEnd: bMidOffset + bMid.length,
      });
      continue;
    }

    const gaps: AlignSegment[] = [];
    let ai = 0;
    let bi = 0;
    for (const [x, y] of anchors) {
      gaps.push({
        a: aMid.slice(ai, x),
        b: bMid.slice(bi, y),
        aOffset: aMidOffset + ai,
        bOffset: bMidOffset + bi,
      });
      ai = x + 1;
      bi = y + 1;
    }
    gaps.push({
      a: aMid.slice(ai),
      b: bMid.slice(bi),
      aOffset: aMidOffset + ai,
      bOffset: bMidOffset + bi,
    });
    for (let i = gaps.length - 1; i >= 0; i--) pending.push(gaps[i]!);
  }
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
 * The distinct lines on each side of one edit. Edit-wide, not run-wide: a
 * relocated line and the line that took its place usually end up in DIFFERENT
 * runs, separated by whatever the alignment did manage to anchor, so a run on
 * its own cannot see that its lines went somewhere rather than being
 * rewritten.
 */
interface EditSides {
  readonly before: ReadonlySet<string>;
  readonly after: ReadonlySet<string>;
}

/**
 * Whether pairing these two lines describes a RELOCATION rather than an edit.
 *
 * The per-line branch trims a pair down to the characters that differ, which
 * is only truthful when old line `i` and new line `i` are the same line, edited
 * — the alignment above establishes that for every run it can anchor. When a
 * region repeats its lines the alignment can run out of unique anchors, and a
 * leftover run then pairs lines that merely swapped places. Character trimming
 * on such a pair finds an accidental common prefix and suffix — table rows
 * share `| ` and ` |`, so `| a   | b   |` against `| --- | --- |` narrows to a
 * change starting partway INTO a row the operation actually left alone, which
 * is exactly the description that makes the live table widget split its table.
 *
 * Evidence of a shuffle has to point BOTH ways: the old line reappears among
 * the edit's new lines *and* the new line was already among its old ones. One
 * direction alone is not evidence, only coincidence — indenting `- a` whose
 * children are two identical `  - a` lines produces `  - a` as the parent's
 * new text, so the old child matches the new parent and every line of an
 * ordinary indent looks relocated. That cost the indent its minimal change
 * set and, because `planCaret` maps the caret through it, moved the caret to
 * the end of the line instead of keeping its column. Requiring both
 * directions keeps the coincidence out while still catching a real swap,
 * where each side genuinely holds the other's lines.
 */
function relocates(oldLine: string, newLine: string, sides: EditSides): boolean {
  return sides.after.has(oldLine) && sides.before.has(newLine);
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
  sides: EditSides,
): EditorChange[] {
  const changes: EditorChange[] = [];
  for (let i = 0; i < oldMid.length; i++) {
    const oldLine = oldMid[i]!;
    const newLine = newMid[i]!;
    if (oldLine === newLine) continue;
    const moved = relocates(oldLine, newLine, sides);
    const prefix = moved ? 0 : commonPrefixLen(oldLine, newLine);
    const suffix = moved
      ? 0
      : commonSuffixLen(oldLine, newLine, Math.min(oldLine.length, newLine.length) - prefix);
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
  sides: EditSides,
): EditorChange[] {
  const envelope = lineRangeEnvelope(lines, fromLine, toLine, newMid);
  let prefix = commonPrefixLen(envelope.oldSpanText, envelope.text);
  let suffix = commonSuffixLen(
    envelope.oldSpanText,
    envelope.text,
    Math.min(envelope.oldSpanText.length, envelope.text.length) - prefix,
  );

  // The trim runs over the span's text as a whole, so it can stop in the
  // middle of a line — which is right for a split or a join, where that line
  // really is being edited, and wrong for a line that only relocated: two
  // table rows share `| ` and ` |`, and trimming those would start the change
  // partway into a row the operation left alone. Give those characters back.
  let from = advance(lines, envelope.from, prefix);
  const overshoot = lineStartOvershoot(lines, from, sides);
  if (overshoot > 0) from = advance(lines, envelope.from, (prefix -= overshoot));

  let to = retreat(lines, envelope.to, suffix);
  const undershoot = lineEndUndershoot(lines, to, sides);
  if (undershoot > 0) to = retreat(lines, envelope.to, (suffix -= undershoot));

  const text = envelope.text.slice(prefix, envelope.text.length - suffix);
  if (text === '' && from.line === to.line && from.ch === to.ch) return [];
  return [{ from, to, text }];
}

/** How far `pos` sits past the start of a relocated line — 0 if trimming to it was fine. */
function lineStartOvershoot(lines: readonly string[], pos: EditorPos, sides: EditSides): number {
  const line = lines[pos.line];
  if (line === undefined || pos.ch === 0 || pos.ch === line.length) return 0;
  return sides.after.has(line) ? pos.ch : 0;
}

/** How far `pos` sits short of the end of a relocated line — 0 if trimming to it was fine. */
function lineEndUndershoot(lines: readonly string[], pos: EditorPos, sides: EditSides): number {
  const line = lines[pos.line];
  if (line === undefined || pos.ch === 0 || pos.ch === line.length) return 0;
  return sides.after.has(line) ? line.length - pos.ch : 0;
}

/**
 * Whether `a` is strictly after `b` in the document. Both are valid positions
 * in the same line space, so this is lexicographic — deliberately NOT via
 * `offsetOf`, which walks the document from line 0 and would make its caller
 * quadratic in the document's length.
 */
function isAfter(a: EditorPos, b: EditorPos): boolean {
  return a.line > b.line || (a.line === b.line && a.ch > b.ch);
}

/**
 * Narrow one aligned run into character-level changes: per-line when the run
 * has the same number of lines on both sides (indent, outdent, and the
 * changed lines of any in-place rewrite), one trimmed character span when it
 * does not (merge, split, an insertion, a deletion).
 */
function changesForRun(
  lines: readonly string[],
  insert: readonly string[],
  run: ChangedRun,
  sides: EditSides,
): EditorChange[] {
  const newMid = insert.slice(run.newStart, run.newEnd);
  if (run.oldEnd - run.oldStart === run.newEnd - run.newStart) {
    return perLineChanges(run.oldStart, lines.slice(run.oldStart, run.oldEnd), newMid, sides);
  }
  return wholeRegionChange(lines, run.oldStart, run.oldEnd, newMid, sides);
}

/**
 * Narrow one line-range `Edit` into the smallest set of character-level
 * changes that produce the same result (`minimal-change-dispatch`).
 */
export function editToChanges(lines: readonly string[], edit: Edit): EditorChange[] {
  const runs: ChangedRun[] = [];
  alignLines(lines.slice(edit.fromLine, edit.toLine), edit.insert, edit.fromLine, 0, runs);

  // Which lines exist on each side of this edit, so the narrowing below can
  // tell a line that was rewritten from one that only moved.
  const sides: EditSides = {
    before: new Set(lines.slice(edit.fromLine, edit.toLine)),
    after: new Set(edit.insert),
  };

  // Runs are ascending and disjoint in LINE space, but two of them can still
  // narrow to the same character POSITION, because `lineRangeEnvelope` has to
  // anchor a run with no line to sit on somewhere real: an insertion past the
  // last line becomes an insertion AT the end of the document, and a deletion
  // through the end borrows the newline BEFORE it. Either can coincide with
  // the run in front of it — reachable whenever an alignment anchors on the
  // empty last line of a document that ends in a newline, e.g.
  // `["para", ""]` → `["para", "- a", "", "- b"]`, which narrowed to two
  // insertions both at {line 1, ch 0}.
  //
  // Applied in emission order that is still the right document (CodeMirror
  // keeps equal-`from` specs in the order given), but it breaks the ordering
  // this capability requires, and every position-based consumer with it:
  // `mapCursorForward` below stops at the first of the two, and a change set
  // re-sorted by position produces different text.
  //
  // Merging the two runs restores the invariant and stays correct by
  // construction: what separates consecutive runs is matched lines, identical
  // and equally many on both sides, so a merged run spans the same text.
  for (let i = 1; i < runs.length; ) {
    const before = changesForRun(lines, edit.insert, runs[i - 1]!, sides).at(-1);
    const after = changesForRun(lines, edit.insert, runs[i]!, sides)[0];
    if (before && after && !isAfter(after.from, before.to)) {
      runs.splice(i - 1, 2, {
        oldStart: runs[i - 1]!.oldStart,
        oldEnd: runs[i]!.oldEnd,
        newStart: runs[i - 1]!.newStart,
        newEnd: runs[i]!.newEnd,
      });
      if (i > 1) i -= 1; // the merged run may now collide with the one before it
    } else {
      i += 1;
    }
  }

  return runs.flatMap((run) => changesForRun(lines, edit.insert, run, sides));
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
    // At the START of a REPLACEMENT, CM6 leaves the position where it is; only
    // an insertion (`from === to`) carries it past the inserted text. Measured
    // against `ChangeDesc.mapPos(pos, 1)` — replacing [3,6) with "XY" maps 3 to
    // 3, while inserting "XY" at 3 maps 3 to 5. Treating both alike put the
    // caret after the replacement instead, which the line alignment made
    // reachable: a run can now begin exactly on the caret's own line start,
    // where the single trimmed region it replaced never did.
    if (target === from && from < to) return target + delta;
    if (target <= to) return from + delta + change.text.length;
    delta += change.text.length - (to - from);
  }
  return target + delta;
}
