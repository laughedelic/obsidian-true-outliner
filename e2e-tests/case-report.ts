/**
 * What a drawn case reports: which parts of a state differ from the drawn `expected`, the message
 * a failure carries, and the case file a recording writes. Pure, so the unit suite covers it.
 */

import { drawDocument, keysLine, layout, type ParsedCase } from '../scripts/notation.ts';
import { drawState, stateNotes, type EditorState } from './state-drawing.js';

export type Difference = 'text' | 'caret' | 'selection' | 'block selection';

type Result = ParsedCase['results'][number];

/**
 * What differs between the state read and the `expected` column. A column that draws no caret,
 * selection or `▒` states nothing about them, so nothing is compared.
 */
export function compareState(expected: Result, actual: EditorState): Difference[] {
  const differences: Difference[] = [];
  if (actual.text !== expected.text) differences.push('text');
  if (expected.blockLines.length) {
    const same =
      actual.blockLines.length === expected.blockLines.length &&
      actual.blockLines.every((line, i) => line === expected.blockLines[i]);
    if (!same) differences.push('block selection');
  } else if (expected.selection) {
    const main = actual.ranges[actual.main];
    const same = main?.anchor === expected.selection.anchor && main.head === expected.selection.head;
    if (!same) differences.push(expected.selection.anchor === expected.selection.head ? 'caret' : 'selection');
  }
  return differences;
}

export interface CaseContext {
  /** The case file, as the failure names it. */
  name: string;
  platform: 'desktop' | 'mobile';
  parsed: ParsedCase;
}

/** `keys: ⇥ | ⇧⇥ · outline on · tabs off`, the line under the verdict. */
export function setupLine(parsed: ParsedCase): string {
  return `keys: ${keysLine(parsed.phases) || '(none)'} · outline ${parsed.outline ? 'on' : 'off'} · tabs ${parsed.tabs ? 'on' : 'off'}`;
}

function verdict(ctx: CaseContext, what: string): string {
  const ignored = ctx.parsed.references.length ? ` [ignored columns: ${ctx.parsed.references.join(', ')}]` : '';
  return `case ${ctx.name} differs in ${what} (${ctx.platform})${ignored}`;
}

/** The message for a `before` the editor did not hold: what was drawn, and what it holds. */
export function beforeMessage(ctx: CaseContext, held: EditorState): string {
  const notes = stateNotes(held).map((n) => `(held: ${n})`);
  return [
    verdict(ctx, 'before'),
    setupLine(ctx.parsed),
    layout([
      { header: 'before', lines: ctx.parsed.beforeLines },
      { header: 'held', lines: drawState(held) },
    ]),
    ...notes,
  ].join('\n');
}

/** The message for the first phase that differs: `before`, then that phase's `expected` and
 * `actual`. Later phases are not drawn, since they start from this one. */
export function phaseMessage(
  ctx: CaseContext,
  phase: number,
  differences: Difference[],
  actual: EditorState,
  firstLine: string = verdict(ctx, differences.join(', ')),
): string {
  const expected = ctx.parsed.results[phase];
  if (!expected) throw new Error(`no result column for phase ${phase + 1}`);
  const keys = ctx.parsed.phases[phase]?.map((s) => s.source).join(' ');
  const label = keys ? ` ${keys}` : '';
  const notes = stateNotes(actual).map((n) => `(actual: ${n})`);
  const unasserted =
    !expected.selection && expected.blockLines.length === 0
      ? ['(expected draws no caret or selection: none was compared)']
      : [];
  return [
    firstLine,
    setupLine(ctx.parsed),
    layout([
      { header: 'before', lines: ctx.parsed.beforeLines },
      { header: `expected${label}`, lines: expected.lines },
      { header: `actual${label}`, lines: drawState(actual) },
    ]),
    ...unasserted,
    ...notes,
  ].join('\n');
}

// ---- Known-failing cases -----------------------------------------------------------------------

export type KnownFailingVerdict =
  /** Every phase matches its `expected`: the bug is gone, and the marker with it. */
  | { verdict: 'passes' }
  /** The first differing phase gives the recorded `actual`: still failing as recorded. */
  | { verdict: 'holds'; phase: number; differences: Difference[] }
  /** The first differing phase gives neither `expected` nor `actual`. */
  | { verdict: 'changed'; phase: number; differences: Difference[] };

/**
 * The phase a case first differs at: the first whose state does not match its `expected` column.
 * `states` may stop at that phase, since a marked case presses no key after it.
 */
export function firstDifferingPhase(
  results: readonly Result[],
  states: readonly EditorState[],
): { phase: number; differences: Difference[] } | undefined {
  for (const [phase, expected] of results.entries()) {
    const state = states[phase];
    if (!state) throw new Error(`no state was read for phase ${phase + 1}`);
    const differences = compareState(expected, state);
    if (differences.length) return { phase, differences };
  }
  return undefined;
}

/**
 * What a `known-failing` case's run means. `differences` is how the state differs from `expected`
 * for `holds`, and from the recorded `actual` for `changed`.
 */
export function judgeKnownFailing(parsed: ParsedCase, states: readonly EditorState[]): KnownFailingVerdict {
  const first = firstDifferingPhase(parsed.results, states);
  if (!first) return { verdict: 'passes' };
  if (!parsed.actual) throw new Error('a known-failing case needs its "actual" column to be judged');
  const state = states[first.phase]!;
  const fromRecorded = compareState(parsed.actual, state);
  return fromRecorded.length
    ? { verdict: 'changed', phase: first.phase, differences: fromRecorded }
    : { verdict: 'holds', phase: first.phase, differences: first.differences };
}

