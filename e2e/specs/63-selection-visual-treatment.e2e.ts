/**
 * escalated-selection-decoration e2e (openspec/changes/selection-visual-
 * treatment): the block-level "this whole node is selected" chrome
 * (`to-decor-node-selected`) that renders whenever the current selection
 * covers a whole node/subtree, per `coveredSubtreeRoots` (escalate.ts).
 * Driven through real pointer/keyboard/programmatic paths — the detection
 * is deliberately stateless and history-independent (design.md), so this
 * suite exercises both an actual escalated drag AND a plain programmatic
 * selection that merely happens to match a node's bounds.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Scratch/selection-visual-treatment.md';
const CLASS = 'to-decor-node-selected';

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

/**
 * classList of whatever element actually renders logical (0-based) line
 * `lineNumber` — unlike `h.getLineClassList` (which indexes the Nth
 * `.cm-line` DOM child, skipping widget-replaced atoms like tables
 * entirely), this resolves by document position first, so it stays correct
 * for a line that comes AFTER a widget atom earlier in the same note.
 */
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

/**
 * The absolute viewport X coordinate the escalated-selection chrome's
 * `::before` actually starts at, for whatever element renders logical line
 * `lineNumber` — the element's own rect left PLUS the pseudo's resolved
 * (px) `left`. Two lines whose covers share the same root should resolve
 * to the SAME absolute column here, regardless of how much deeper either
 * line's own indentation reaches (the whole point of anchoring to the
 * root's column, not each line's own — see decorations.ts's
 * `selectedLineRootTargets`).
 */
async function chromeLeftAbsoluteX(lineNumber: number): Promise<number> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineNumber) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(lineNumber + 1).from;
      const { node } = cm.domAtPos(pos);
      const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const el = start?.closest('.cm-line, .cm-embed-block') as HTMLElement | null;
      if (!el) throw new Error(`no line/widget element for line ${lineNumber}`);
      const rect = el.getBoundingClientRect();
      const beforeLeft = parseFloat(getComputedStyle(el, '::before').left) || 0;
      return rect.left + beforeLeft;
    },
    lineNumber,
  );
}

/** Resolved (px) `width` of the escalated-selection chrome's `::before` for
 * whatever element renders logical line `lineNumber` — a regression guard
 * for the blockquote-specific bug where Obsidian's own native
 * `.HyperMD-quote::before` rule (`width: 1px`) silently won the cascade for
 * `width` (a property our own rule didn't set at all), shrinking the whole
 * chrome box to an invisible sliver on any blockquote line. */
async function chromeBeforeWidthPx(lineNumber: number): Promise<number> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineNumber) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(lineNumber + 1).from;
      const { node } = cm.domAtPos(pos);
      const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const el = start?.closest('.cm-line, .cm-embed-block') as HTMLElement | null;
      if (!el) throw new Error(`no line/widget element for line ${lineNumber}`);
      return parseFloat(getComputedStyle(el, '::before').width) || 0;
    },
    lineNumber,
  );
}

/** Resolved (px) `border-inline-start-width` of the escalated-selection
 * chrome's `::before` for whatever element renders logical line
 * `lineNumber` — confirms the REAL border stays reset to `none` (a border
 * always paints at the box's own edge, which this rule's own `left` moves,
 * so a real border here would still visibly relocate) now that the native
 * bar is reproduced instead via the fixed-position background stripe (see
 * `blockquoteStripeAbsoluteX` below). */
async function chromeBeforeBorderWidthPx(lineNumber: number): Promise<number> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineNumber) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(lineNumber + 1).from;
      const { node } = cm.domAtPos(pos);
      const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const el = start?.closest('.cm-line, .cm-embed-block') as HTMLElement | null;
      if (!el) throw new Error(`no line/widget element for line ${lineNumber}`);
      return parseFloat(getComputedStyle(el, '::before').borderInlineStartWidth) || 0;
    },
    lineNumber,
  );
}

