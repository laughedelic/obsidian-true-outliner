/**
 * The fold service in a real Obsidian: what the provider makes foldable, what
 * it deliberately does not, and what Obsidian's own fold does with it.
 *
 * This spec started as `better-folding-ux`'s task-1 gate — the measurement that
 * decides whether the design's premise holds — and stays as the test that keeps
 * each answer. What it asserts is therefore phrased as the gate asked it:
 *
 * - our range is what `foldable()` reports, for every kind that can hold
 *   children, INCLUDING a paragraph, which Obsidian cannot fold on its own;
 * - a `null` from us is not a veto, so an atom's own native fold survives and
 *   we draw nothing for it;
 * - Obsidian's own `editor:toggle-fold` folds through our answer.
 *
 * What is NOT asserted here, deliberately: how any of this behaves with
 * Obsidian's "Fold heading" / "Fold indent" settings off. Driving those from
 * the harness proved unreliable — the same call left the indicators in place in
 * one sequence and removed them in another, and in a third it left the editor
 * unable to apply a fold at all — so every reading taken through it was
 * untrustworthy in both directions. The question is real and open; it is
 * recorded in docs/research/28 rather than asserted by a test that would flake.
 *
 * CM6's fold exports are not reachable from the renderer's `require`, only from
 * plugin module scope, so the folded ranges are read through the plugin's own
 * `foldState()` probe rather than by importing the package here — the same
 * route docs/research/28 measured through.
 */

import { browser, expect } from '@wdio/globals';
import * as h from '../helpers.js';

const NOTE = 'Scratch/fold-service.md';

/*  0 | # Top
    1 |
    2 | Paragraph with children:
    3 |
    4 | - one
    5 |   - nested a
    6 |   - nested b
    7 | 1. ordered parent
    8 |    1. ordered child
    9 | - [ ] task parent
   10 |   - task child
   11 |
   12 | ## Second
   13 |
   14 | Tail para.
   15 |                                                                        */
const DOC = [
  '# Top',
  '',
  'Paragraph with children:',
  '',
  '- one',
  '  - nested a',
  '  - nested b',
  '1. ordered parent',
  '   1. ordered child',
  '- [ ] task parent',
  '  - task child',
  '',
  '## Second',
  '',
  'Tail para.',
  '',
].join('\n');

/** Lines with an atom that Obsidian's own folding may still claim. */
const ATOMS = [
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '```js',
  'const a = 1;',
  '```',
  '',
  '> [!note] A callout',
  '> body',
  '',
  '> a quote',
  '',
  '<div>',
  '  <p>html</p>',
  '</div>',
  '',
  '---',
  '',
  '- a real parent',
  '  - its child',
  '',
].join('\n');

