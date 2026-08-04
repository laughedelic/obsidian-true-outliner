/**
 * node-selection-extension e2e (openspec/changes/node-selection-extension):
 * Shift+Arrow stepping one node per press along the cover sequence, driven
 * through real keyboard input rather than only through `select-extend.ts`'s
 * unit and property tests — the same practice
 * `64-progressive-select-all.e2e.ts` follows for the Mod-A ladder.
 *
 * This file also owns the keyboard-crossing coverage that used to live in
 * `61-selection-enforcement.e2e.ts`. After this change Shift+Arrow is a bound
 * command that dispatches exact covers, so it never reaches escalation at all;
 * an assertion left in that file would document a mechanism that no longer
 * runs. `selection-as-subtree-set`'s task 6.1 left it there deliberately for
 * this change to take.
 */

import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import * as h from '../helpers.js';

const NOTE = 'Scratch/node-selection-extension.md';
const SELECTED_CLASS = 'to-decor-node-selected';

/** classList of whatever element renders logical (0-based) line `lineNumber`
 * — the same technique `63-selection-visual-treatment.e2e.ts` uses. */
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
  await h.setBuffer(content);
}

const down = (): Promise<void> => browser.keys([Key.Shift, Key.ArrowDown]);
const up = (): Promise<void> => browser.keys([Key.Shift, Key.ArrowUp]);

/** The selection as an inclusive line span plus orientation — the same
 * observable form the unit tests assert in, so a failure here and a failure
 * there read the same way. */
async function span(): Promise<string> {
  const sel = await h.getSelection();
  const backward =
    sel.head.line < sel.anchor.line ||
    (sel.head.line === sel.anchor.line && sel.head.ch < sel.anchor.ch);
  const lo = backward ? sel.head : sel.anchor;
  const hi = backward ? sel.anchor : sel.head;
  return `${lo.line}..${hi.line} ${backward ? 'back' : 'fwd'}`;
}

describe('node-selection-extension: one node per press', () => {
  it('E2 — a tight list item takes ONE node, not two', async () => {
    // The headline regression: today's behavior grabs two items here purely
    // because no blank line separates them.
    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(0, 3);
    await down();
    expect(await span()).toBe('0..0 fwd');
  });

  it('E1 — a loose paragraph takes its node and its owned gap', async () => {
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 6);
    await down();
    expect(await span()).toBe('0..1 fwd');
  });

  it('E3 — a parent takes its whole subtree in one press', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(0, 4);
    await down();
    expect(await span()).toBe('0..2 fwd');
  });

  it('a heading extends by its whole section', async () => {
    await outlineNote('# Head\n\nBody one.\n\n# Next\n');
    await h.setCursor(0, 3);
    await down();
    expect(await span()).toBe('0..3 fwd');
  });

  it('a press that would not change the cover is skipped, not spent', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(0, 4);
    await down();
    await down();
    // Reaches `- next` rather than spending two presses on covered children.
    // 0..4, not 0..3: the buffer's trailing newline is `- next`'s own gap
    // line, and a subtree cover always takes its owned gap in full.
    expect(await span()).toBe('0..4 fwd');
  });
});

describe('node-selection-extension: crossing a boundary (moved from 61)', () => {
  it('two presses cover both nodes in full, including the owned gap', async () => {
    // The scenario `61-selection-enforcement.e2e.ts` used to assert through
    // escalation. Same observable outcome, different mechanism: extension now
    // dispatches the cover directly and the filter never corrects it.
    await outlineNote('First.\n\nSecond.\n');
    await h.setCursor(0, 3);
    await down();
    await down();
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    // Line 3 is "Second."'s own trailing gap — included in the cover.
    expect(sel.head).toEqual({ line: 3, ch: 0 });
  });
});