/**
 * Absolute viewport X of the blockquote-specific background-image stripe
 * (styles.css's `.HyperMD-quote.to-decor-node-selected::before` rule) that
 * reproduces the native side-bar at its own FIXED position. `background-
 * position-x` resolves relative to the PSEUDO-ELEMENT's own box, not the
 * `.cm-line`'s — so this is the line's rect left, PLUS the pseudo's own
 * resolved `left` (how far this rule's `--to-selected-left` shifts the
 * pseudo away from the line's edge), PLUS `background-position-x` (how far
 * the stripe sits from the pseudo's own, now-shifted, edge). Unlike the
 * real border it replaces, this MUST resolve to the same absolute column
 * regardless of how far `--to-selected-left` shifts the box itself (that's
 * the whole point: the stripe cancels the shift out via `calc(-1 *
 * var(--to-selected-left))`), so comparing this across different cover
 * depths (different shift amounts) is the actual regression guard.
 */
async function blockquoteStripeAbsoluteX(lineNumber: number): Promise<number> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineNumber) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(lineNumber + 1).from;
      const { node } = cm.domAtPos(pos);
      const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const el = start?.closest('.cm-line, .cm-embed-block') as HTMLElement | null;
      if (!el) throw new Error(`no line/widget element for line ${lineNumber}`);
      const rect = el.getBoundingClientRect();
      const before = getComputedStyle(el, '::before');
      const pseudoLeft = parseFloat(before.left) || 0;
      const posX = parseFloat(before.backgroundPositionX) || 0;
      return rect.left + pseudoLeft + posX;
    },
    lineNumber,
  );
}

/** Resolved (px) `background-size` WIDTH of the blockquote stripe — nonzero
 * only on an actual blockquote line (the rule is scoped to `.HyperMD-quote`),
 * confirming the stripe doesn't leak onto other kinds. */
async function blockquoteStripeWidthPx(lineNumber: number): Promise<number> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineNumber) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(lineNumber + 1).from;
      const { node } = cm.domAtPos(pos);
      const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const el = start?.closest('.cm-line, .cm-embed-block') as HTMLElement | null;
      if (!el) throw new Error(`no line/widget element for line ${lineNumber}`);
      const size = getComputedStyle(el, '::before').backgroundSize;
      return parseFloat(size) || 0;
    },
    lineNumber,
  );
}

/**
 * Resolved `z-index` of whatever element renders logical (0-based) line
 * `lineNumber` itself (not its `::before`) — a regression guard for the
 * code-block/callout tinting bug: a `position: relative` line with
 * `z-index: auto` never becomes its own stacking-context root, so its
 * `z-index: -1` chrome pseudo gets hoisted to whichever ANCESTOR does
 * establish one, painting behind everything there — including that same
 * line's own opaque background (e.g. a code line's `background-color` set
 * directly on the `.cm-line`), which paints later, at stack level 0. An
 * explicit `z-index: 0` alongside `position: relative` makes the line its
 * own stacking-context root, so the chrome resolves as "one layer behind
 * just this line's own content," as intended.
 */
async function lineOwnZIndex(lineNumber: number): Promise<string> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineNumber) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(lineNumber + 1).from;
      const { node } = cm.domAtPos(pos);
      const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const el = start?.closest('.cm-line, .cm-embed-block') as HTMLElement | null;
      if (!el) throw new Error(`no line/widget element for line ${lineNumber}`);
      return getComputedStyle(el).zIndex;
    },
    lineNumber,
  );
}

/**
 * Native `::selection` computed `background-color` on the first real
 * `.cm-line` — used to confirm the suppression rule (styles.css) is
 * actually winning the cascade, not just that the class got toggled.
 * Queried on a LINE, not `cm.contentDOM` itself: the suppression selector
 * is `.cm-content ::selection` (a descendant combinator), which by design
 * doesn't apply to `.cm-content` itself — only to text actually inside it,
 * same as native's own equivalent rules all key off actual line content.
 */
async function nativeSelectionBackground(): Promise<string> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
    const cm = (view.editor as any).cm;
    const line = cm.contentDOM.querySelector('.cm-line') as HTMLElement;
    return getComputedStyle(line, '::selection').backgroundColor;
  });
}

