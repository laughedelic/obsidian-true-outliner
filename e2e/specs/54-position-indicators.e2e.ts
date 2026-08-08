/**
 * Position indicators (hierarchy-position-indicators): the caret-derived
 * decoration layer — an accent on the current node's marker, and an accented
 * ancestor trail in one of two styles.
 *
 * Assertions read the browser's own RESOLVED values (computed colors, computed
 * background layers, measured rects), never the custom properties or classes we
 * set — the postmortem's central false-confidence lesson: a DOM-attribute check
 * proves our code ran, not that anything rendered.
 *
 * The accent color is asserted as "different from the unaccented one", not as a
 * literal rgb triple: it resolves from the active theme's own `--text-accent`
 * (design decision 7), so pinning a value here would be asserting the theme
 * rather than the layer.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const MARKER = '.to-decor-marker-icon';
const BULLET = '.list-bullet';

/** The structured note every trail assertion below uses.
 *
 *  0 # Project
 *  1
 *  2 Overview paragraph.
 *  3
 *  4 ## Section A
 *  5
 *  6 Body of A.
 *  7
 *  8 ### Deep bit
 *  9
 * 10 - one
 * 11     - two
 * 12
 * 13 ## Section B
 * 14
 * 15 Body of B.
 */
const STRUCTURED = [
  '# Project',
  '',
  'Overview paragraph.',
  '',
  '## Section A',
  '',
  'Body of A.',
  '',
  '### Deep bit',
  '',
  '- one',
  '    - two',
  '',
  '## Section B',
  '',
  'Body of B.',
  '',
].join('\n');

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

/** Both setters skip a no-op change: each persists and then forces a full
 * redraw (main.ts's `forceRedraw`), which is far too expensive to run twice
 * per test just to reassert a value that is already in effect. */
async function setTrail(value: 'off' | 'guides' | 'path'): Promise<void> {
  const changed = await browser.executeObsidian(async ({ plugins }, v) => {
    const p = plugins.trueOutliner as any;
    if (p.ancestorTrail === v) return false;
    await p.setAncestorTrail(v);
    return true;
  }, value);
  if (changed) await browser.pause(250);
}

async function setMarkerHighlight(value: boolean): Promise<void> {
  const changed = await browser.executeObsidian(async ({ plugins }, v) => {
    const p = plugins.trueOutliner as any;
    if (p.highlightCurrentMarker === v) return false;
    await p.setHighlightCurrentMarker(v);
    return true;
  }, value);
  if (changed) await browser.pause(250);
}

/** Number of background layers the line's guide/trail overlay resolved to. */
async function overlayLayers(lineIndex: number): Promise<number> {
  const image = await h.getLinePseudoComputedStyle(lineIndex, 'background-image');
  if (!image || image === 'none') return 0;
  return (image.match(/gradient/g) ?? []).length;
}

/**
 * The distinct VISIBLE colors a line's overlay resolved to. Every gradient
 * layer also carries a fully transparent stop (that is how a 1px/2px line is
 * drawn inside a unit-wide layer), so those are filtered out — otherwise every
 * line would report one extra "color" that is not a color.
 */
async function overlayColors(lineIndex: number): Promise<string[]> {
  const image = await h.getLinePseudoComputedStyle(lineIndex, 'background-image');
  const found = image.match(/rgba?\([^)]*\)/g) ?? [];
  return [...new Set(found.filter((c) => !/,\s*0\)$/.test(c)))];
}

/** Every line's rendered left edge plus the marker's own rect — the geometry
 * that must not move when a purely decorative setting changes. */