describe('node-selection-extension: symmetry and cross-scope (E4, E4c, E5, E6)', () => {
  it('E4 — extending out of a scope does not pull in the parent', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(2, 8); // inside "child two", the LAST child
    await down();
    expect(await span()).toBe('2..2 fwd');
    await down();
    expect(await span()).toBe('2..4 fwd'); // `- parent` is NOT added
  });

  it('E4c — reversing after leaving a scope returns to the child', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(2, 8);
    await down();
    await down();
    await up();
    expect(await span()).toBe('2..2 fwd');
  });

  it('E5 — Shift+Up undoes Shift+Down', async () => {
    await outlineNote('Alpha one.\n\nBravo two.\n\nCharlie three.\n');
    await h.setCursor(2, 3);
    await down();
    await down();
    expect(await span()).toBe('2..5 fwd'); // Charlie's own trailing gap included
    await up();
    expect(await span()).toBe('2..3 fwd');
  });

  it('E6 — reversing past the anchor grows the other way', async () => {
    await outlineNote('Alpha one.\n\nBravo two.\n\nCharlie three.\n');
    await h.setCursor(2, 3);
    await down();
    await down();
    await up();
    await up();
    expect(await span()).toBe('0..3 back');
  });
});

describe('node-selection-extension: the ancestor swallow (E7, design D8)', () => {
  // The two shapes measured as FIXPOINTS before this change: after extending
  // up out of a first child, Shift+Down produced a byte-identical selection
  // indefinitely, because the head fell into the parent's own trailing gap
  // and re-resolved to the parent. Both must now move.
  const SHAPES: [string, string][] = [
    ['heading section', '# P\n\nc1 text.\n\nc2 text.\n\n# Q\n'],
    ['loose list', '- P\n\n\t- c1\n\n\t- c2\n\n- Q\n'],
  ];

  for (const [label, md] of SHAPES) {
    it(`${label} — Shift+Down after the swallow GROWS instead of sticking`, async () => {
      await outlineNote(md);
      await h.setCursor(2, 3); // inside the first child
      await up(); // press one: normalize onto the child's own subtree
      const child = await span();
      await up(); // press two: the swallow — the parent's whole subtree
      const swallowed = await span();
      expect(swallowed).not.toBe(child);

      await down();
      const after = await span();
      // The fixpoint is gone...
      expect(after).not.toBe(swallowed);
      // ...and it grew rather than dropping to the parent's last child.
      const [, hiAfter] = after.split(' ')[0]!.split('..').map(Number);
      const [, hiSwallowed] = swallowed.split(' ')[0]!.split('..').map(Number);
      expect(hiAfter).toBeGreaterThan(hiSwallowed!);
    });
  }
});

describe('node-selection-extension: multi-cursor (design D4)', () => {
  it('two cursors extend independently across repeated presses', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 1, ch: 8 }, head: { line: 1, ch: 8 } },
      { anchor: { line: 3, ch: 3 }, head: { line: 3, ch: 3 } },
    ]);
    await down();
    let ranges = await h.getSelectionRanges();
    expect(ranges).toHaveLength(2);
    await down();
    ranges = await h.getSelectionRanges();
    // Still two ranges: neither collapsed into a whole-document selection.
    expect(ranges).toHaveLength(2);
  });

  it('cursors at different depths do not drag each other along', async () => {
    await outlineNote('- P\n\t- a1\n\t- a2\n- Q\n\t- b1\n\t- b2\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 1, ch: 4 }, head: { line: 1, ch: 4 } },
      { anchor: { line: 3, ch: 2 }, head: { line: 3, ch: 2 } },
    ]);
    await down();
    const ranges = await h.getSelectionRanges();
    expect(ranges).toHaveLength(2);
    // The nested caret takes its own line; the top-level one takes its subtree.
    expect(ranges[0]!.head.line).toBe(1);
    expect(ranges[1]!.head.line).toBe(6); // Q's subtree, plus b2's owned gap
  });
});

