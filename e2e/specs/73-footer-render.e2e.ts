/**
 * A first look at the footer rendering against a real vault: does it mount,
 * group, and place references where the model says it should.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const TARGET = 'Projects/Aurora Dashboard.md';
/**
 * The note the ORGANIC material points at (`test-vault/Backlinks/Severity
 * rollout diary.md` and `Long chain, long names.md`).
 *
 * A target of its own, because `Aurora Dashboard` is what the generated
 * backlink hub points at: 100+ machine-written notes whose ancestors are plain
 * prose, which cap out the footer before any hand-written chain reaches it.
 */
const ORGANIC = 'Projects/Severity rollout.md';

/**
 * The footer lives at `doc.length`, and CodeMirror virtualises: in a document
 * long enough for its end to fall outside the viewport, that region is a
 * `cm-gap` and the widget's DOM does not exist until the reader scrolls there.
 * Not a defect — it is why the footer costs nothing on a note nobody scrolls to
 * the bottom of — but every assertion about the footer has to reach it first.
 */
async function scrollToEnd(): Promise<void> {
  await browser.executeObsidian(() => {
    const scroller = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await browser.pause(400);
}

async function ensureOutlineMode(notePath: string): Promise<void> {
  await h.setOutlineMode(true);
}

function dump(): Promise<string[]> {
  return browser.executeObsidian(() => {
    // Scoped to the ACTIVE leaf: every open note has its own footer, so an
    // unscoped query returns whichever one happens to be first in the document.
    const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
    if (!root) return ['<no footer>'];
    const out: string[] = [];
    root.querySelectorAll('.to-backlinks-head, .to-backlinks-group-head, .to-backlinks-row, .to-backlinks-resolving')
      .forEach((el) => {
        // Only the footer's OWN classes name what a line is. A row also carries
        // the editor's chrome classes (`to-decor-block`, `to-decor-atom`),
        // which say how it is drawn, not what it is — including them here would
        // make every assertion below sensitive to a layout change.
        const cls = Array.from(el.classList)
          .filter((c) => c.startsWith('to-backlinks-') || c.startsWith('is-'))
          .map((c) => c.replace('to-backlinks-', ''))
          .join('+');
        out.push(`${cls}: ${(el.textContent ?? '').trim().slice(0, 70)}`);
      });
    return out;
  });
}

describe('backlinks footer: first render', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await browser.executeObsidian(({ plugins }) => {
      (plugins.trueOutliner as any).backlinks.rebuild();
    });
  });

  it('renders groups and rows for a referenced note', async function () {
    await h.openNote(TARGET);
    await ensureOutlineMode(TARGET);
    await scrollToEnd();
    await browser.pause(2000);
    const lines = await dump();
    expect(lines.some((l) => l.startsWith('head') && l.includes('Structured backlinks'))).toBe(true);
    expect(lines.some((l) => l.startsWith('group-head'))).toBe(true);
    expect(lines.some((l) => l.startsWith('row+is-reference'))).toBe(true);
    // Lineage is what distinguishes this from Obsidian's own backlinks.
    expect(lines.some((l) => l.startsWith('row+is-lineage'))).toBe(true);
    // A nested list item's text must render as markdown, not as the code block
    // its own indentation would otherwise make it.
    expect(lines.some((l) => l.includes('[[Aurora Dashboard]]'))).toBe(false);
  });

  it('is the last thing in the content, with no line of its own below it', async function () {
    // A block widget with a NEGATIVE side at the END of a line sorts INSIDE
    // that line and splits it, leaving the line's empty remainder rendered
    // below the widget. That remainder is a real line: it takes the caret, so
    // the space under the footer became a place a click could put the cursor.
    await h.openNote(TARGET);
    await ensureOutlineMode(TARGET);
    await scrollToEnd();
    await browser.pause(1500);
    expect(
      await browser.executeObsidian(() => {
        const content = document.querySelector('.workspace-leaf.mod-active .cm-content');
        if (!content) return -1;
        const kids = Array.from(content.children) as HTMLElement[];
        const footer = kids.findIndex((el) => el.classList.contains('to-backlinks'));
        if (footer < 0) return -1;
        return kids.slice(footer + 1).filter((el) => el.classList.contains('cm-line')).length;
      }),
    ).toBe(0);
  });

  it('takes no chrome from the line it is anchored to', async function () {
    // The footer is mounted after the content rather than being a rendering of
    // that line, and the widget-line patch cannot tell the difference on its
    // own. Without saying so, a note whose last line is a nested list item drew
    // that item's ancestor guide straight down through the whole footer.
    const note = 'Scratch/footer-neighbour.md';
    await h.createNote(note, ['# Top', '', '- one', '\t- nested', ''].join('\n'));
    await h.openNote(note);
    await ensureOutlineMode(note);
    await scrollToEnd();
    await browser.pause(1500);
    const footer = await browser.executeObsidian(() => {
      const el = document.querySelector('.workspace-leaf.mod-active .to-backlinks') as HTMLElement | null;
      if (!el) return null;
      return { cls: el.className, guide: getComputedStyle(el, '::after').backgroundImage };
    });
    expect(footer?.cls).toContain('to-decor-own-chrome');
    expect(footer?.guide).toBe('none');
  });

  it('shows one header line, counted, for a note nothing links to', async function () {
    await h.openNote('Notes/Sourdough Log.md');
    await ensureOutlineMode('Notes/Sourdough Log.md');
    await scrollToEnd();
    await browser.waitUntil(
      // The empty state is the section's own header with `0 references` beside
      // it — the same one line a referenced note gets, with nothing under it,
      // rather than a second thing to recognise.
      async () => (await dump()).some((l) => l.startsWith('head') && l.includes('0 references')),
      { timeout: 8000, timeoutMsg: 'no empty-state header' },
    );
  });

  /**
   * A lineage row is inline CONTENT, not a source string.
   *
   * Asserted on the row's DOM rather than on its text, because the defect this
   * closes was invisible to `textContent`: `**bold**` reads as `**bold**`
   * either way, and what changed is that a `<strong>` exists now. Every
   * assertion below names an element or a computed property, never a glyph
   * width — CI's fonts are not macOS's.
   */
  it('renders a lineage segment as inline content, not as markdown source', async function () {
    await h.openNote(ORGANIC);
    await ensureOutlineMode(ORGANIC);
    await scrollToEnd();

    const seen = await browser.waitUntil(
      async () =>
        browser.executeObsidian(() => {
          const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
          if (!root) return null;
          const segs = Array.from(root.querySelectorAll('.to-backlinks-row.is-lineage .to-backlinks-seg'));
          if (segs.length === 0) return null;
          const html = segs.map((s) => s.innerHTML).join('');
          const text = segs.map((s) => (s as HTMLElement).innerText).join(' ');
          return {
            strong: segs.some((s) => s.querySelector('strong') !== null),
            em: segs.some((s) => s.querySelector('em') !== null),
            code: segs.some((s) => s.querySelector('code') !== null),
            anchors: segs.some((s) => s.querySelector('a') !== null),
            // The source characters the defect showed. `innerText`, so a `**`
            // that only exists inside an attribute does not count.
            asterisks: /\*\*/.test(text),
            brackets: /\]\(http/.test(text),
            wikibrackets: /\[\[/.test(text),
            html,
          };
        }),
      { timeout: 12000, timeoutMsg: 'no lineage segments rendered' },
    );

    // A bold ancestor produces <strong>, a linked one <a>, a code span <code>.
    expect(seen!.strong).toBe(true);
    expect(seen!.anchors).toBe(true);
    expect(seen!.code).toBe(true);
    // And none of the source characters survive into what the reader sees.
    expect(seen!.asterisks).toBe(false);
    expect(seen!.brackets).toBe(false);
    expect(seen!.wikibrackets).toBe(false);
  });

  /**
   * The chain and the reference beneath it are both quotations of node text, so
   * the same syntax has to produce the same ELEMENTS in both. What may differ is
   * how those elements are drawn, and one thing that must: a chain carries no
   * media (design D1).
   */
  it('gives a lineage row and a reference row the same elements for the same syntax', async function () {
    await h.openNote(ORGANIC);
    await ensureOutlineMode(ORGANIC);
    await scrollToEnd();

    const shape = await browser.waitUntil(
      async () =>
        browser.executeObsidian(() => {
          const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
          if (!root) return null;
          const tags = (sel: string): string[] => {
            const out = new Set<string>();
            root.querySelectorAll(sel).forEach((el) => {
              el.querySelectorAll('strong, em, code, a, mark, del, img').forEach((n) =>
                out.add(n.tagName.toLowerCase()),
              );
            });
            return [...out].sort();
          };
          const lineage = tags('.to-backlinks-row.is-lineage .to-backlinks-content');
          const reference = tags('.to-backlinks-row.is-reference .to-backlinks-content');
          if (lineage.length === 0 || reference.length === 0) return null;
          return { lineage, reference };
        }),
      { timeout: 12000, timeoutMsg: 'no rows to compare' },
    );

    // The syntaxes the organic fixture places in BOTH roles, deliberately, so
    // this compares the two renderers rather than whichever elements the vault
    // happens to contain. Comparing the two UNIONS would do the latter: it
    // fails the moment an ancestor carries a highlight no leaf happens to.
    for (const tag of ['strong', 'code', 'a']) {
      expect(shape!.lineage).toContain(tag);
      expect(shape!.reference).toContain(tag);
    }
    // The one asymmetry, stated as itself: a chain is not a weaker renderer,
    // only a quieter one, and media is the single thing it does not inherit.
    expect(shape!.lineage).not.toContain('img');
  });

  /**
   * An embed in a chain becomes its alt text; an embed in a reference row stays
   * and is bounded instead. Height as a RELATIONSHIP — a row is about as tall as
   * a line of its own text — never as a pixel count.
   */
  it('keeps media out of a chain and bounded in a reference row', async function () {
    await h.openNote(ORGANIC);
    await ensureOutlineMode(ORGANIC);
    await scrollToEnd();

    const measured = await browser.waitUntil(
      async () =>
        browser.executeObsidian(() => {
          const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
          if (!root) return null;
          const rows = Array.from(root.querySelectorAll('.to-backlinks-row')) as HTMLElement[];
          if (rows.length === 0) return null;
          const heights = rows.map((r) => r.getBoundingClientRect().height);
          const line = parseFloat(getComputedStyle(rows[0]!).lineHeight || '0');
          return {
            chainImages: root.querySelectorAll('.to-backlinks-row.is-lineage img').length,
            tallest: Math.max(...heights),
            line,
          };
        }),
      { timeout: 12000, timeoutMsg: 'no rows measured' },
    );

    expect(measured!.chainImages).toBe(0);
    // Generous: a row may wrap to a few lines. What this rules out is an image
    // at natural size, which was multiples of this.
    expect(measured!.tallest).toBeLessThan(measured!.line * 8);
  });
});