describe('fold service', () => {
  // Per test, not once: folding leaves Obsidian's own indicators re-rendered
  // only on the lines it redrew, so a chevron census after another test's fold
  // reports fewer than the document has. A fresh note is the honest fixture.
  beforeEach(async () => {
    await h.createNote(NOTE, DOC);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.clearFolds();
    await h.setCursor(0, 0);
  });

  it('reports our range on every kind that can hold children', async () => {
    const foldable = await h.foldableLines();
    // A paragraph with attached children is the case Obsidian cannot fold on
    // its own, and the ordered and task items are the list notations whose
    // marks differ. The nested leaves report nothing: the provider answers for
    // a line's OWN node, never its ancestor's.
    expect(foldable).toEqual([
      { line: 0, from: 0, to: 14 }, // # Top → "Tail para."
      { line: 2, from: 2, to: 10 }, // paragraph → the task child
      { line: 4, from: 4, to: 6 }, // - one → nested b
      { line: 7, from: 7, to: 8 }, // 1. ordered parent → its child
      { line: 9, from: 9, to: 10 }, // - [ ] task parent → its child
      { line: 12, from: 12, to: 14 }, // ## Second → "Tail para."
    ]);
  });

  it('folds a paragraph through Obsidian’s own fold operation', async () => {
    // `Editor.exec('toggleFold')`, not the `editor:toggle-fold` command: both
    // reach the same fold, but the COMMAND declines when the editor has no
    // focus, and under WebDriver the OS window never does (see
    // `runEditorExec`). What this asserts either way is the thing that matters
    // — Obsidian's own fold operation now folds a paragraph, which it cannot do
    // without our provider.
    await h.setCursorSettled(2, 3);
    await h.runEditorExec('toggleFold');
    expect(await h.foldedLineRanges()).toEqual([{ from: 2, to: 10 }]);
    // The list block is gone from the DOM entirely, rather than hidden in
    // place, which is the point of folding through Obsidian's mechanism rather
    // than beside it.
    //
    // The tail of the head line reads oddly here because `textContent` reports
    // hidden nodes too: `7` is our own control, and `…` is Obsidian's
    // placeholder, still in the DOM and hidden by CSS wherever ours is drawn
    // (93 asserts that only one of the two is SHOWN, which textContent cannot
    // answer).
    expect(await h.renderedLineTexts()).toEqual([
      'Top',
      '',
      'Paragraph with children:7…',
      '',
      'Second',
      '',
      'Tail para.',
      '',
    ]);
    await h.runEditorExec('toggleFold');
    expect(await h.foldedLineRanges()).toEqual([]);
  });

  it('moves the caret out of a native fold that closes over it, rather than reopening', async () => {
    // Obsidian's own chevron dispatches the fold and nothing else, so folding a
    // parent from above a caret that sits deeper hides that caret. The reveal
    // rule exists for a caret that MOVES into hidden text; applied here it
    // undid every such fold the instant it landed — and the deeper the caret,
    // the more ancestors could not be folded at all. The caret gives way
    // instead, to the fold's own head line.
    await h.setCursorSettled(5, 4); // "- nested a", inside "- one" inside the paragraph
    await h.runEditorExec('foldAll');
    await browser.pause(150);
    const folded = await h.foldedLineRanges();
    expect(folded.map((r) => r.from)).toContain(0); // # Top, the outermost, still folded
    expect(folded.map((r) => r.from)).toContain(2); // the paragraph too
    // On a visible line: the outermost fold's own head.
    expect((await h.getCursor()).line).toBe(0);
  });

  it('gives every kind we fold a native chevron — including the paragraph', async () => {
    // Obsidian's indicator DOES follow `foldable()`, which the first pass at
    // this change had recorded the other way round: an earlier probe registered
    // a provider into a live editor and saw no new chevron, because the
    // decoration for a line is not rebuilt by a reconfigure alone. Registered
    // at load, as the plugin does, the chevron appears on every line our
    // provider claims — so in the default configuration nothing of ours needs
    // to be drawn.
    expect(await h.nativeChevronLines()).toEqual(await h.foldChromeLines());
  });

  it('leaves an atom’s own native fold alone, and draws nothing for it', async () => {
    const note = 'Scratch/fold-atoms.md';
    await h.createNote(note, ATOMS);
    await h.openNote(note);
    await h.setOutlineMode(true);
    await h.setCursor(0, 0);

    // What WE claim: only the list parent. Declining for an atom is not a veto,
    // so the editor may still consider one foldable — measured, a raw HTML
    // block is one — and that fold stays Obsidian's business.
    expect(await h.foldableLines({ oursOnly: true })).toEqual([{ line: 19, from: 19, to: 20 }]);

    const ours = await h.foldChromeLines();
    expect(ours).toEqual([19]);
    // The HTML block is foldable to the editor and carries no chrome of ours.
    const editorFoldable = (await h.foldableLines()).map((f) => f.line);
    expect(editorFoldable).toContain(19);
    for (const line of editorFoldable) {
      if (line !== 19) expect(ours).not.toContain(line);
    }
  });
});