describe('escalated-selection-decoration', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('an escalated boundary-crossing drag renders chrome on every covered line, including the gap between', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    // Sanity: this is the same escalation 61-selection-enforcement.e2e.ts
    // already asserts (anchor at doc start of "First", head at end of
    // "Second") — the point here is the CHROME that shape now renders.
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 2, ch: 'Second paragraph.'.length });

    expect(await h.getLineClassList(0)).toContain(CLASS);
    expect(await h.getLineClassList(1)).toContain(CLASS); // the gap between
    expect(await h.getLineClassList(2)).toContain(CLASS);
  });

  it('a drag past a node\'s end onto its gap line gets chrome, but not the untouched sibling', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    // The gap-line trigger: expand-only retains the head on the gap line
    // itself, past the node's own content end (see escalate.ts's
    // coveredSubtreeRoots doc comment) — the chrome must still cover both
    // the node's own line AND the gap line the drag actually landed on.
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 1, ch: 0 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 1, ch: 0 });

    expect(await h.getLineClassList(0)).toContain(CLASS);
    expect(await h.getLineClassList(1)).toContain(CLASS);
    expect(await h.getLineClassList(2)).not.toContain(CLASS); // "Second paragraph." untouched
  });

  it('a plain selection that merely matches a node\'s bounds also gets chrome (stateless detection)', async function () {
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    // Editor.setSelection dispatches with no userEvent — programmatic,
    // never touched by the enforcement filter (see
    // 61-selection-enforcement.e2e.ts's own programmatic-restore test) —
    // yet the chrome renders anyway, since detection is purely geometric,
    // not "was this produced by escalation."
    await h.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 'First paragraph.'.length });
    expect(await h.getLineClassList(0)).toContain(CLASS);
  });

  it('a partial within-node selection gets no chrome', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 0, ch: 8 });
    expect(await h.getLineClassList(0)).not.toContain(CLASS);
  });

  it('a cursor gets no chrome', async function () {
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.setCursor(0, 3);
    expect(await h.getLineClassList(0)).not.toContain(CLASS);
  });

  it('multi-range: uniform escalation gives each range its own chrome', async function () {
    const md = 'One.\n\nTwo.\n\nThree.\n\nFour.\n';
    await outlineNote(md);
    // Range 1 starts within "One." only; range 2 crosses Three./Four. —
    // the uniform multi-range rule (node-selection-enforcement) forces
    // BOTH to whole-node covers, and each must decorate independently.
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
      { anchor: { line: 4, ch: 2 }, head: { line: 6, ch: 2 } },
    ]);

    expect(await h.getLineClassList(0)).toContain(CLASS); // "One."
    expect(await h.getLineClassList(2)).not.toContain(CLASS); // "Two." — never part of either range
    expect(await h.getLineClassList(4)).toContain(CLASS); // "Three."
    expect(await h.getLineClassList(5)).toContain(CLASS); // gap between Three./Four.
    expect(await h.getLineClassList(6)).toContain(CLASS); // "Four."
  });

  it('off-mode note renders no chrome, even for a selection that would otherwise match', async function () {
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await h.createNote(NOTE, md);
    expect(await h.isOutlineMode(NOTE)).toBe(false);
    await h.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 'First paragraph.'.length });
    expect(await h.getLineClassList(0)).not.toContain(CLASS);
  });

  it('an escalated cover spanning a heading, a table, and a paragraph decorates all three', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    // Head
    //  - table (child of Head)
    //  - After. (child of Head, sibling of table)
    const md = '# Head\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.\n';
    await outlineNote(md);
    // Drag from inside the heading text down into "After." — leaving the
    // heading escalates to its ENTIRE subtree (heading + table + After.),
    // per node-selection-enforcement's "selection leaving a parent" rule.
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 6, ch: 3 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 6, ch: 'After.'.length });

    // Plain-line path (declarative CM6 decoration).
    expect(await h.getLineClassList(0)).toContain(CLASS); // '# Head'
    expect(await classListAtLine(6)).toContain(CLASS); // 'After.' (after the table widget)

    // Widget-atom path (direct DOM patch, MarginCompensation) — the table
    // renders as one opaque `.cm-embed-block.cm-table-widget`, not a
    // `.cm-line`, so it needs the imperative class toggle, not the CM6
    // decoration path above.
    const tableSelected = await h
      .getContentChildComputedStyle('.cm-embed-block.cm-table-widget.' + CLASS, 0, 'position')
      .catch(() => null);
    expect(tableSelected).toBe('relative');
  });

  it('the table loses its chrome once the selection no longer covers it', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = '# Head\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 6, ch: 3 });
    // Sanity: chrome present first (mirrors the previous test).
    expect(
      await h
        .getContentChildComputedStyle('.cm-embed-block.cm-table-widget.' + CLASS, 0, 'position')
        .catch(() => null),
    ).toBe('relative');

    // Collapse to a plain cursor inside "After." — no longer any cover.
    await h.setCursor(6, 2);
    const stillSelected = await h
      .getContentChildComputedStyle('.cm-embed-block.cm-table-widget.' + CLASS, 0, 'position')
      .catch(() => null);
    expect(stillSelected).toBeNull();
  });
});

