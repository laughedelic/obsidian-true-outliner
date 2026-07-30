/**
 * progressive-select-all e2e (openspec/changes/progressive-select-all):
 * repeated Mod-A climbing the node-aware selection ladder — content ->
 * subtree -> ancestor subtrees -> whole outline body -> native Select All
 * — driven through real keyboard input, matching this project's practice
 * of exercising keymap-adjacent behavior end-to-end rather than only via
 * the pure `select-all-ladder.ts` unit/property tests.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Scratch/progressive-select-all.md';
const SELECTED_CLASS = 'to-decor-node-selected';

/** classList of whatever element renders logical (0-based) line
 * `lineNumber` — same technique 63-selection-visual-treatment.e2e.ts uses. */
async function classListAtLine(lineNumber: number): Promise<string[]> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineNumber) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(lineNumber + 1).from;
      const { node } = cm.domAtPos(pos);
      const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const el = start?.closest('.cm-line, .cm-embed-block');
      return el ? Array.from(el.classList) : [];
    },
    lineNumber,
  );
}

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

describe('progressive-select-all', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('climbs content -> subtree (+gap) -> siblings run -> ancestor subtree across repeated presses', async function () {
    const md = '# Head\n\nBody one.\n\nBody two.\n';
    await outlineNote(md);
    await h.setCursor(2, 3); // inside "Body one."

    await h.pressSelectAll();
    let sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 2, ch: 0 });
    expect(sel.head).toEqual({ line: 2, ch: 'Body one.'.length }); // own content only

    await h.pressSelectAll();
    sel = await h.getSelection();
    // Own subtree: content plus its own blank-line gap (line 3) —
    // gap-inclusive cover (escalate-include-owned-gap, merged from main)
    // makes this a distinct rung from plain content even for a leaf
    // paragraph with no marker/children of its own.
    expect(sel.anchor).toEqual({ line: 2, ch: 0 });
    expect(sel.head).toEqual({ line: 3, ch: 0 });

    await h.pressSelectAll();
    sel = await h.getSelection();
    // Siblings run: Body one + Body two together (through Body two's own
    // gap too), Head's own line NOT included yet.
    expect(sel.anchor).toEqual({ line: 2, ch: 0 });
    expect(sel.head).toEqual({ line: 5, ch: 0 });

    await h.pressSelectAll();
    sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 5, ch: 0 }); // Head's whole subtree
  });

  it('a repeated press eventually falls through to native Select All (byte-identical to stock)', async function () {
    const md = '# Head\n\nBody one.\n\nBody two.\n';
    const offNote = 'Scratch/progressive-select-all-off.md';
    await h.createNote(offNote, md);
    await h.setCursor(2, 0);
    await h.pressSelectAll();
    const offSel = await h.getSelection();

    await outlineNote(md);
    await h.setCursor(2, 0);
    const sel = await h.selectAllToStock();
    expect(sel).toEqual(offSel);
  });

  it('is stateless: an interruption between presses restarts the ladder from own content', async function () {
    const md = 'First.\n\nSecond.\n';
    await outlineNote(md);
    await h.setCursor(0, 2);
    await h.pressSelectAll();
    let sel = await h.getSelection();
    expect(sel.head).toEqual({ line: 0, ch: 'First.'.length }); // own content, not further

    // Interruption: move the cursor elsewhere (simulates a click away),
    // then come back to the same node.
    await h.setCursor(0, 4);
    await h.pressSelectAll();
    sel = await h.getSelection();
    // Restarted from "own content" again, not advanced to the next rung —
    // no press-count state survived the interruption.
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 0, ch: 'First.'.length });
  });

  it('a list item\'s first press selects its content only, excluding the marker', async function () {
    await outlineNote('- alpha\n- beta\n');
    await h.setCursor(0, 4); // inside "alpha"
    await h.pressSelectAll();
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: '- '.length });
    expect(sel.head).toEqual({ line: 0, ch: '- alpha'.length });
  });

  it('each range in a multi-range selection climbs its own ladder independently', async function () {
    const md = '# Head\n\nBody one.\n\nBody two.\n';
    await outlineNote(md);
    // dispatchSelectOnlyRanges deliberately doesn't touch DOM focus (other
    // callers rely on that no-side-effect behavior), so establish real
    // editor focus first — a keyboard shortcut needs it, and unlike
    // desktop (where opening a note happens to leave the editor focused),
    // mobile Obsidian does not auto-focus a freshly opened note (avoids
    // popping the virtual keyboard unprompted).
    await h.setCursor(2, 2);
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 2, ch: 2 }, head: { line: 2, ch: 2 } }, // cursor in Body one
      { anchor: { line: 4, ch: 2 }, head: { line: 4, ch: 2 } }, // cursor in Body two
    ]);
    await h.pressSelectAll();

    const ranges = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const doc = cm.state.doc;
      const toPos = (offset: number) => {
        const line = doc.lineAt(offset);
        return { line: line.number - 1, ch: offset - line.from };
      };
      return cm.state.selection.ranges.map((r: { anchor: number; head: number }) => ({
        anchor: toPos(r.anchor),
        head: toPos(r.head),
      }));
    });

    expect(ranges.length).toBe(2);
    const first = ranges.find((r: any) => r.anchor.line === 2);
    const second = ranges.find((r: any) => r.anchor.line === 4);
    expect(first.head).toEqual({ line: 2, ch: 'Body one.'.length });
    expect(second.head).toEqual({ line: 4, ch: 'Body two.'.length });
  });

  it('own-content rung gets no block-cover chrome; the subtree rung above it does', async function () {
    // A list item WITH a child: rung 1 (content, marker excluded) is a
    // partial line — not an exact subtree cover, so escalated-selection-
    // decoration (coveredSubtreeRoots) must not render chrome for it. Rung
    // 2 already spans the whole subtree (item + child), an exact cover, so
    // it must.
    await outlineNote('- item\n  - child\n');
    await h.setCursor(0, 4); // inside "item"

    await h.pressSelectAll();
    let classes = await classListAtLine(0);
    expect(classes).not.toContain(SELECTED_CLASS);

    await h.pressSelectAll();
    classes = await classListAtLine(0);
    expect(classes).toContain(SELECTED_CLASS);
    classes = await classListAtLine(1);
    expect(classes).toContain(SELECTED_CLASS);
  });

  it('a plain paragraph (no list marker, no children) also gets content-first, chrome-second — the original inconsistency, now fixed by gap-inclusion', async function () {
    await outlineNote('Alpha.\n\nBeta.\n');
    await h.setCursor(0, 2); // inside "Alpha."

    await h.pressSelectAll();
    let sel = await h.getSelection();
    expect(sel.head).toEqual({ line: 0, ch: 'Alpha.'.length });
    let classes = await classListAtLine(0);
    expect(classes).not.toContain(SELECTED_CLASS);

    await h.pressSelectAll();
    sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 1, ch: 0 }); // content's own blank-line gap now included
    classes = await classListAtLine(0);
    expect(classes).toContain(SELECTED_CLASS);
  });

  it('inside a nested table-cell editor, Mod-A is untouched native behavior (the ladder must not treat the cell as an outline)', async function () {
    // Same shared gate the structural keys use (`outlinePathOf` in keymap.ts).
    // `editorInfoField` resolves to the outline-mode HOST note inside a cell,
    // so without the DOM-ancestry check this handler ran the ladder over the
    // cell's own tiny document. Measured before the fix: a cell reading
    // `- word` selected only `word` — the ladder's "content" rung, treating
    // the user's literal text as a list marker — where stock Mod-A selects the
    // whole `- word`.
    //
    // The cell text must parse as a LIST ITEM for this to discriminate at all:
    // for a plain `word` the first rung and native select-all are identical,
    // and the test could not fail. Asserted through the DOM selection, since
    // `h.getSelection()` reads the outer editor, not the focused cell.
    await outlineNote('# S\n\n| a | b |\n| --- | --- |\n| word | 2 |\n');
    await h.clickTableCell();
    await h.keys.home();
    await h.keys.type('- ');
    await browser.pause(200);

    await h.pressSelectAll();
    await browser.pause(200);

    const cell = await browser.execute(() => {
      const embed = document.activeElement?.closest('.cm-embed-block');
      return {
        nested: embed !== null,
        text: embed?.querySelector('.cm-content')?.textContent ?? null,
        selected: window.getSelection()?.toString() ?? null,
      };
    });
    expect(cell.nested).toBe(true);
    expect(cell.text).toBe('- word'); // the discriminating fixture actually took
    expect(cell.selected).toBe('- word'); // stock: the marker is the user's text here
  });

  it('outside outline mode, Mod-A is untouched native behavior', async function () {
    const md = '# Head\n\nBody.\n';
    await h.createNote(NOTE, md);
    expect(await h.isOutlineMode(NOTE)).toBe(false);
    await h.setCursor(2, 0);
    await h.pressSelectAll();
    const sel = await h.getSelection();
    // Stock Select All jumps straight to the whole document in one press —
    // no ladder climbing off-mode. The head lands on the document's final
    // (phantom, trailing-newline) empty line, same as the on-mode top rung.
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 3, ch: 0 });
  });
});
