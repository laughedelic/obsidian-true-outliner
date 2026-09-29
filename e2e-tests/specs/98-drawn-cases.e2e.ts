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
  compareState,
  firstDifferingPhase,
  holdsMessage,
  judgeKnownFailing,
  passesMessage,
  phaseMessage,
  recordedCase,
  type CaseContext,
} from '../case-report.js';
import { recordKnownFailing } from '../known-failing.js';
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

/** The verdict of a `known-failing` case: still failing as recorded passes and is reported; a pass, or
 * a different result, fails the case. */
async function judgeMarked(ctx: CaseContext, states: EditorState[]): Promise<void> {
  const judged = judgeKnownFailing(ctx.parsed, states);
  if (judged.verdict === 'passes') throw new Error(passesMessage(ctx));
  const state = states[judged.phase]!;
  if (judged.verdict === 'changed') throw new Error(changedMessage(ctx, judged.phase, state));
  const message = holdsMessage(ctx, judged.phase, judged.differences, state);
  console.log(`[case] ${message}`);
  await recordKnownFailing({
    case: ctx.name,
    issue: ctx.parsed.knownFailing!,
    platform: ctx.platform,
    differs: judged.differences,
    drawing: message.split('\n').slice(1).join('\n'),
  });
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
    await h.setIndentUsingTabs(parsed.tabs);
    try {
      await h.createNote(`Scratch/cases/${name.replace(/[^\w-]+/g, '-')}.md`, parsed.before.text);
      await h.setOutlineMode(parsed.outline);
      const arranged = await arrange(parsed);
      if (!arranged.held) throw new Error(beforeMessage(ctx, arranged.state));

      // A `known-failing` case is judged on its states once they are read, and presses no key after
      // the first phase that differs from `expected`.
      const marked = parsed.knownFailing !== undefined;
      const states: EditorState[] = [];
      for (const [i, phase] of parsed.phases.entries()) {
        await pressPhase(phase, parsed.clipboard);
        states.push(await readEditorState());
        const expected = parsed.results[i];
        const differences = expected ? compareState(expected, states[i]!) : [];
        if (marked) {
          if (differences.length) break;
        } else if (!RECORD && differences.length) {
          throw new Error(phaseMessage(ctx, i, differences, states[i]!));
        }
      }
      if (!parsed.phases.length) {
        states.push(arranged.state);
        const expected = parsed.results[0];
        const differences = expected ? compareState(expected, arranged.state) : [];
        if (!marked && !RECORD && differences.length) throw new Error(phaseMessage(ctx, 0, differences, arranged.state));
      }
      if (marked && !RECORD) await judgeMarked(ctx, states);
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