describe('escalated-selection-decoration: native selection suppression (user review)', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('native character-level highlight is transparent while every range is a cover', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 2, ch: 6 }); // escalates
    const bg = await nativeSelectionBackground();
    // Transparent resolves to an rgba(...) with zero alpha, or the literal
    // keyword — either way, zero visible color, not the theme's real tint.
    expect(bg === 'transparent' || /rgba?\([^)]*,\s*0\)$/.test(bg)).toBe(true);
  });

  it('native highlight stays visible for a plain, non-covered selection', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 0, ch: 8 }); // partial, no cover
    const bg = await nativeSelectionBackground();
    expect(/rgba?\([^)]*,\s*0\)$/.test(bg)).toBe(false);
  });

  it('native highlight returns once the selection collapses to a cursor', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    expect(/rgba?\([^)]*,\s*0\)$/.test(await nativeSelectionBackground())).toBe(true);
    await h.setCursor(0, 3);
    expect(/rgba?\([^)]*,\s*0\)$/.test(await nativeSelectionBackground())).toBe(false);
  });

  it('off-mode note never suppresses native selection, even mid-drag across a boundary', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await h.createNote(NOTE, md);
    expect(await h.isOutlineMode(NOTE)).toBe(false);
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    expect(/rgba?\([^)]*,\s*0\)$/.test(await nativeSelectionBackground())).toBe(false);
  });
});