function geometrySnapshot(): Promise<unknown> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
    const cm = (view.editor as any).cm;
    const lines = Array.from(cm.contentDOM.querySelectorAll(':scope > .cm-line')) as HTMLElement[];
    const origin = cm.contentDOM.getBoundingClientRect();
    return lines.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const icon = el.querySelector('.to-decor-marker-icon') as HTMLElement | null;
      const ir = icon?.getBoundingClientRect();
      return {
        left: Math.round(r.left - origin.left),
        padding: cs.paddingLeft,
        margin: cs.marginLeft,
        gutter: cs.getPropertyValue('--to-marker-gutter'),
        icon: ir
          ? {
              left: Math.round(ir.left - origin.left),
              w: Math.round(ir.width),
              h: Math.round(ir.height),
            }
          : null,
      };
    });
  });
}

describe('position indicators: current node and ancestor trail', function () {
  /** The two settings' effective values immediately after a plugin load whose
   * on-disk data has neither key — captured before any test can set one. */
  let defaults: { marker: unknown; trail: unknown };

  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    defaults = await browser.executeObsidian(({ plugins }) => {
      const p = plugins.trueOutliner as any;
      return { marker: p.highlightCurrentMarker, trail: p.ancestorTrail };
    });
  });

  // Both settings are global and persisted, so a test that changes one would
  // otherwise leak into every test after it — including through a failure,
  // which is exactly how a single wrong assertion turns into a cascade of
  // unrelated-looking ones. Restored per test rather than per describe block.
  beforeEach(async function () {
    await setTrail('guides');
    await setMarkerHighlight(true);
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  describe('defaults and scoping', function () {
    it('ships with the marker accent on and the trail on “guides”', async function () {
      // `resetPluginState` wrote a data.json with NEITHER key, then reloaded
      // the plugin — exactly the shape an install predating this change has on
      // disk. These values therefore come from the
      // `{...DEFAULT_DATA, ...(await loadData())}` merge in `onload`, which is
      // the whole migration story. Captured in `before`, ahead of any setter.
      expect(defaults).toEqual({ marker: true, trail: 'guides' });
    });

    it('renders no accent at all with outline mode off', async function () {
      const note = 'Scratch/pi-off-mode.md';
      await h.createNote(note, STRUCTURED);
      await h.setCursor(8, 5);
      await browser.pause(200);

      expect(await h.isOutlineMode(note)).toBe(false);
      // No marker exists off-mode at all, so there is nothing to accent, and
      // no overlay renders on any line.
      expect(await h.getLineChildComputedStyle(8, MARKER, 'color')).toBe(null);
      expect(await overlayLayers(8)).toBe(0);
      expect(await overlayLayers(4)).toBe(0);
      expect((await h.getLineClassList(8)).filter((c) => c.startsWith('to-decor'))).toEqual([]);
    });
  });

  describe('current-node marker accent', function () {
    it('accents the marker of the heading the caret is in, and no other', async function () {
      const note = 'Scratch/pi-marker-heading.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('guides');
      await setMarkerHighlight(true);
      await h.setCursor(8, 5); // "### Deep bit"
      await browser.pause(250);

      const current = await h.getLineChildComputedStyle(8, MARKER, 'color');
      const other = await h.getLineChildComputedStyle(4, MARKER, 'color');
      expect(current).toBeTruthy();
      expect(other).toBeTruthy();
      expect(current).not.toBe(other);
      // Every other marker-bearing line shares the one unaccented color.
      expect(await h.getLineChildComputedStyle(2, MARKER, 'color')).toBe(other);
      expect(await h.getLineChildComputedStyle(13, MARKER, 'color')).toBe(other);
    });

    it("accents a list item's NATIVE bullet, which the caret does not swap for raw text", async function () {
      const note = 'Scratch/pi-marker-list.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await h.setCursor(11, 9); // "    - two", the deepest list item
      await browser.pause(250);

      // docs/research/14: the bullet element survives the caret sitting on its
      // own line — the raw-text swap belongs to the block-selection reveal path.
      const current = await h.getLineChildComputedStyle(11, BULLET, 'background-color', '::after');
      const sibling = await h.getLineChildComputedStyle(10, BULLET, 'background-color', '::after');
      expect(current).toBeTruthy();
      expect(sibling).toBeTruthy();
      expect(current).not.toBe(sibling);
      expect(await h.getLineClassList(11)).toContain('to-decor-current-native');

      // Moving on releases the previous one and claims the new one.
      await h.setCursor(10, 4);
      await browser.pause(250);
      expect(await h.getLineChildComputedStyle(10, BULLET, 'background-color', '::after')).toBe(
        current,
      );
      expect(await h.getLineChildComputedStyle(11, BULLET, 'background-color', '::after')).toBe(
        sibling,
      );
    });

    it('accents only the node’s FIRST line, never a continuation or gap line', async function () {
      const note = 'Scratch/pi-marker-multiline.md';
      // A hard-wrapped paragraph under a heading: lines 2-4 are one node.
      await h.createNote(note, '# Head\n\nfirst\nsecond\nthird\n\n');
      await ensureOutlineMode(note);
      await h.setCursor(4, 3); // the node's LAST continuation line
      await browser.pause(250);

      const accented = await h.getLineChildComputedStyle(2, MARKER, 'color');
      const plain = await h.getLineChildComputedStyle(0, MARKER, 'color');
      expect(accented).not.toBe(plain);
      // Continuation lines carry no marker at all, so none can be accented.
      expect(await h.getLineChildComputedStyle(3, MARKER, 'color')).toBe(null);
      expect(await h.getLineChildComputedStyle(4, MARKER, 'color')).toBe(null);
      expect(await h.getLineClassList(3)).not.toContain('to-decor-current');
      expect(await h.getLineClassList(5)).not.toContain('to-decor-current'); // gap line
    });

    it('turns off independently of the trail', async function () {
      const note = 'Scratch/pi-marker-toggle.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('guides');
      await h.setCursor(8, 5);
      await browser.pause(250);
      const plain = await h.getLineChildComputedStyle(4, MARKER, 'color');
      expect(await h.getLineChildComputedStyle(8, MARKER, 'color')).not.toBe(plain);

      await setMarkerHighlight(false);
      await h.setCursor(8, 5);
      await browser.pause(250);
      // Marker back to normal — and the trail is untouched: line 15 still
      // shows two colors (Project's guide accented, Section B's not), which
      // only the trail can produce.
      expect(await h.getLineChildComputedStyle(8, MARKER, 'color')).toBe(plain);
      expect(await overlayColors(15)).toHaveLength(2);
    });
  });

  describe("'guides' style", function () {
    it("accents an ancestor's guide but leaves a sibling subtree's alone", async function () {
      const note = 'Scratch/pi-guides.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('guides');
      await h.setCursor(8, 5); // "### Deep bit": ancestors are Project (0), Section A (1)
      await browser.pause(250);

      // Line 6 ("Body of A.") sits under both ancestors: two guides, both
      // accented, so exactly one color is present.
      const inside = await overlayColors(6);
      expect(inside).toHaveLength(1);

      // Line 15 ("Body of B.") sits under Project (an ancestor) and Section B
      // (NOT an ancestor): two guides, two DIFFERENT colors.
      const outside = await overlayColors(15);
      expect(outside).toHaveLength(2);
      expect(outside).toContain(inside[0]); // the ancestor's, accented
    });

    it('accents the ancestor guide on gap lines too, with no break', async function () {
      const note = 'Scratch/pi-guides-gaps.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('guides');
      await h.setCursor(8, 5);
      await browser.pause(250);
      // Lines 5 and 7 are blank separators inside Section A's subtree.
      expect(await overlayColors(5)).toEqual(await overlayColors(6));
      expect(await overlayColors(7)).toEqual(await overlayColors(6));
    });

    it('emits no accent for a top-level node — there is no ancestor', async function () {
      const note = 'Scratch/pi-guides-toplevel.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('guides');
      await h.setCursor(0, 3); // "# Project" itself
      await browser.pause(250);
      // Every guide in the document renders in the one unaccented color.
      const colors = new Set([
        ...(await overlayColors(2)),
        ...(await overlayColors(6)),
        ...(await overlayColors(15)),
      ]);
      expect(colors.size).toBe(1);
    });
  });

  describe("'path' style", function () {
    it('runs a connected path from the root to the caret, and stops there', async function () {
      const note = 'Scratch/pi-path.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('path');
      await h.setCursor(8, 5); // "### Deep bit"
      await browser.pause(250);

      // Line 0 ("# Project") owns no guide of its own, yet the path leaves its
      // marker downward — so an overlay exists there ONLY because of the path.
      // That is the half-segment the guides style never draws.
      expect(await overlayLayers(0)).toBe(1);

      // Line 4 ("## Section A") is a level change: the arriving segment, the
      // departing half-segment, plus the plain guide underneath. NOTHING
      // horizontal — the elbow that used to be here ran through this row's own
      // marker icon, and the accented marker is the junction instead.
      expect(await overlayLayers(4)).toBe(3);

      // Below the current node the path is gone — line 10 ("- one") keeps
      // only its plain guides.
      expect(await overlayColors(10)).toHaveLength(1);
      expect(await overlayColors(15)).toHaveLength(1);
    });

    it('does not accent an ancestor’s full extent the way guides does', async function () {
      const note = 'Scratch/pi-path-extent.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await h.setCursor(8, 5);

      await setTrail('guides');
      await h.setCursor(8, 5);
      await browser.pause(250);
      // Under guides, line 15 (still inside Project's subtree, below the
      // caret) carries the accented ancestor guide.
      expect(await overlayColors(15)).toHaveLength(2);

      await setTrail('path');
      await h.setCursor(8, 5);
      await browser.pause(250);
      // Under path it does not — the accent ended at the current node.
      expect(await overlayColors(15)).toHaveLength(1);
    });

    it('accents every ancestor’s marker — the junction that replaced the elbows', async function () {
      const note = 'Scratch/pi-path-ancestors.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('path');
      await h.setCursor(8, 5); // "### Deep bit": ancestors are lines 0 and 4
      await browser.pause(250);

      const plain = await h.getLineChildComputedStyle(2, MARKER, 'color'); // not on the path
      const rootMarker = await h.getLineChildComputedStyle(0, MARKER, 'color');
      const midMarker = await h.getLineChildComputedStyle(4, MARKER, 'color');
      expect(rootMarker).not.toBe(plain);
      expect(midMarker).not.toBe(plain);
      // A sibling section is not an ancestor, so its marker stays plain.
      expect(await h.getLineChildComputedStyle(13, MARKER, 'color')).toBe(plain);
      expect(await h.getLineClassList(0)).toContain('to-decor-ancestor');
      expect(await h.getLineClassList(4)).toContain('to-decor-ancestor');
    });

    it('accents ancestor BULLETS in a list, where no segment can be drawn', async function () {
      const note = 'Scratch/pi-path-list-ancestors.md';
      // A pure list: no non-list ancestor exists, so the path style has no
      // column to draw a single segment on — the accented bullets are the
      // entire rendering, and the reason they exist.
      await h.createNote(note, '- one\n    - two\n        - three\n');
      await ensureOutlineMode(note);
      await setTrail('path');
      await h.setCursor(2, 15); // the deepest item
      await browser.pause(250);

      const current = await h.getLineChildComputedStyle(2, BULLET, 'background-color', '::after');
      const anc0 = await h.getLineChildComputedStyle(0, BULLET, 'background-color', '::after');
      const anc1 = await h.getLineChildComputedStyle(1, BULLET, 'background-color', '::after');
      expect(anc0).toBe(current); // both ancestors accented, like the caret's own
      expect(anc1).toBe(current);
      expect(await h.getLineClassList(0)).toContain('to-decor-ancestor-native');
      expect(await overlayLayers(2)).toBe(0); // and genuinely nothing is drawn

      // The guides style does NOT accent ancestor markers — that is what
      // distinguishes the two styles here.
      await setTrail('guides');
      await h.setCursor(2, 15);
      await browser.pause(250);
      expect(await h.getLineChildComputedStyle(0, BULLET, 'background-color', '::after')).not.toBe(
        current,
      );
    });

    it('keeps the base guide continuous through a half-accented row', async function () {
      const note = 'Scratch/pi-path-continuity.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('path');
      await h.setCursor(8, 5);
      await browser.pause(250);
      // Line 4 carries a HALF-height accent at depth 0. The plain guide at
      // that same depth must survive underneath it, or the base guide would
      // show a visible gap on exactly this row.
      const sizes = await h.getLinePseudoComputedStyle(4, 'background-size');
      expect(sizes).toContain('100%'); // a full-height layer is still present
      expect(sizes).toMatch(/50%/); // and the half-height accent is too
    });

    it('reaches a list item without drawing at a native list column', async function () {
      const note = 'Scratch/pi-path-list.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('path');
      await h.setCursor(11, 9); // "    - two"
      await browser.pause(250);

      // The path reaches the row and the bullet is accented, but no accent
      // is placed on a list level: the accented layers only ever sit at our
      // own `depth * unit` columns (docs/research/14's deliberate gap).
      expect(await h.getLineClassList(11)).toContain('to-decor-current-native');
      const positions = await h.getLinePseudoComputedStyle(11, 'background-position');
      // Three plain guides (depths 0,1,2) plus one accent — all at multiples
      // of the decoration unit, none at a list-specific offset.
      expect(await overlayLayers(11)).toBe(4);
      expect(positions).toBeTruthy();
    });
  });

  describe('caret tracking and suppression', function () {
    it('follows the caret with no reload and no edit', async function () {
      const note = 'Scratch/pi-tracking.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('guides');
      await h.setCursor(6, 2); // "Body of A." — under Project + Section A
      await browser.pause(250);
      expect(await overlayColors(15)).toHaveLength(2); // Section B's guide unaccented

      await h.setCursor(15, 2); // "Body of B." — now under Project + Section B
      await browser.pause(250);
      expect(await overlayColors(15)).toHaveLength(1); // both its guides accented
      expect(await overlayColors(6)).toHaveLength(2); // and Section A's is not
    });

    it('is suppressed while a whole-subtree cover is selected, and returns after', async function () {
      const note = 'Scratch/pi-suppression.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('guides');
      await h.setCursor(6, 2);
      await browser.pause(250);
      const plainMarker = await h.getLineChildComputedStyle(4, MARKER, 'color');
      expect(await h.getLineChildComputedStyle(6, MARKER, 'color')).not.toBe(plainMarker);

      // Select the whole "Body of A." node — an escalated cover, which draws
      // block-selection chrome and takes over answering "where am I". A node's
      // bounds include its own trailing gap (`escalate-include-owned-gap`), so
      // the selection has to reach line 7 to match the cover, not stop at the
      // content line's last character.
      await h.setSelection({ line: 6, ch: 0 }, { line: 7, ch: 0 });
      await browser.pause(300);
      // First establish that this selection really IS a cover — otherwise a
      // passing suppression assertion below would prove nothing.
      expect(await h.getLineClassList(6)).toContain('to-decor-node-selected');
      expect(await h.getLineChildComputedStyle(6, MARKER, 'color')).toBe(plainMarker);
      expect(await overlayColors(6)).toHaveLength(1); // no accented guide either

      await h.setCursor(6, 2);
      await browser.pause(300);
      expect(await h.getLineChildComputedStyle(6, MARKER, 'color')).not.toBe(plainMarker);
    });

    it('draws one trail for multiple cursors, from the primary range', async function () {
      const note = 'Scratch/pi-multicursor.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('guides');
      // Two cursors in different subtrees; CM6's primary is the last range.
      await h.dispatchSelectOnlyRanges([
        { anchor: { line: 6, ch: 2 }, head: { line: 6, ch: 2 } },
        { anchor: { line: 15, ch: 2 }, head: { line: 15, ch: 2 } },
      ]);
      await browser.pause(300);
      const plainMarker = await h.getLineChildComputedStyle(4, MARKER, 'color');
      const accented = [6, 15].filter(
        async (l) => (await h.getLineChildComputedStyle(l, MARKER, 'color')) !== plainMarker,
      );
      expect(accented.length).toBeGreaterThan(0);
      // Exactly one of the two subtrees reads as current: Section A's guide
      // and Section B's guide cannot both be accented.
      const a = (await overlayColors(6)).length;
      const b = (await overlayColors(15)).length;
      expect(a === b).toBe(false);
    });
  });

  describe('geometry and settings contracts', function () {
    it('changes no geometry across every setting combination', async function () {
      const note = 'Scratch/pi-geometry.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await h.setCursor(8, 5);
      await browser.pause(250);

      await setTrail('off');
      await setMarkerHighlight(false);
      await h.setCursor(8, 5);
      await browser.pause(250);
      const baseline = await geometrySnapshot();

      for (const trail of ['off', 'guides', 'path'] as const) {
        for (const marker of [true, false]) {
          await setTrail(trail);
          await setMarkerHighlight(marker);
          await h.setCursor(8, 5);
          await browser.pause(250);
          expect(await geometrySnapshot()).toEqual(baseline);
        }
      }
    });

    it('with both off, renders exactly what the base layers render', async function () {
      const note = 'Scratch/pi-all-off.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('off');
      await setMarkerHighlight(false);
      await h.setCursor(8, 5);
      await browser.pause(250);

      // One marker color everywhere, one guide color everywhere, and a
      // top-level node's own line has no overlay at all.
      const colors = new Set([
        ...(await overlayColors(2)),
        ...(await overlayColors(6)),
        ...(await overlayColors(15)),
      ]);
      expect(colors.size).toBe(1);
      expect(await overlayLayers(0)).toBe(0);
      expect(await h.getLineChildComputedStyle(8, MARKER, 'color')).toBe(
        await h.getLineChildComputedStyle(4, MARKER, 'color'),
      );
    });

    it('applies a settings change live on a note of only widget-replaced atoms', async function () {
      const note = 'Scratch/pi-widget-only.md';
      // A table nested under a heading: a decoration output that is otherwise
      // byte-identical across the setting change — the exact case `forceRedraw`
      // exists for (main.ts).
      await h.createNote(note, '# Head\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n');
      await ensureOutlineMode(note);
      await h.setCursor(0, 3); // caret on the heading, so IT is current
      await browser.pause(300);

      await setMarkerHighlight(false);
      await h.setCursor(0, 3);
      await browser.pause(300);
      const plain = await h.getLineChildComputedStyle(0, MARKER, 'color');

      await setMarkerHighlight(true);
      await h.setCursor(0, 3);
      await browser.pause(300);
      expect(await h.getLineChildComputedStyle(0, MARKER, 'color')).not.toBe(plain);
    });

    it('leaves a pure list’s geometry byte-identical to outline-mode-off', async function () {
      const note = 'Scratch/pi-pure-list.md';
      await h.createNote(note, '- one\n    - two\n        - three\n');
      await h.setCursor(2, 12);
      await browser.pause(250);
      const off = await geometrySnapshot();

      await ensureOutlineMode(note);
      await setTrail('path');
      await h.setCursor(2, 12);
      await browser.pause(250);
      // The caret-derived accent may color the bullet, but the base layers
      // still contribute nothing: same positions, same everything.
      expect(await geometrySnapshot()).toEqual(off);
    });
  });

  describe('theming', function () {
    it('resolves the accent from the active theme, in light and in dark', async function () {
      const note = 'Scratch/pi-theme.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await h.setCursor(8, 5);
      await browser.pause(250);

      await h.setTheme(true);
      await browser.pause(300);
      const dark = await h.getLineChildComputedStyle(8, MARKER, 'color');
      const darkPlain = await h.getLineChildComputedStyle(4, MARKER, 'color');

      await h.setTheme(false);
      await browser.pause(300);
      const light = await h.getLineChildComputedStyle(8, MARKER, 'color');
      const lightPlain = await h.getLineChildComputedStyle(4, MARKER, 'color');

      // Accented in both, and distinguishable from the unaccented marker in
      // both — the point of resolving through the theme's own variables
      // rather than a hardcoded color that can only suit one of them.
      expect(dark).not.toBe(darkPlain);
      expect(light).not.toBe(lightPlain);
      await h.setTheme(true);
      await browser.pause(200);
    });

    it('lets a snippet retune the accent with no geometry change', async function () {
      const note = 'Scratch/pi-snippet.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await h.setCursor(8, 5);
      await browser.pause(250);
      const before = await geometrySnapshot();
      const original = await h.getLineChildComputedStyle(8, MARKER, 'color');

      // What a user snippet does: override the custom property, nothing else.
      await browser.executeObsidian(() => {
        const style = document.createElement('style');
        style.id = 'pi-snippet-probe';
        style.textContent = '.markdown-source-view.mod-cm6 .cm-content { --to-decor-accent: rgb(1, 2, 3); }';
        document.head.appendChild(style);
      });
      await browser.pause(250);

      expect(await h.getLineChildComputedStyle(8, MARKER, 'color')).toBe('rgb(1, 2, 3)');
      expect(await h.getLineChildComputedStyle(8, MARKER, 'color')).not.toBe(original);
      expect(await geometrySnapshot()).toEqual(before);

      await browser.executeObsidian(() => {
        document.getElementById('pi-snippet-probe')?.remove();
      });
      await browser.pause(150);
    });
  });

  describe('layer contracts', function () {
    it('renders no indicators inside a nested per-cell table editor', async function () {
      const note = 'Scratch/pi-nested-editor.md';
      await h.createNote(note, '# Section\n\n| a | b |\n| --- | --- |\n| word | 2 |\n');
      await ensureOutlineMode(note);
      await browser.pause(200);
      await h.clickTableCell();
      await browser.pause(200);

      const nested = await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
        const cm = (view.editor as any).cm;
        const editor = cm.contentDOM.querySelector('.cm-embed-block .cm-editor') as HTMLElement;
        const line = editor.querySelector('.cm-line') as HTMLElement | null;
        return {
          found: line !== null,
          classes: line ? Array.from(line.classList) : [],
          overlay: line ? getComputedStyle(line, '::after').backgroundImage : null,
        };
      });
      expect(nested.found).toBe(true);
      expect(nested.classes.filter((c) => c.startsWith('to-decor'))).toEqual([]);
      expect(nested.overlay === 'none' || nested.overlay === '').toBe(true);
    });

    it('mutates nothing as the caret moves through the tree', async function () {
      const note = 'Scratch/pi-non-mutation.md';
      await h.createNote(note, STRUCTURED);
      await ensureOutlineMode(note);
      await setTrail('path');

      await h.setCursor(15, 10);
      await h.keys.type(' xyz');
      await browser.pause(200);
      const edited = await h.getBuffer();
      expect(edited).toContain('Body of B. xyz');

      // Walk the caret across every level, which recomputes the whole layer
      // on each move.
      for (const line of [0, 2, 4, 6, 8, 10, 11, 13, 15, 8, 0]) {
        await h.setCursor(line, 1);
        await browser.pause(60);
      }
      expect(await h.getBuffer()).toBe(edited);

      // A SINGLE undo reverts the real edit: no recompute pushed a
      // change-bearing transaction into the history in between.
      await h.setCursor(15, 13);
      await h.keys.undo();
      await browser.pause(250);
      expect(await h.getBuffer()).not.toContain(' xyz');
    });
  });
});