const issueOf = (ctx: CaseContext): string => `#${ctx.parsed.knownFailing}`;

/** The message for a marked case whose every phase now matches: the marker is stale. */
export function passesMessage(ctx: CaseContext): string {
  return [
    `case ${ctx.name} no longer differs (${ctx.platform}): remove known-failing: ${issueOf(ctx)}`,
    setupLine(ctx.parsed),
  ].join('\n');
}

/** The message for a marked case that gave neither `expected` nor its recorded `actual`. */
export function changedMessage(ctx: CaseContext, phase: number, now: EditorState): string {
  const { actual } = ctx.parsed;
  const expected = ctx.parsed.results[phase];
  if (!expected || !actual) throw new Error(`no expected or actual column for phase ${phase + 1}`);
  const keys = ctx.parsed.phases[phase]?.map((s) => s.source).join(' ');
  const label = keys ? ` ${keys}` : '';
  return [
    `case ${ctx.name} differs from its recorded actual (${ctx.platform}): known-failing ${issueOf(ctx)}`,
    setupLine(ctx.parsed),
    layout([
      { header: 'before', lines: ctx.parsed.beforeLines },
      { header: `expected${label}`, lines: expected.lines },
      { header: `actual (recorded)${label}`, lines: actual.lines },
      { header: `actual (now)${label}`, lines: drawState(now) },
    ]),
    ...stateNotes(now).map((n) => `(now: ${n})`),
  ].join('\n');
}

/** The report of a marked case that still fails as recorded: the failure's drawing, under the issue. */
export function holdsMessage(ctx: CaseContext, phase: number, differences: Difference[], state: EditorState): string {
  return phaseMessage(
    ctx,
    phase,
    differences,
    state,
    `known-failing ${issueOf(ctx)}: case ${ctx.name} still differs in ${differences.join(', ')} (${ctx.platform})`,
  );
}

// The notation's own glyphs in a note's text would read back as glyphs, so a case file cannot
// hold them.
const GLYPHS = /[┃«»‸∅▒]/;

/** The case file with its result columns filled from the states the app produced. */
export function recordedCase(parsed: ParsedCase, states: readonly EditorState[]): string {
  if (parsed.knownFailing !== undefined) return recordedKnownFailing(parsed, states);
  const glyph = states.find((s) => GLYPHS.test(s.text));
  if (glyph) throw new Error('the document holds a character the notation draws with (┃ « » ‸ ∅ ▒); it cannot be recorded');
  const head: string[] = [];
  if (parsed.title) head.push(`case: ${parsed.title}`);
  if (!parsed.outline) head.push('outline: off');
  if (parsed.tabs) head.push('tabs: on');
  if (parsed.platform) head.push(`platform: ${parsed.platform}`);
  if (parsed.phases.length) head.push(`keys: ${keysLine(parsed.phases)}`);
  const column = (header: string, lines: readonly string[]) => [`=== ${header}`, ...lines];
  const out = [...head, ''];
  if (parsed.clipboard !== undefined) out.push(...column('clipboard', drawDocument({ text: parsed.clipboard })));
  out.push(...column('before', parsed.beforeLines));
  states.forEach((state, i) => {
    const keys = parsed.phases[i]?.map((s) => s.source).join(' ');
    out.push(...column(keys ? `after ${keys}` : 'after', drawState(state)));
  });
  return out.join('\n') + '\n';
}

/**
 * A `known-failing` file with its marker and `expected` columns kept, and the state the app gave at
 * the first phase that differs from them as `actual`. A caret, selection or `▒` is drawn only where
 * that phase's `expected` draws one, so the column pins what `expected` states.
 */
function recordedKnownFailing(parsed: ParsedCase, states: readonly EditorState[]): string {
  const glyph = states.find((s) => GLYPHS.test(s.text));
  if (glyph) throw new Error('the document holds a character the notation draws with (┃ « » ‸ ∅ ▒); it cannot be recorded');
  const head: string[] = [];
  if (parsed.title) head.push(`case: ${parsed.title}`);
  if (!parsed.outline) head.push('outline: off');
  if (parsed.tabs) head.push('tabs: on');
  if (parsed.platform) head.push(`platform: ${parsed.platform}`);
  head.push(`known-failing: #${parsed.knownFailing}`);
  if (parsed.phases.length) head.push(`keys: ${keysLine(parsed.phases)}`);
  const column = (header: string, lines: readonly string[]) => [`=== ${header}`, ...lines];
  const out = [...head, ''];
  if (parsed.clipboard !== undefined) out.push(...column('clipboard', drawDocument({ text: parsed.clipboard })));
  out.push(...column('before', parsed.beforeLines));
  for (const result of parsed.results) out.push(...column(result.header, result.lines));
  const first = firstDifferingPhase(parsed.results, states);
  if (first) {
    const expected = parsed.results[first.phase]!;
    const state = states[first.phase]!;
    const main = state.ranges[state.main];
    const keys = parsed.phases[first.phase]?.map((s) => s.source).join(' ');
    const lines = drawDocument({
      text: state.text,
      ranges: !expected.blockLines.length && expected.selection && main ? [main] : [],
      blockLines: expected.blockLines.length ? state.blockLines : [],
    });
    out.push(...column(keys ? `actual ${keys}` : 'actual', lines));
  }
  return out.join('\n') + '\n';
}
