/**
 * A first look at the footer rendering against a real vault: does it mount,
 * group, and place references where the model says it should.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const TARGET = 'Projects/Aurora Dashboard.md';

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
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
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
});
