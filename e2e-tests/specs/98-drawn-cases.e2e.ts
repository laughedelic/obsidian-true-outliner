/**
 * Drawn case files, run in the real app: every `*.case` under e2e-tests/cases/, or the files
 * `TO_CASE_FILES` names. The format is `scripts/notation.ts`'s
 * `parseCase`; what a failure prints is `../case-report.ts`. The same spec covers the state
 * helper, since both read the editor the same way.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseCase, type ParsedCase } from '../../scripts/notation.ts';
import {
  beforeMessage,
  changedMessage,
  firstDifferingPhase,
  holdsMessage,
  judgeKnownFailing,
  passesMessage,
  phaseMessage,
  recordedCase,
  runPhases,
  type CaseContext,
} from '../case-report.js';
import { recordKnownFailing } from '../known-failing.js';
import type { KnownFailingEntry } from '../../scripts/known-failing.ts';
import { caseFiles, CASES_DIR, pressPhase } from '../cases.js';
import { drawEditor, readEditorState, type EditorState } from '../drawing.js';
import * as h from '../helpers.js';

const PLATFORM = h.IS_MOBILE_RUN ? 'mobile' : 'desktop';
const RECORD = process.env.TO_CASE_RECORD === '1';
const RECORD_DIR = path.join(process.cwd(), '.obsidian-cache', 'cases');

/** What the `before` column draws, as a range to select: its caret or selection, or the whole
 * of the `▒` lines. */