describe('node-selection-extension: D4\'s merge edge and D6\'s restored input', () => {
  it('two cursors one node apart merge only on OVERLAP, then extend as a block', async () => {
    // Design D4's known edge, and one press is not enough to reach it:
    // CodeMirror permits ranges to TOUCH without merging, so press 1 leaves
    // two touching ranges, press 2 makes them overlap and merge, and press 3
    // must then extend the merged range as a single block.
    await outlineNote('- a\n- b\n- c\n- d\n- e\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 3 } },
      { anchor: { line: 2, ch: 3 }, head: { line: 2, ch: 3 } },
    ]);
    await down();
    expect(await h.getSelectionRanges()).toHaveLength(2);
    await down();
    const afterTwo = await h.getSelectionRanges();
    await down();
    const afterThree = await h.getSelectionRanges();
    // However many presses it takes for them to meet, the result stays a
    // coherent block selection and keeps growing — never fragmenting.
    expect(afterThree.length).toBeLessThanOrEqual(afterTwo.length);
    const last = afterThree[afterThree.length - 1]!;
    expect(last.head.line).toBeGreaterThan(2);
  });

  it('a selection restored by undo is normalized before stepping (design D6)', async () => {
    // History dispatches with `filter: false`, so escalation provably never
    // sees what undo restores: it is the pre-operation selection MAPPED
    // FORWARD, which need not be a cover at all. The press must still produce
    // one rather than stepping from an edge that is mid-node.
    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(1, 3);
    await down(); // block-select `- bravo`
    await browser.pause(50);
    await browser.keys(Key.Tab); // a structural op over the block selection
    await browser.pause(100);
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'z']);
    await browser.pause(100);

    await down();
    await browser.pause(50);
    const sel = await h.getSelection();
    // Whatever undo restored, the press lands on a whole-node boundary.
    expect(sel.anchor.ch).toBe(0);
  });
});

describe('node-selection-extension: scope of the binding', () => {
  it('off-mode Shift+Arrow is byte-for-byte native', async () => {
    const md = '- alpha\n- bravo\n- charlie\n';
    await h.createNote(NOTE, md);
    if (await h.isOutlineMode(NOTE)) {
      await h.toggleOutlineMode();
      await h.dismissNotices();
    }
    await h.setBuffer(md);
    await h.setCursor(0, 3);
    await down();
    // Native line-wise extension: the head moves one line, keeping its column.
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 3 });
    expect(sel.head.line).toBe(1);
  });

  it('a nested table-cell editor falls through to native', async () => {
    // #35's failure mode: a private outline-mode check looks equivalent to
    // `outlinePathOf` and is not, so outline rules get applied to a document
    // that is only the cell's raw text.
    await outlineNote('| a | b |\n| - | - |\n| - word | y |\n\nAfter.\n');
    await h.clickTableCell();
    await h.resetMotionCounts();
    await down();
    const counts = await h.getMotionCounts();
    const shiftDown = counts['Shift-Down'];
    // The binding may be invoked, but it must never CONSUME the key here.
    expect(shiftDown?.consumed ?? 0).toBe(0);
  });
});