describe('escalated-selection-decoration: chrome anchors to the covered root\'s column (user review)', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('every covered line — heading, paragraph, list items, blockquote, code fence — shares one left edge', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    // One(0) > Two(1) > Three(2, root of the escalation) > [Body(3), list
    // items (deeper, native-indented), blockquote(3), code(3)].
    const md =
      '# One\n\n## Two\n\n### Three\n\nBody under three.\n\n- a list item\n  - nested item\n\n> a blockquote\n\n```\ncode fence\n```\n';
    await outlineNote(md);
    // 0 '# One' / 2 '## Two' / 4 '### Three' / 6 'Body under three.' /
    // 8 '- a list item' / 9 '  - nested item' / 11 '> a blockquote' /
    // 13 '```' (code open) / 14 'code fence' / 15 '```' (code close)
    await h.mouseDragSelect({ line: 4, ch: 6 }, { line: 15, ch: 3 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 4, ch: 0 });
    expect(sel.head).toEqual({ line: 15, ch: '```'.length });

    const rootX = await chromeLeftAbsoluteX(4); // '### Three' itself
    for (const line of [6, 8, 9, 11, 13]) {
      expect(await chromeLeftAbsoluteX(line)).toBeCloseTo(rootX, 0);
    }
    // Never reaching further left than the root's own column either — the
    // shallower ancestors (One, Two) must stay untouched.
    expect(await h.getLineClassList(0)).not.toContain(CLASS);
    expect(await classListAtLine(2)).not.toContain(CLASS);
  });

  it('a blockquote line inside a cover renders full-width chrome, not a 1px sliver (regression guard)', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    // Obsidian's native `.HyperMD-quote::before` sets `width: 1px` for its
    // own colored side-bar — our rule must reset `width` explicitly or that
    // leaks straight through uncontested, since nothing else conflicts with
    // it (see styles.css's own doc comment on this exact regression).
    const md = '# Head\n\n> a blockquote\n\nAfter.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 4, ch: 3 }); // whole section
    expect(await classListAtLine(2)).toContain(CLASS);
    expect(await chromeBeforeWidthPx(2)).toBeGreaterThan(100);
  });

  it('a selected blockquote\'s native side-bar is not dragged to the chrome\'s left edge, and not just discarded (regression guard)', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    // Nested under H1>H2>H3 so the chrome's left edge (one level shallower
    // than H3's own column) sits well away from the blockquote's own native
    // position — before the first fix, the native bar (a border-inline-start
    // on this same ::before) rendered wherever this rule's own `left` put
    // it. A second round found the FIRST fix (resetting that border to
    // `none`) too blunt: the bar just vanished instead of staying at its own
    // native position — the current fix reproduces it as a background-image
    // stripe positioned independently of the box's own (shifted) edge.
    const md = '# One\n\n## Two\n\n### Three\n\n> a blockquote\n\nAfter.\n';
    await outlineNote(md);
    // 0 '# One' / 2 '## Two' / 4 '### Three' / 6 '> a blockquote' / 8 'After.'

    // Cover A: rooted at "### Three" (a SMALLER shift — target is "## Two"'s
    // column).
    await h.mouseDragSelect({ line: 4, ch: 4 }, { line: 8, ch: 3 });
    expect(await classListAtLine(6)).toContain(CLASS);
    // The real border is still reset (a real border can't stay put while
    // the box's own edge — where a border always paints — moves).
    expect(await chromeBeforeBorderWidthPx(6)).toBe(0);
    expect(await blockquoteStripeWidthPx(6)).toBeGreaterThan(0); // not discarded
    const stripeXSmallShift = await blockquoteStripeAbsoluteX(6);
    const chromeXSmallShift = await chromeLeftAbsoluteX(6); // the tinted box's own (far-left) edge
    // The stripe sits well to the right of the chrome's own left edge — it
    // was NOT dragged out to match it (the original bug's exact symptom).
    expect(stripeXSmallShift).toBeGreaterThan(chromeXSmallShift + 20);

    // Cover B: rooted at "# One" (a MUCH LARGER shift — target is one level
    // above "# One", the shallowest possible). Same document, same
    // blockquote, same native indentation — only the shift amount differs.
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 8, ch: 3 });
    expect(await classListAtLine(6)).toContain(CLASS);
    const chromeXBigShift = await chromeLeftAbsoluteX(6);
    expect(chromeXBigShift).toBeLessThan(chromeXSmallShift - 20); // confirms the shift really is bigger
    // The stripe still resolves to the EXACT SAME absolute column as under
    // the smaller shift — proving its position is independent of how far
    // `--to-selected-left` moves the box, unlike the original bug.
    expect(await blockquoteStripeAbsoluteX(6)).toBeCloseTo(stripeXSmallShift, 0);
  });

  it('the blockquote stripe never appears on a non-blockquote line (regression guard)', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = '# Head\n\nBody.\n\n> a blockquote\n\nAfter.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 6, ch: 3 });
    expect(await classListAtLine(0)).toContain(CLASS);
    expect(await classListAtLine(2)).toContain(CLASS);
    expect(await blockquoteStripeWidthPx(0)).toBe(0); // heading
    expect(await blockquoteStripeWidthPx(2)).toBe(0); // paragraph
  });
});

describe('escalated-selection-decoration: chrome tints a line\'s own opaque background (user review)', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('a selected code fence line becomes its own stacking-context root, not z-index: auto (regression guard)', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    // A code line sets its own opaque `background-color` directly (unlike a
    // heading/paragraph, which stay transparent) — before this fix, that
    // background silently painted OVER the chrome's `z-index: -1` pseudo
    // instead of under it, since `position: relative` alone (no `z-index`)
    // never gives the line its own stacking context for that pseudo to
    // resolve against locally.
    const md = '# Head\n\n```\ncode fence\n```\n\nAfter.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 6, ch: 3 });
    expect(await classListAtLine(3)).toContain(CLASS); // the 'code fence' line itself
    expect(await lineOwnZIndex(3)).toBe('0');
  });

  it('an unselected code fence line keeps z-index: auto (no unconditional stacking-context change)', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = '# Head\n\n```\ncode fence\n```\n\nAfter.\n';
    await outlineNote(md);
    expect(await classListAtLine(3)).not.toContain(CLASS);
    expect(await lineOwnZIndex(3)).toBe('auto');
  });
});
