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
    verdict(ctx, differences.join(', ')),
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

// The notation's own glyphs in a note's text would read back as glyphs, so a case file cannot
// hold them.
const GLYPHS = /[┃«»‸∅▒]/;

/** The case file with its result columns filled from the states the app produced. */
export function recordedCase(parsed: ParsedCase, states: readonly EditorState[]): string {
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