function beforeRange(parsed: ParsedCase): { anchor: number; head: number } {
  if (parsed.before.selection) return parsed.before.selection;
  const lines = parsed.before.text.split('\n');
  const first = parsed.before.blockLines[0];
  const last = parsed.before.blockLines.at(-1);
  if (first === undefined || last === undefined) return { anchor: 0, head: 0 };
  const offset = (line: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
  return { anchor: offset(first), head: offset(last) + (lines[last]?.length ?? 0) };
}

/** Puts the focus and selection where `before` draws them, and reports whether the editor kept
 * them. A caret a task-item widget moves after mounting is put back until the budget is spent. */
async function arrange(parsed: ParsedCase): Promise<{ held: boolean; state: EditorState }> {
  const range = beforeRange(parsed);
  let state = await readEditorState();
  const holds = (s: EditorState): boolean => {
    if (s.text !== parsed.before.text) return false;
    if (parsed.before.blockLines.length) {
      return s.blockLines.join() === parsed.before.blockLines.join();
    }
    // A `before` that draws no caret states no selection, so only its text is held to.
    if (!parsed.before.selection) return true;
    const main = s.ranges[s.main];
    return s.ranges.length === 1 && main?.anchor === range.anchor && main.head === range.head;
  };
  try {
    await browser.waitUntil(
      async () => {
        await browser.executeObsidian(
          ({ app, obsidian }, anchor, head) => {
            const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
            if (!view) throw new Error('no active markdown view');
            view.editor.focus();
            (view.editor as any).cm.dispatch({ selection: { anchor, head }, userEvent: 'select' });
          },
          range.anchor,
          range.head,
        );
        state = await readEditorState();
        return holds(state);
      },
      { timeout: h.waitBudget(3000), interval: 50 },
    );
    return { held: true, state };
  } catch {
    return { held: false, state };
  }
}

/** Where a still-failing case leaves its record; a test passes its own to keep the run's summary clean. */
type Report = (entry: KnownFailingEntry) => Promise<void>;

/** The verdict of a `known-failing` case: still failing as recorded passes and is reported; a pass, or
 * a different result, fails the case. */
async function judgeMarked(ctx: CaseContext, states: EditorState[], report: Report): Promise<void> {
  const judged = judgeKnownFailing(ctx.parsed, states);
  if (judged.verdict === 'passes') throw new Error(passesMessage(ctx));
  const state = states[judged.phase]!;
  if (judged.verdict === 'changed') throw new Error(changedMessage(ctx, judged.phase, state));
  const message = holdsMessage(ctx, judged.phase, judged.differences, state);
  console.log(`[case] ${message}`);
  await report({
    case: ctx.name,
    issue: ctx.parsed.knownFailing!,
    platform: ctx.platform,
    differs: judged.differences,
    drawing: message.split('\n').slice(1).join('\n'),
  });
}

/** Runs one parsed case in the app: arranges its note, presses its phases and judges the states. */
async function runCase(ctx: CaseContext, report: Report = recordKnownFailing): Promise<void> {
  const { name, parsed } = ctx;
  await h.setIndentUsingTabs(parsed.tabs);
  try {
    await h.createNote(`Scratch/cases/${name.replace(/[^\w-]+/g, '-')}.md`, parsed.before.text);
    await h.setOutlineMode(parsed.outline);
    const arranged = await arrange(parsed);
    if (!arranged.held) throw new Error(beforeMessage(ctx, arranged.state));

    // A `known-failing` case is judged on its states once they are read.
    const marked = parsed.knownFailing !== undefined;
    const { states, failure } = await runPhases(
      parsed,
      arranged.state,
      { press: (phase) => pressPhase(phase, parsed.clipboard), read: readEditorState },
      { record: RECORD },
    );
    if (failure) throw new Error(phaseMessage(ctx, failure.phase, failure.differences, states[failure.phase]!));
    if (marked && !RECORD) await judgeMarked(ctx, states, report);
    if (marked && RECORD && !firstDifferingPhase(parsed.results, states)) {
      console.log(`[case] ${name}: no phase differs from expected, so known-failing would be an unexpected pass; no actual is written`);
    }
    if (RECORD) {
      mkdirSync(RECORD_DIR, { recursive: true });
      const out = path.join(RECORD_DIR, `${name.replace(/[^\w-]+/g, '-')}.${PLATFORM}.case`);
      const recorded = recordedCase(parsed, states);
      writeFileSync(out, recorded);
      console.log(`[case] recorded ${path.relative(process.cwd(), out)}:\n${recorded}`);
    }
  } finally {
    // Both settings go back to their defaults, whatever ended the case.
    await h.setIndentUsingTabs(false);
    if (!parsed.outline) await h.setOutlineMode(true).catch(() => undefined);
  }
}

function register(file: string): void {
  const rel = path.relative(CASES_DIR, file);
  // A file outside the repository, run by `npm run case`, is named by its own file name.
  const name = (rel.startsWith('..') ? path.basename(file) : rel).replace(/\.case$/, '');
  let parsed: ParsedCase;
  try {
    parsed = parseCase(readFileSync(file, 'utf8'), { record: RECORD });
  } catch (e) {
    it(`${name}: does not parse`, function () {
      throw new Error(`${file}: ${(e as Error).message}`);
    });
    return;
  }
  const ctx: CaseContext = { name, platform: PLATFORM, parsed };
  it(`${name}${parsed.title ? `: ${parsed.title}` : ''}`, async function () {
    if (parsed.platform && parsed.platform !== PLATFORM) {
      console.log(`[case] ${name} skipped: it runs on ${parsed.platform} only`);
      this.skip();
    }
    await runCase(ctx);
  });
}

describe('drawn cases', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  after(async function () {
    await obsidianPage.resetVault();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  for (const file of caseFiles()) register(file);
});

// The helper is read against states this spec arranges, not against case files, so it runs
// beside the cases rather than under them. Skipped when `TO_CASE_FILES` narrows the run.
(process.env.TO_CASE_FILES ? describe.skip : describe)('the editor drawn as it is read', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  after(async function () {
    await obsidianPage.resetVault();
    await h.setIndentUsingTabs(false);
  });

  it('draws the caret where the state has it', async function () {
    await h.createNote('Scratch/drawing-caret.md', '- a\n- b\n');
    await h.setOutlineMode(true);
    await h.setCursorSettled(1, 3);
    expect(await drawEditor('now')).toBe([' now', '┆- a', '┆- b┃'].join('\n'));
  });

  it('draws a block selection as ▒ with no caret, and the editor without focus', async function () {
    await h.createNote('Scratch/drawing-block.md', '- a\n- b\n- c\n');
    await h.setOutlineMode(true);
    await h.setCursorSettled(1, 3);
    await h.pressSelectAll();
    await h.pressSelectAll();
    const state = await readEditorState();
    expect(state.blockLines).toEqual([1]);
    expect(state.focused).toBe(false);
    expect(await drawEditor('⌘A ⌘A')).toBe([' ⌘A ⌘A', '┆- a', '▒- b', '┆- c'].join('\n'));
  });

  it('draws a stock selection across lines, backward, as one range', async function () {
    await h.createNote('Scratch/drawing-stock.md', '- a\n- b\n- c\n');
    await h.setOutlineMode(false);
    await h.setSelection({ line: 2, ch: 1 }, { line: 0, ch: 2 });
    const state = await readEditorState();
    expect(state.ranges).toHaveLength(1);
    const underlined = (s: string) => [...s].map((c) => `${c}̲`).join('');
    expect(await drawEditor('stock')).toBe(
      [' stock', `┆- ┃${underlined('a')}`, `┆${underlined('- b')}`, `┆${underlined('-')} c`].join('\n'),
    );
  });

  it('draws the main range and says how many there were', async function () {
    await h.createNote('Scratch/drawing-ranges.md', 'ab\ncd\n');
    await h.setOutlineMode(false);
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 1 } },
      { anchor: { line: 1, ch: 1 }, head: { line: 1, ch: 1 } },
    ]);
    const drawn = await drawEditor('two');
    expect(drawn).toContain('(two: 2 ranges; the main one is drawn)');
  });
});