describe('node-selection-extension: block-selection mode (design D9)', () => {
  it('a cover-to-cover press causes no focus transition', async () => {
    // COUNTS the focus/blur events during the press rather than comparing the
    // settled state before and after. The flicker is a full round trip that
    // ENDS where it started, so a before/after comparison passes even when the
    // editor left the mode and came back — verified: an earlier version of
    // this test passed against the pre-change build. The claim is that no
    // transition happens at all, so the transitions are what must be measured.
    await outlineNote('Alpha one.\n\nBravo two.\n\nCharlie three.\n');
    await h.setCursor(0, 6);
    await down(); // now a cover — block-selection mode blurs the editor
    await browser.pause(100);

    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const dom = (view.editor as any).cm.contentDOM as HTMLElement;
      const w = window as any;
      w.__toFocusEvents = 0;
      w.__toCount = () => w.__toFocusEvents;
      w.__toOnFocus = () => (w.__toFocusEvents += 1);
      dom.addEventListener('focus', w.__toOnFocus);
      dom.addEventListener('blur', w.__toOnFocus);
    });

    await down(); // cover -> cover: the same mode, so nothing should happen
    await browser.pause(100);

    const transitions = await browser.execute(() => (window as any).__toFocusEvents ?? -1);
    expect(transitions).toBe(0);
  });

  it('typing over a keyboard-built block selection still lands', async () => {
    // The failure mode D9 risks: a focus policy wrong in the blurred
    // direction silently eats keystrokes.
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 6);
    await down();
    await browser.pause(50);
    await browser.keys('X');
    await browser.pause(50);
    const text = await h.getBuffer();
    expect(text).not.toContain('Alpha one.');
    expect(text).toContain('X');
  });

  it('Backspace over a keyboard-built block selection still deletes it', async () => {
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 6);
    await down();
    await browser.pause(50);
    await browser.keys(Key.Backspace);
    await browser.pause(50);
    expect(await h.getBuffer()).not.toContain('Alpha one.');
  });

  it('a bound structural key still runs over a block selection', async () => {
    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(1, 3);
    await down(); // block-selects `- bravo`
    await browser.pause(50);
    await browser.keys(Key.Tab);
    await browser.pause(50);
    // Indented under `- alpha`, i.e. the grammar handler ran despite the
    // editor being blurred by block-selection mode.
    expect(await h.getBuffer()).toContain('\t- bravo');
  });

  it('a cover-to-cover Mod-A press causes no focus transition either', async () => {
    // docs/research/13's flash entry records an earlier attempt at this same
    // reorder that "had ZERO measurable effect" on the Mod-A path, and
    // attributes the Shift+Arrow flash to a two-transaction escalation that
    // does not exist (see that entry's correction). Mod-A dispatches exact
    // rungs, so it never split a transaction either — both paths only ever
    // flashed through the focus round trip, and both are covered by the one
    // policy. Measured here rather than assumed, since the entry predicts
    // otherwise.
    await outlineNote('- P\n\t- c1\n\t- c2\n- Q\n');
    await h.setCursor(1, 4);
    await h.pressSelectAll(); // rung 1: own content — not a cover
    await h.pressSelectAll(); // rung 2: c1's subtree — now a cover
    await browser.pause(100);

    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const dom = (view.editor as any).cm.contentDOM as HTMLElement;
      const w = window as any;
      w.__toModAEvents = 0;
      w.__toOnModA = () => (w.__toModAEvents += 1);
      dom.addEventListener('focus', w.__toOnModA);
      dom.addEventListener('blur', w.__toOnModA);
    });

    await h.pressSelectAll(); // cover -> cover
    await browser.pause(100);
    const transitions = await browser.execute(() => (window as any).__toModAEvents ?? -1);
    expect(transitions).toBe(0);
  });

  it('block chrome renders for extension-produced covers', async () => {
    // `escalated-selection-decoration` reads covers, not their provenance, so
    // a keyboard-built cover must decorate exactly like a drag-built one.
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(0, 4);
    await down(); // the whole `- parent` subtree
    await browser.pause(50);
    for (const line of [0, 1, 2]) {
      expect(await classListAtLine(line)).toContain(SELECTED_CLASS);
    }
    expect(await classListAtLine(3)).not.toContain(SELECTED_CLASS);
  });

  it('a mouse drag still settles into block selection', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test, see IS_MOBILE_RUN
    await outlineNote('First.\n\nSecond.\n');
    await h.mouseDragSelect({ line: 0, ch: 3 }, { line: 2, ch: 3 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
  });
});

describe('node-selection-extension: composition with the Mod-A ladder (design D10)', () => {
  it('Mod-A once then Shift+Down equals Shift+Down from a bare caret', async () => {
    // The ladder's first rung is a node's own content, which is NOT a cover;
    // reaching the cover is the press's step (D6), so both routes agree.
    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(0, 3);
    await h.pressSelectAll();
    await down();
    const viaLadder = await span();

    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(0, 3);
    await down();
    expect(await span()).toBe(viaLadder);
  });

  it('Shift+Arrow sideways then Mod-A climbs to the enclosing run', async () => {
    await outlineNote('- P\n\t- c1\n\t- c2\n- Q\n');
    await h.setCursor(1, 4);
    await down();
    await down(); // [c1, c2] — the sibling run under P
    expect(await span()).toBe('1..2 fwd');
    await h.pressSelectAll();
    expect(await span()).toBe('0..2 fwd'); // P's whole subtree
  });
});
