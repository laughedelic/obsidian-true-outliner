/**
 * Phase C evidence suite (openspec/changes/outline-edit-enforcement,
 * node-edit-enforcement spec): real Backspace/Delete/paste/type-over driven
 * through the verdict layer at node boundaries — deletion (subtree cover +
 * gaps), boundary merges, structural paste, the undo/byte-fidelity
 * contract, and performance on the enforced path (its first real samples,
 * per Phase A's finding that this class was previously counted but never
 * exercised).
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as h from '../helpers.js';
import { REJECTION_MESSAGES } from '../../src/plugin/messages';

const NOTE = 'Scratch/enforcement.md';
const PRIMARY_MOD = process.platform === 'darwin' ? Key.Command : Key.Ctrl;

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
  await h.resetStats();
}

describe('node-edit-enforcement: Phase C evidence', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  // ---- 4.1 Deletion scenarios --------------------------------------------

  it('escalated-selection Backspace removes subtrees + their trailing gaps', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: see IS_MOBILE_RUN
    await outlineNote('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n');
    // Drag crossing the boundary escalates (Phase B) to both whole subtrees.
    // More steps than the default (3) — this specific drag flaked
    // occasionally (~1/3 runs) with the default, a known category of
    // real-pointer-drag timing flakiness in this harness (see
    // 61-selection-enforcement's own "live drag stability" test, which uses
    // the same higher step count for the same reason).
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 2, ch: 6 }, 6);
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 }); // drag actually escalated
    expect(sel.head).toEqual({ line: 2, ch: 'Second paragraph.'.length });
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('Third paragraph.\n');
    const snap = await h.getStats();
    expect(snap.verdictCounts.rewrite).toBeGreaterThan(0);
  });

  it('a stale (never-escalated) mid-node selection Delete rewrites to the same subtree cover', async function () {
    await outlineNote('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n');
    // Editor.setSelection carries no userEvent — never escalated by Phase B
    // — yet the deletion still resolves to the full subtree cover (D3: one
    // rule for both the escalated and the stale path).
    await h.setSelection({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    await browser.keys(Key.Delete);
    expect(await h.getBuffer()).toBe('Third paragraph.\n');
  });

  it('type-over inserts the typed text as new content at the deletion site', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: see IS_MOBILE_RUN
    await outlineNote('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n');
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    await h.keys.type('R');
    expect(await h.getBuffer()).toBe('R\n\nThird paragraph.\n');
    // Cursor lands after "R" — a follow-up keystroke appends, not prepends.
    await h.keys.type('X');
    expect(await h.getBuffer()).toBe('RX\n\nThird paragraph.\n');
  });

  it('deleting ONE selected subtree with children works (regression: heading+subtree Backspace was a no-op veto)', async function () {
    // Manual-pass bug (2026-07-21): a selection covering a single node AND
    // its own descendants hit the ancestor-descendant gap in the cover
    // math — empty cover, "Nothing to act on" veto. Sibling multi-subtree
    // selections worked, masking it.
    // Editor.setSelection (stale, never escalated) still resolves to the
    // right cover — the verdict layer escalates internally regardless of
    // whether Phase B already did (D3's "one rule for both paths"), and
    // this stays reliable across desktop/mobile-emulation unlike a direct
    // CM6 dispatch immediately followed by a keypress.
    await outlineNote('# H\n\nBody.\n\n# Two\n\nAfter.\n');
    await h.setSelection({ line: 0, ch: 0 }, { line: 2, ch: 3 });
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('# Two\n\nAfter.\n');
  });

  it('deleting every node leaves a valid, functional empty note', async function () {
    await outlineNote('Alpha.\n\nBeta.\n');
    await h.setCursor(0, 0);
    await browser.keys([PRIMARY_MOD, 'a']); // Select All (escalates to the whole doc)
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('');
    // The editor still accepts input afterward.
    await h.keys.type('New content.');
    expect(await h.getBuffer()).toBe('New content.');
  });

  // ---- 4.2 Merge scenarios ------------------------------------------------

  it('adjacent bullet list items merge on Backspace-at-start as one undo step; cursor lands at the JOIN point', async function () {
    await outlineNote('- alpha\n- beta\n');
    await h.setCursor(1, 0); // start of "- beta"
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('- alphabeta\n');
    // Regression: cursor used to jump to the merged node's START ({0,0}),
    // not the join point between "alpha" and "beta".
    expect(await h.getCursor()).toEqual({ line: 0, ch: '- alpha'.length });
    await h.keys.undo();
    expect(await h.getBuffer()).toBe('- alpha\n- beta\n');
  });

  it('Delete at a list item\'s end mirrors Backspace-at-start behavior; cursor also at the join point', async function () {
    await outlineNote('- alpha\n- beta\n');
    await h.setCursor(0, '- alpha'.length); // end of "- alpha"
    await browser.keys(Key.Delete);
    expect(await h.getBuffer()).toBe('- alphabeta\n');
    expect(await h.getCursor()).toEqual({ line: 0, ch: '- alpha'.length });
  });

  it('a structure-corrupting merge (absorbing a heading) vetoes with the rejection cue; buffer stays byte-identical', async function () {
    const md = 'Intro.\n## Section\n\nChild body.\n';
    await outlineNote(md);
    await h.setCursor(1, 0); // start of "## Section"
    await browser.keys(Key.Backspace);
    await h.waitForNotice(REJECTION_MESSAGES['merge-not-expressible']);
    expect(await h.getBuffer()).toBe(md);
    const snap = await h.getStats();
    expect(snap.verdictCounts.veto).toBeGreaterThan(0);
  });

  it('chrome-transparency (amendment 2026-07-21): Backspace merges two paragraphs ACROSS a real blank-line gap in ONE keystroke', async function () {
    // Supersedes the earlier "two-Backspace native join" finding: the merge
    // is now recognized from the pre-edit cursor regardless of gap width,
    // so paragraph←paragraph is a genuine, organically-reachable rewrite.
    await outlineNote('First.\n\nSecond.\n');
    await h.setCursor(2, 0); // start of "Second."
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('First.Second.\n');
    const snap = await h.getStats();
    expect(snap.verdictCounts.rewrite).toBeGreaterThan(0);
    await h.keys.undo();
    expect(await h.getBuffer()).toBe('First.\n\nSecond.\n');
  });

  it('Delete at content end merges through the node\'s own trailing gap too', async function () {
    await outlineNote('First.\n\nSecond.\n');
    await h.setCursor(0, 'First.'.length); // end of "First."
    await browser.keys(Key.Delete);
    expect(await h.getBuffer()).toBe('First.Second.\n');
  });

  it('the same Backspace with the cursor left ON the gap line stays native (deliberate whitespace editing)', async function () {
    await outlineNote('First.\n\n\nSecond.\n'); // two blank lines
    await h.setCursor(2, 0); // on the SECOND blank line, not "Second."'s start
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('First.\n\nSecond.\n'); // one blank line consumed, stock
    const snap = await h.getStats();
    expect(snap.verdictCounts.rewrite).toBe(0);
  });

  it('marker-space Backspace at a list item\'s content start merges into the previous item (not marker corruption)', async function () {
    await outlineNote('- alpha\n- beta\n');
    await h.setCursor(1, 2); // content start of "- beta" (after "- ")
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('- alphabeta\n');
    const snap = await h.getStats();
    expect(snap.verdictCounts.rewrite).toBeGreaterThan(0);
  });

  it('marker-space Backspace merges a first list item into its parent paragraph (cross-kind join)', async function () {
    await outlineNote('Para.\n- item\n');
    await h.setCursor(1, 2); // content start of "- item"
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('Para.item\n');
  });

  it('a heading absorbs a following single-line paragraph on Backspace', async function () {
    await outlineNote('# Title\n\nBody.\n');
    await h.setCursor(2, 0); // start of "Body."
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('# TitleBody.\n');
  });

  // ---- 4.7 Marker-transparent cursor placement (D13) ----------------------

  it('Left arrow from a list item\'s content start jumps into the marker prefix, redirected to content start', async function () {
    await outlineNote('- alpha\n- beta\n');
    await h.setCursor(1, 2); // content start of "- beta"
    await browser.keys(Key.ArrowLeft);
    expect(await h.getCursor()).toEqual({ line: 1, ch: 2 }); // NOT {1, 1} or {1, 0}
  });

  it('Home on a list item lands at content start, not column 0', async function () {
    await outlineNote('- alpha beta\n');
    await h.setCursor(0, 6); // mid "alpha"
    await browser.keys(Key.Home);
    expect(await h.getCursor()).toEqual({ line: 0, ch: 2 });
  });

  it('a real mouse click inside the marker\'s rendered whitespace redirects to content start', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-pointer test: see IS_MOBILE_RUN
    // A real click carries `select.pointer` (selection-only), unlike
    // Editor.setSelection (programmatic, exempt by design — same as range
    // escalation) — this is what actually exercises the clamp.
    await outlineNote('- alpha\n');
    const coords = await h.posToCoords(0, 1);
    await browser
      .action('pointer', { parameters: { pointerType: 'mouse' } })
      .move({ x: Math.round(coords.left), y: Math.round((coords.top + coords.bottom) / 2), origin: 'viewport' })
      .down({ button: 0 })
      .up({ button: 0 })
      .perform();
    expect(await h.getCursor()).toEqual({ line: 0, ch: 2 });
  });

  it('vertical motion onto a shorter marker line still lands on content, not the marker', async function () {
    await outlineNote('- a\n- alpha beta\n');
    await h.setCursor(1, 8); // mid "alpha" on the longer line
    await browser.keys(Key.ArrowUp); // native goal-column would land at ch 8 on "- a" (clamped to line length by CM6 itself, then re-clamped by us if inside the marker)
    const cursor = await h.getCursor();
    expect(cursor.line).toBe(0);
    expect(cursor.ch).toBeGreaterThanOrEqual(2); // never inside "- "
  });

  it('headings keep their own marker directly editable (not clamped)', async function () {
    await outlineNote('# Heading\n');
    await h.setCursor(0, 3); // mid "Head"... actually mid the marker+space region
    await browser.keys(Key.Home);
    expect(await h.getCursor()).toEqual({ line: 0, ch: 0 }); // stock: Home goes to column 0
  });

  it('cursor placement on a gap line is unaffected (deliberately deferred)', async function () {
    await outlineNote('First.\n\nSecond.\n');
    await h.setSelection({ line: 1, ch: 0 }, { line: 1, ch: 0 });
    expect(await h.getCursor()).toEqual({ line: 1, ch: 0 });
  });

  // ---- 4.3 Paste/drop scenarios -------------------------------------------

  it('a block-level copy pasted mid-paragraph splices after that paragraph, re-indented', async function () {
    await outlineNote('First paragraph text.\n\nSecond paragraph text.\n');
    await h.setCursor(0, 5); // mid "First"
    await h.pasteText('New block one.\n\nNew block two.');
    const buf = await h.getBuffer();
    expect(buf).toContain('First paragraph text.');
    expect(buf).not.toContain('First New block');
    expect(buf).toContain('New block one.');
    expect(buf).toContain('New block two.');
    const snap = await h.getStats();
    expect(snap.verdictCounts.rewrite).toBeGreaterThan(0);
  });

  it('pasting a block sequence onto a freshly-created empty list item REPLACES it (D14)', async function () {
    await outlineNote('- alpha\n- beta\n');
    await h.setCursor(0, '- alpha'.length); // end of "- alpha"
    await h.keys.enter(); // creates a new EMPTY list item between alpha and beta
    expect(await h.getBuffer()).toBe('- alpha\n- \n- beta\n');
    await h.pasteText('one\n\ntwo');
    const buf = await h.getBuffer();
    const nonBlankLines = buf.split('\n').filter((l) => l.trim() !== '');
    expect(nonBlankLines).toEqual(['- alpha', '- one', '- two', '- beta']);
    expect(buf).not.toMatch(/^- $/m); // the empty placeholder is gone
  });

  it('pasting a single-node subtree with nested children re-indents at the new depth, no raw tabs/mixed units (D15)', async function () {
    await outlineNote('- top\n\t- anchor\n');
    await h.setCursor(1, '\t- anchor'.length); // end of "anchor", depth 1
    await h.pasteText('- x\n\t- y\n'); // copied subtree, itself originally at depth 0/1
    const buf = await h.getBuffer();
    expect(buf).toBe('- top\n\t- anchor\n\t- x\n\t\t- y\n');
    for (const line of buf.split('\n')) {
      const ws = /^[ \t]*/.exec(line)![0];
      expect(ws.includes(' ') && ws.includes('\t')).toBe(false); // never a mixed-unit line
    }
    const snap = await h.getStats();
    expect(snap.verdictCounts.rewrite).toBeGreaterThan(0);
  });

  it('pasting into an empty item that is the SOLE child at a deep level re-indents there, not top level (D16, real-vault repro)', async function () {
    // Exact repro from the real-vault manual pass ("Paste bug repro.md"):
    // the target empty item has no siblings at all (sole child of "plus two
    // levels"), so the composeTypeOver/deleteAndSplice path has no survivor
    // to splice against and falls to insertAsOnlyChildren — which used to
    // never re-indent, popping the pasted content out to its ORIGINAL
    // (here: top-level) depth instead of the destination's.
    await outlineNote(
      '- parent1\n\t- child1\n\t- child2\n- parent2\n\t- plus one level\n\t\t- plus two levels\n\t\t\t- \n',
    );
    await h.setCursor(6, '\t\t\t- '.length); // the empty item under "plus two levels"
    await h.pasteText('- parent1\n\t- child1\n\t- child2\n');
    expect(await h.getBuffer()).toBe(
      '- parent1\n\t- child1\n\t- child2\n- parent2\n\t- plus one level\n\t\t- plus two levels\n\t\t\t- parent1\n\t\t\t\t- child1\n\t\t\t\t- child2\n',
    );
  });

  it('a plain multi-line fragment (no block structure) pastes exactly stock, mid-paragraph', async function () {
    const md = 'First paragraph text.\n\nSecond.\n';
    const onNote = 'Scratch/paste-on.md';
    const offNote = 'Scratch/paste-off.md';

    await h.createNote(onNote, md);
    if (!(await h.isOutlineMode(onNote))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await h.setCursor(0, 5);
    await h.pasteText('more\ncontinuation\nlines');
    const onResult = await h.getBuffer();

    await h.createNote(offNote, md);
    expect(await h.isOutlineMode(offNote)).toBe(false);
    await h.setCursor(0, 5);
    await h.pasteText('more\ncontinuation\nlines');
    const offResult = await h.getBuffer();

    expect(onResult).toBe(offResult);
  });

  it('a within-node single-line paste is byte-identical to stock', async function () {
    const md = 'First paragraph text.\n\nSecond.\n';
    const onNote = 'Scratch/paste-single-on.md';
    const offNote = 'Scratch/paste-single-off.md';

    await h.createNote(onNote, md);
    if (!(await h.isOutlineMode(onNote))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await h.setCursor(0, 5);
    await h.pasteText('SINGLE');
    const onResult = await h.getBuffer();

    await h.createNote(offNote, md);
    await h.setCursor(0, 5);
    await h.pasteText('SINGLE');
    const offResult = await h.getBuffer();

    expect(onResult).toBe(offResult);
    expect(onResult).toContain('FirstSINGLE paragraph text.');
  });

  // ---- 4.4 Contract scenarios ----------------------------------------------

  it('undo after a structural deletion restores the pre-edit buffer byte-identically, in one step', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: see IS_MOBILE_RUN
    const original = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n';
    await outlineNote(original);
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).not.toBe(original);
    await h.keys.undo();
    expect(await h.getBuffer()).toBe(original);
  });

  it('undo after a structural paste restores the pre-edit buffer byte-identically', async function () {
    const original = 'First paragraph text.\n\nSecond paragraph text.\n';
    await outlineNote(original);
    await h.setCursor(0, 5);
    await h.pasteText('New block one.\n\nNew block two.');
    expect(await h.getBuffer()).not.toBe(original);
    await h.keys.undo();
    expect(await h.getBuffer()).toBe(original);
  });

  it('a vetoed edit adds no history entry — undo reverts the last ACCEPTED edit', async function () {
    const md = 'Intro.\n## Section\n\nChild body.\n';
    await outlineNote(md);
    await h.setCursor(0, 6); // end of "Intro."
    await h.keys.type('!'); // one accepted, within-node edit first
    const afterType = await h.getBuffer();
    expect(afterType).toBe('Intro.!\n## Section\n\nChild body.\n');

    await h.setCursor(1, 0); // start of "## Section"
    await browser.keys(Key.Backspace); // vetoed — no history entry
    expect(await h.getBuffer()).toBe(afterType);

    await h.keys.undo();
    expect(await h.getBuffer()).toBe(md); // reverts the "!" typing, not a no-op
  });

  it('pass-through classes stay byte-identical with no verdicts recorded: sync reconciliation, grammar ops, off-mode, nested cell', async function () {
    await outlineNote('First.\n\nSecond.\n');

    // Programmatic `set` reconciliation (external Vault.process).
    await h.processFileExternally(NOTE, 'First.\n\nSecond.\n\nThird.\n');
    await browser.waitUntil(async () => (await h.getBuffer()).includes('Third.'), { timeout: 4000 });

    // Plugin-own grammar op (Tab to indent).
    await h.setCursor(4, 3); // inside "Third."
    await h.runCommand('indent-node');
    expect(await h.getBuffer()).toContain('- Third.');

    const snap = await h.getStats();
    expect(snap.verdictCounts.rewrite).toBe(0);
    expect(snap.verdictCounts.veto).toBe(0);

    // Off-mode: a boundary-crossing edit is untouched (covered structurally
    // by 60-transaction-classification's own off-vs-on comparison).
    const offNote = 'Scratch/pass-through-off.md';
    await h.createNote(offNote, 'First.\n\nSecond.\n');
    expect(await h.isOutlineMode(offNote)).toBe(false);
    await h.setSelection({ line: 0, ch: 3 }, { line: 2, ch: 3 });
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('Firond.\n'); // stock character splice
  });

  // ---- 4.5 Perf ------------------------------------------------------------

  it('performance: verdict computation stays within budget on a ~2000-line stress note', async function () {
    const lines: string[] = [];
    for (let i = 0; i < 400; i++) {
      lines.push(`## Section ${i}`, '', `Paragraph text for section ${i}, some words here.`, '');
    }
    lines.push('- alpha', '- beta', '- gamma');
    const stress = lines.join('\n') + '\n';
    await outlineNote(stress);
    await browser.pause(200); // let the initial parse/cache settle

    const lastLine = lines.length - 1; // "- gamma"
    async function driveOneRound(): Promise<void> {
      // Boundary deletions: a dispatched selection (not a real mouse drag,
      // which risks off-screen coordinates this deep into a virtualized
      // stress note) still carries a genuine `select`-family userEvent and
      // exercises the real escalation + verdict path end to end.
      for (let i = 0; i < 8; i++) {
        const line = i * 4;
        await h.dispatchSelectOnlyRanges([
          { anchor: { line, ch: 2 }, head: { line: line + 2, ch: 2 } },
        ]);
        await browser.keys(Key.Backspace);
        await h.keys.undo();
      }
      // List-item merges.
      for (let i = 0; i < 5; i++) {
        await h.setCursor(lastLine, 0);
        await browser.keys(Key.Backspace);
        await h.keys.undo();
      }
      // Structural paste.
      for (let i = 0; i < 5; i++) {
        await h.setCursor(2, 5);
        await h.pasteText('Pasted one.\n\nPasted two.');
        await h.keys.undo();
      }
    }

    await driveOneRound(); // warm-up: JIT/GC settle, not measured
    await h.resetStats();
    await driveOneRound();
    await driveOneRound(); // two more measured rounds — a stabler sample count

    // Budget is looser than classification's own (D7's ≤1ms median): the
    // verdict layer does real tree surgery (parse/encode/ops) on top of
    // classification, not just a shape check, and CI's shared runners
    // measured 1.3-2ms medians here (vs. comfortably <1ms on local dev
    // hardware) even though the classification-only path stayed under 1ms
    // in the same CI runs. ≤3ms median keeps a meaningful regression guard
    // while giving CI hardware headroom; p95 is unaffected evidence-wise and
    // stays at the shared budget.
    const snap = await h.getStats();
    const t = snap.timing['boundary-crossing-edit']!;
    if (t.count > 0) {
      expect(t.median).toBeLessThanOrEqual(3);
      expect(t.p95).toBeLessThanOrEqual(8);
    }
    for (const kind of ['pass', 'rewrite', 'veto']) {
      const vt = snap.verdictTiming[kind]!;
      if (vt.count === 0) continue;
      expect(vt.median).toBeLessThanOrEqual(3);
      expect(vt.p95).toBeLessThanOrEqual(8);
    }
  });

  // ---- 4.6 Automation-gap retry ---------------------------------------------

  it('automation-gap retry: the find-and-replace panel IS automatable (renewed attempt succeeds) — a within-node replace-all is classified and byte-correct', async function () {
    // Phase A (archived tasks.md 3.1) flagged find-and-replace as a UI-panel
    // gesture WebDriver "doesn't reliably synthesize" and left it
    // unautomated. Renewed attempt: the panel's own input fields and
    // buttons ARE plain DOM elements reachable via ordinary WebDriver
    // interaction — no special gesture needed. `editor:open-search-replace`
    // dispatches real CM6 transactions the filter observes.
    await outlineNote('First paragraph.\n\nSecond paragraph.\n');
    await browser.executeObsidianCommand('editor:open-search-replace');
    await browser.pause(200);
    await (await browser.$('.document-search-input input')).click();
    await browser.keys('paragraph');
    await (await browser.$('.document-replace-input')).click();
    await browser.keys('PARA');
    await browser.pause(100);
    await (await browser.$('[aria-label*="Replace all"]')).click();
    await browser.pause(200);

    expect(await h.getBuffer()).toBe('First PARA.\n\nSecond PARA.\n');
    const snap = await h.getStats();
    expect(snap.counts['within-node-edit']).toBeGreaterThan(0);
    expect(snap.verdictCounts.veto).toBe(0);
  });

  it('automation-gap finding: a genuine BOUNDARY-CROSSING find-replace match is inexpressible in this panel, not merely unautomatable', async function () {
    // Stronger finding than Phase A's hedge: this Obsidian version's built-in
    // document search-replace has no regex toggle and its "Find" field
    // cannot hold a literal newline (Enter submits/navigates instead) — so
    // there is no way to construct a search PATTERN spanning a node
    // boundary at all, independent of any WebDriver limitation. A
    // within-node match/replace (previous scenario) is now real automated
    // coverage; a cross-boundary one is carried as a manual-pass note
    // (task 5.2) rather than silently skipped, per the "hard-to-automate
    // paths are still verified" requirement.
    await outlineNote('First paragraph.\n\nSecond paragraph.\n');
    await browser.executeObsidianCommand('editor:open-search-replace');
    await browser.pause(200);
    const ariaLabels = await browser.execute(() =>
      Array.from(document.querySelectorAll('.document-search-container [aria-label]')).map((el) =>
        el.getAttribute('aria-label'),
      ),
    );
    expect(ariaLabels.some((l) => (l ?? '').toLowerCase().includes('regex'))).toBe(false);
  });

  it('automation-gap retry: HTML5 drag-drop into a rendered position remains infeasible in this harness (native limitation, carried as a manual scenario)', async function () {
    // Renewed attempt per node-edit-enforcement's "Enforcement is
    // observable and hard-to-automate paths are still verified"
    // requirement: still infeasible — no W3C Actions API primitive fires
    // HTML5 DragEvents, and CM6 renders drop targets only inside a live
    // contentEditable surface WebDriver cannot script drag payloads into
    // (docs/research/13's own known-limitation note). Carried as a
    // scripted manual-pass scenario (recorded in the change's verification
    // notes, task 5.2), not silently skipped.
    this.skip();
  });
});