// A known-failing case run in the app, from sources given here, so the runner's own paths are
// covered beside the shipped case files. Skipped when `TO_CASE_FILES` narrows the run.
(process.env.TO_CASE_FILES ? describe.skip : describe)('a known-failing case, run', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  after(async function () {
    await obsidianPage.resetVault();
    await h.setIndentUsingTabs(false);
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  const ctxOf = (source: string): CaseContext => ({ name: 'inline/marked', platform: PLATFORM, parsed: parseCase(source) });
  const run = async (source: string): Promise<{ error: Error | undefined; reported: KnownFailingEntry[] }> => {
    const reported: KnownFailingEntry[] = [];
    try {
      await runCase(ctxOf(source), async (entry) => void reported.push(entry));
      return { error: undefined, reported };
    } catch (e) {
      return { error: e as Error, reported };
    }
  };

  // The first phase types x, the second would type y; `actual` is what the first phase gives.
  const TWO_PHASES = (first: string, actual: string) =>
    ['known-failing: #7', 'keys: "x" | "y"', '', '=== before', 'a┃', '=== after "x"', first, '=== after "y"', 'q', '=== actual', actual, ''].join('\n');

  it('passes and reports itself while the first differing phase gives its recorded result, pressing no key after it', async function () {
    const { error, reported } = await run(TWO_PHASES('zz┃', 'ax┃'));
    expect(error).toBeUndefined();
    expect(reported).toMatchObject([{ case: 'inline/marked', issue: 7, platform: PLATFORM, differs: ['text'] }]);
    expect((await readEditorState()).text).toBe('ax\n');
  });

  it('fails when every phase matches its expected column, telling us to remove the marker', async function () {
    const { error, reported } = await run(
      ['known-failing: #7', 'keys: "x"', '', '=== before', 'a┃', '=== expected', 'ax┃', '=== actual', 'zz┃', ''].join('\n'),
    );
    expect(error?.message.split('\n')[0]).toBe(`case inline/marked no longer differs (${PLATFORM}): remove known-failing: #7`);
    expect(reported).toEqual([]);
  });

  it('fails when the phase gives neither expected nor its recorded result', async function () {
    const { error, reported } = await run(TWO_PHASES('zz┃', 'yy┃'));
    expect(error?.message.split('\n')[0]).toBe(`case inline/marked differs from its recorded actual (${PLATFORM}): known-failing #7`);
    expect(reported).toEqual([]);
  });

  it('does not hide a before the editor cannot hold', async function () {
    const source = ['known-failing: #7', 'keys: ⇥', '', '=== before', '-┃ a', '=== expected', '- a', '=== actual', '- b', ''].join('\n');
    const { error, reported } = await run(source);
    expect(error?.message.split('\n')[0]).toBe(`case inline/marked differs in before (${PLATFORM})`);
    expect(reported).toEqual([]);
  });
});
