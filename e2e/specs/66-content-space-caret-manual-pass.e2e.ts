/**
 * content-space-caret real-vault-style manual pass (tasks.md section 6):
 * node kinds outside the primary examples.md fixtures — code fences,
 * tables, callouts, horizontal rules — plus the Escape double-press
 * oddity design.md D6 records as measured-but-not-a-blocker. Findings are
 * recorded in docs/research/04-open-questions.md; this file is the
 * repeatable regression coverage for what that pass turned up.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as h from '../helpers.js';

const NOTE = 'Scratch/content-space-caret-manual-pass.md';

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

describe('content-space-caret: real-vault-style manual pass (node kinds outside the fixtures)', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('D8: a fenced code block is ordinary content — motion moves line to line at column 0, only its trailing gap is skipped', async function () {
    await outlineNote('Before.\n\n```js\nline one\nline two\n```\n\nAfter.\n');
    // Down from "Before." lands inside the fence, not on any gap line.
    await h.setCursor(0, 3);
    await h.keys.down();
    let cursor = await h.getCursor();
    expect(cursor.line).toBe(2); // "```js" — the fence opener is itself content
    // Left at the fence's own first line's content start crosses to the
    // previous node's content end, same rule as any other node pair.
    await h.setCursor(2, 0);
    await h.keys.left();
    expect(await h.getCursor()).toEqual({ line: 0, ch: 'Before.'.length });
    // Right from the fence's last line's end crosses forward past its own
    // trailing gap to the next node, never landing on the gap.
    await h.setCursor(5, '```'.length);
    await h.keys.right();
    cursor = await h.getCursor();
    expect(cursor.line).toBe(7); // "After." — not the blank line at 6
    expect(cursor.ch).toBe(0);
  });

  it('D8: vertical motion inside a code fence moves between its own lines like any content, and a gap click before it lands on the previous node', async function () {
    await outlineNote('Before.\n\n```\nalpha\nbeta\n```\n');
    await h.setCursor(3, 2); // mid "alpha"
    await h.keys.down();
    expect(await h.getCursor()).toEqual({ line: 4, ch: 2 }); // mid "beta", same column
    // A click on the gap line between "Before." and the fence lands on
    // "Before."'s own content end (gap ownership), same as any node pair.
    await h.clickAt(1, 0);
    expect(await h.getCursor()).toEqual({ line: 0, ch: 'Before.'.length });
  });

  it('D8: a table row: Home/End match off-mode parity (Obsidian renders tables as an interactive widget, not plain text — measured: even NATIVE Home/End on a data row does not behave like a plain line)', async function () {
    // Measured: Obsidian's Live Preview renders a table as its own editable
    // widget, and `moveToLineBoundary` resolves a position inside it to the
    // WIDGET's own boundary rather than the specific raw markdown line the
    // cursor sits on — confirmed identical off-mode (100% native, no plugin
    // involvement at all), so this is a pre-existing Obsidian behavior for
    // this node kind, not something content-space-caret should (or
    // reasonably could) override. D8's "ordinary line motion" claim holds
    // in the sense that this plugin doesn't change it: on-mode parity with
    // off-mode is the correct bar here, not a hardcoded plain-text
    // assumption.
    const md = 'Before.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter.\n';

    // Capture every off-mode baseline FIRST, on its own note, before ever
    // switching the active file — re-opening a note mid-test doesn't
    // reliably hand keyboard focus back in time for the very next
    // `browser.keys()` call, which produced a spurious mismatch here
    // (test-hygiene bug, not a plugin one; confirmed by re-running each
    // side in total isolation).
    const offNote = 'Scratch/content-space-caret-table-off.md';
    await h.createNote(offNote, md);
    await h.waitForContentChildCount('.cm-embed-block.cm-table-widget', 1); // let the widget render first — see the DOWN test's own note on this race
    await h.setCursor(4, 2);
    await h.keys.home();
    const offHome = await h.getCursor();
    await h.setCursor(4, 2);
    await h.keys.end();
    const offEnd = await h.getCursor();
    await h.setCursor(2, 0);
    await h.keys.left();
    const offLeft = await h.getCursor();

    await outlineNote(md);
    await h.waitForContentChildCount('.cm-embed-block.cm-table-widget', 1);
    await h.setCursor(4, 2);
    await h.keys.home();
    expect(await h.getCursor()).toEqual(offHome);
    await h.setCursor(4, 2);
    await h.keys.end();
    expect(await h.getCursor()).toEqual(offEnd);
    // ArrowLeft at the table's own first row's start: parity with off-mode
    // is the bar here too — a table's rows are each their own nested CM6
    // editor in Live Preview (60-transaction-classification.e2e.ts's
    // "nested per-cell table editor" coverage; design.md's own risk note,
    // "Motion commands must not fire in nested editors").
    await h.setCursor(2, 0);
    await h.keys.left();
    expect(await h.getCursor()).toEqual(offLeft);
  });

  it("D8: a real click on the gap directly above/below a table redirects correctly (gap ownership doesn't care that the neighbor is a nested editor)", async function () {
    // Measured: clicking the gap directly BELOW a table resolves to
    // unreliable coordinates under mobile emulation's narrow viewport
    // specifically (the click lands inside the table's own first row
    // instead) — clicking a gap NOT adjacent to a widget works fine there
    // (see the code-fence gap-click test above), so this is a coordinate
    // quirk of `posToCoords`-adjacent-to-a-widget under mobile emulation,
    // matching this project's existing real-pointer-under-mobile caveats.
    if (h.IS_MOBILE_RUN) this.skip();
    await outlineNote('Before.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter.\n');
    await h.waitForContentChildCount('.cm-embed-block.cm-table-widget', 1);
    await h.clickAt(1, 0); // gap above the table
    expect(await h.getCursor()).toEqual({ line: 0, ch: 'Before.'.length });
    await h.clickAt(5, 0); // gap below the table
    expect(await h.getCursor()).toEqual({ line: 4, ch: '| 1 | 2 |'.length });
  });

  it('D8: vertical motion crossing DOWN into a table lands within it, never on the gap above', async function () {
    // Own note, not reused across assertions: once a previous interaction
    // lands DOM focus inside a table's own nested editor, re-`setCursor`ing
    // within the SAME note doesn't reliably hand focus back to the outer
    // editor before the very next `browser.keys()` call (the same
    // test-hygiene lesson the table Home/End test above already recorded).
    await h.createNote('Scratch/content-space-caret-table-down.md', 'Before.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter.\n');
    if (!(await h.isOutlineMode('Scratch/content-space-caret-table-down.md'))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    // Measured: this plugin computes and dispatches the table's own FIRST
    // row (line 2) as the crossing target, but Obsidian's table widget then
    // claims the position through its own nested-editor hand-off and can
    // re-map it to a DIFFERENT row of the SAME table (observed: the data
    // row, line 4) — reproducible, not timing-flaky, and outside this
    // plugin's jurisdiction (design.md: "Motion commands must not fire in
    // nested editors"; entering one is this same boundary from the other
    // side). The guarantee this feature actually owns — never landing on
    // the surrounding GAP — still holds; which row of the table's own
    // nested editor Obsidian chooses to focus does not.
    await h.waitForContentChildCount('.cm-embed-block.cm-table-widget', 1);
    await h.setCursor(0, 3);
    await h.keys.down();
    await browser.pause(150);
    const cursor = await h.getCursor();
    expect(cursor.line).toBeGreaterThanOrEqual(2);
    expect(cursor.line).toBeLessThanOrEqual(4); // somewhere within the table's own 3 lines, never line 1 (the gap)
  });

  it('D8: vertical motion crossing UP into a table lands within it, never on the gap below', async function () {
    await h.createNote('Scratch/content-space-caret-table-up.md', 'Before.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter.\n');
    if (!(await h.isOutlineMode('Scratch/content-space-caret-table-up.md'))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await h.waitForContentChildCount('.cm-embed-block.cm-table-widget', 1);
    await h.setCursor(6, 3);
    await h.keys.up();
    await browser.pause(150);
    const cursor = await h.getCursor();
    expect(cursor.line).toBeGreaterThanOrEqual(2);
    expect(cursor.line).toBeLessThanOrEqual(4); // somewhere within the table's own 3 lines, never line 5 (the gap)
  });

  it("D8: exiting a table's own nested editor via repeated vertical presses can transiently land on the surrounding gap, but the very next motion normalizes it (measured: this is the SAME accepted `programmatic`-jurisdiction case node-selection-enforcement's own scenario names for a workspace restore — table cells run their own nested CM6 editor, and Obsidian's own focus-handoff back to the outer editor dispatches with no userEvent)", async function () {
    await h.createNote('Scratch/content-space-caret-table-exit.md', 'Before.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter.\n');
    if (!(await h.isOutlineMode('Scratch/content-space-caret-table-exit.md'))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await h.waitForContentChildCount('.cm-embed-block.cm-table-widget', 1);
    await h.setCursor(6, 3); // "After."
    await h.keys.up(); // into the table (own nested editor from here on — which row is Obsidian's own call, see the crossing tests above)
    await browser.pause(150);
    expect((await h.getCursor()).line).toBeGreaterThanOrEqual(2);
    // A few more presses are enough to walk out through the nested editor's
    // own internal navigation (whatever shape that takes) and reach the
    // gap above the table.
    for (let i = 0; i < 4; i++) {
      await h.keys.up();
      await browser.pause(80);
      if ((await h.getCursor()).line <= 1) break;
    }
    expect(await h.getCursor()).toEqual({ line: 1, ch: 0 });
    await h.keys.up(); // the next user motion normalizes it, same as any other programmatic placement
    expect(await h.getCursor()).toEqual({ line: 0, ch: 0 });
  });

  it('D8: a callout (blockquote) is ordinary content — its ">" prefix is content, not chrome', async function () {
    await outlineNote('Before.\n\n> [!note] Title\n> Body line.\n\nAfter.\n');
    await h.setCursor(3, 5); // mid "> Body line."
    await h.keys.home();
    // OUR Home runs here — it is bound and consumed in outline mode — and lands
    // at this raw line's own content start. That is column 0 because a callout
    // carries no marker prefix to skip: its leading "> " is content (D8, atoms
    // have no marker-prefix rule), so the boundary is 0 and nothing is clamped.
    // The result coincides with what stock Home would do on this line, which is
    // the point of the assertion — but it is not stock behavior producing it.
    expect(await h.getCursor()).toEqual({ line: 3, ch: 0 });
    await h.keys.up();
    let cursor = await h.getCursor();
    expect(cursor.line).toBe(2); // "> [!note] Title" — never the gap above it
  });

  it("D8: a horizontal rule's own line is addressable content, no marker to skip", async function () {
    // Asserts the LINE, not the column, for the same reason as F2 in
    // 65-content-space-caret: a horizontal rule renders as a widget rather than
    // as text, so where the caret's preserved pixel-x resolves within its raw
    // `---` is a rendering detail — measured as ch 0 on 1.12.7 and ch 3 on
    // 1.13.3, both valid positions on a three-character line, from the same
    // code. What this scenario is about is that the HR's own line is reachable
    // at all, rather than being skipped like the gaps around it.
    await outlineNote('Before.\n\n---\n\nAfter.\n');
    await h.setCursor(0, 3);
    await h.keys.down();
    const cursor = await h.getCursor();
    expect(cursor.line).toBe(2); // the "---" line itself, not the gap above or below it
    expect(cursor.ch).toBeGreaterThanOrEqual(0);
    expect(cursor.ch).toBeLessThanOrEqual('---'.length);
  });

  it('6.4: Escape on a covering selection lands the caret on content either way (measured: two-press oddity, not a blocker — D6)', async function () {
    // Measured (design.md D6): on a forward cover the FIRST Escape changes
    // nothing and the SECOND collapses to the head edge, which — post
    // content-space-caret — is a gap-line position the placement resolver
    // now catches. This isn't a new behavior to bind; D2's resolver already
    // has to handle whatever Escape natively produces, since Escape is
    // deliberately left unbound (D6) for the filed modal-selection work.
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setSelection({ line: 0, ch: 0 }, { line: 2, ch: 0 }); // a stale escalated-shaped cover
    await browser.keys(Key.Escape);
    await browser.keys(Key.Escape);
    const cursor = await h.getCursor();
    // Whatever line Escape's native collapse lands on, the resolver must
    // never leave the caret on a blank gap line.
    const md = 'Alpha one.\n\nBravo two.\n';
    const lines = md.split('\n');
    expect(lines[cursor.line]?.trim()).not.toBe('');
  });
});
