/**
 * Captures the screenshots and clip frames the website shows, from the real
 * Obsidian the e2e harness drives — so every picture on the site is the plugin
 * as it renders, not a mock-up that drifts from it.
 *
 * Not a test: nothing here asserts. It is a spec so that it can borrow the e2e
 * harness whole — the vault, the plugin build, the notice recorder, the drift
 * restore — and so a failure names the one capture that broke.
 *
 *   node scripts/e2e-narrow.mjs website/capture/capture.e2e.ts            # desktop
 *   node scripts/e2e-narrow.mjs website/capture/capture.e2e.ts --mobile   # the phone shot
 *
 * `scripts/capture-media.mjs` runs both and encodes the output. Frames land
 * under `website/capture/out/`: one PNG per still in `shots/`, one directory
 * of numbered frames plus a `frames.json` of dwell times per clip.
 *
 * Every still and every clip is taken twice, light and dark, from the same
 * arrangement: a theme switch repaints without touching editor state, so a
 * still is arranged once and shot twice, while a clip's keystrokes mutate the
 * note and are replayed on a fresh copy for each theme.
 */

import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as h from '../../e2e/helpers.js';

const OUT = path.join(process.cwd(), 'website', 'capture', 'out');
const SHOTS = path.join(OUT, 'shots');
const DOM = path.join(OUT, 'dom');

const THEMES = [
  { suffix: 'light', dark: false },
  { suffix: 'dark', dark: true },
] as const;

/** Dwell times, in ms, the encoder gives a frame before the next one. */
const HOLD = 1600;
const STEP = 900;
const TAP = 450;

/** The demo note every clip starts from — the guide's own example, minus the
 * front matter so the properties panel does not take the top of the frame. */
const KITCHEN = [
  '# Kitchen Renovation',
  '',
  'The 2026 project. Sarah leads design, I lead logistics, [[Tomás Rivera|Tomás]] leads kibitzing.',
  '',
  '## Plan',
  '',
  '1. demolition weekend (booked: August 1–2)',
  '2. electrics and plumbing rough-in',
  '3. floor patch, then tile',
  '4. cabinets',
  '5. counters last, measured after cabinets are in',
  '',
  '## Materials',
  '',
  '- tile: reclaimed terracotta, 1962 ✅',
  '- paint: "cloud" (which is also "oat milk")',
  '- handles: undecided',
  '\t- brass ages well but shows prints',
  '\t- steel matches the range',
  '',
  '> The best kitchens look inevitable, not designed.',
  '> — the reclaimed-yard owner, unprompted',
  '',
].join('\n');

const MERGE = [
  '# Merging',
  '',
  'The first paragraph ends here.',
  '',
  'This one starts after a blank line, and Backspace at its first character joins it onto the paragraph above.',
  '',
  '- tile: reclaimed terracotta',
  '- paint: cloud',
  '',
  '- handles: undecided',
  '',
].join('\n');

/** Inline markup the two demo notes lack, for the DOM dump alone. */
const INLINE = [
  '# Inline',
  '',
  'The caret rests here.',
  '',
  '## A heading with the caret elsewhere',
  '',
  'Some **bold** and *italic* text, a [[Kitchen Renovation]] link, an [[Kitchen Renovation|alias]], `code`, and a #tag.',
  '',
  '- [ ] an open task with **bold** in it',
  '- [x] a done task',
  '',
  '> a quote line',
  '',
].join('\n');

/** A scratch copy per clip, named so the zoom trail and the header read like
 * the real note; untracked, so the vault drift restore removes it. */
const CLIP_NOTE = 'Capture/Kitchen Renovation.md';

// ---- Framing ---------------------------------------------------------------

/**
 * Everything around the editor that is not the plugin: the ribbon, the status
 * bar, the tab strip and the view header go, as does the properties panel that
 * would otherwise take the top third of a frame. The caret stops blinking so no
 * frame catches it off; the notice a frame could catch is Obsidian's own
 * indexing toast, dismissed before each shot instead.
 */
const CHROME_CSS = `
  .workspace-ribbon, .status-bar, .workspace-tab-header-container,
  .metadata-container, .inline-title { display: none !important; }
  ${h.IS_MOBILE_RUN ? '' : '.view-header { display: none !important; }'}
  .cm-cursorLayer { animation: none !important; }
  .tooltip { display: none !important; }
`;

const WINDOW = { width: 1280, height: 800 };

/**
 * Sized from inside the app: the harness pins the earliest installer, whose
 * chromedriver predates the `window/rect` endpoint `setWindowSize` needs, while
 * Obsidian's renderer carries Electron's `remote` for exactly this. Without it,
 * the viewport is boxed by CSS instead so the frame is still the same size.
 */
async function frameWindow(): Promise<void> {
  if (!h.IS_MOBILE_RUN) {
    const size = await browser.execute((w: number, ht: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electron = (window as any).electron ?? (window as any).require?.('electron');
      const win = electron?.remote?.getCurrentWindow?.();
      if (!win) return null;
      win.setSize(w, ht);
      return win.getSize() as [number, number];
    }, WINDOW.width, WINDOW.height);
    if (size) {
      console.log(`[capture] window ${size[0]}x${size[1]}`);
    } else {
      console.log('[capture] no electron remote; boxing the viewport with CSS');
      await h.applyStyleOverride(
        'capture-box',
        `body { width: ${WINDOW.width}px !important; height: ${WINDOW.height}px !important; overflow: hidden; }`,
      );
    }
  }
  await browser.executeObsidian(({ app }) => {
    app.workspace.leftSplit?.collapse();
    app.workspace.rightSplit?.collapse();
  });
  await browser.pause(300);
  await h.applyStyleOverride('capture-chrome', CHROME_CSS);
}

async function settle(ms = 120): Promise<void> {
  await h.dismissNotices();
  // The window opens under wherever the machine's pointer happens to be, and
  // a link under it grows a tooltip that would sit in every frame.
  if (!h.IS_MOBILE_RUN) await mouse().move({ x: WINDOW.width - 4, y: WINDOW.height - 4 }).perform(true);
  await browser.pause(ms);
}

async function useTheme(t: (typeof THEMES)[number]): Promise<void> {
  await h.setTheme(t.dark);
  await browser.pause(150);
}

/** Arrange once, shoot in both themes. */
async function shot(name: string, arrange: () => Promise<void>): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await arrange();
  for (const t of THEMES) {
    await useTheme(t);
    await settle();
    await browser.saveScreenshot(path.join(SHOTS, `${name}-${t.suffix}.png`));
  }
  await useTheme(THEMES[0]);
}

/** One clip's frames and their dwell times, written as `frames.json`. */
class Clip {
  private readonly frames: { file: string; dwellMs: number }[] = [];

  constructor(private readonly dir: string) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  async frame(dwellMs: number): Promise<void> {
    await settle();
    const file = `frame-${String(this.frames.length + 1).padStart(4, '0')}.png`;
    await browser.saveScreenshot(path.join(this.dir, file));
    this.frames.push({ file, dwellMs });
  }

  finish(): void {
    fs.writeFileSync(path.join(this.dir, 'frames.json'), JSON.stringify({ frames: this.frames }, null, 2));
  }
}

/** Replay `play` on a fresh note per theme, so both variants show the same story. */
async function clip(name: string, play: (c: Clip) => Promise<void>): Promise<void> {
  for (const t of THEMES) {
    await useTheme(t);
    const c = new Clip(path.join(OUT, `${name}-${t.suffix}`));
    await play(c);
    c.finish();
  }
  await useTheme(THEMES[0]);
}

// ---- Editor arrangement ------------------------------------------------------

async function openFresh(notePath: string, content: string): Promise<void> {
  await h.createNote(notePath, content);
  await h.setOutlineMode(true);
  await settle(200);
}

/**
 * Opens a fixture note and puts its buffer back to what the vault holds.
 *
 * The harness drives the real desktop app, and on macOS the window takes
 * keyboard focus when it opens — a key pressed on the host between two steps
 * lands in whichever note is open. The buffer is compared with the file and
 * rewritten from it, so a stray character cannot survive into a still.
 */
async function openOutlined(notePath: string): Promise<void> {
  await h.openNote(notePath);
  const expected = fs.readFileSync(path.join(process.cwd(), 'test-vault', notePath), 'utf-8');
  if ((await h.getBuffer()) !== expected) {
    console.log(`[capture] ${notePath} had drifted; restoring its buffer`);
    await h.setBuffer(expected);
  }
  await h.setOutlineMode(true);
  await settle(200);
}

async function deleteNote(notePath: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, p) => {
    const file = app.vault.getAbstractFileByPath(p);
    if (file) await app.vault.delete(file);
  }, notePath);
}

/** The 0-based line holding `needle`, read from the live buffer so an edit
 * earlier in the clip cannot leave a hard-coded number pointing elsewhere. */
async function lineOf(needle: string): Promise<number> {
  const lines = (await h.getBuffer()).split('\n');
  const i = lines.findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`no line contains ${JSON.stringify(needle)}`);
  return i;
}

/** Caret inside the line holding `needle`, `offset` characters into the text
 * after the needle's start. */
async function caretIn(needle: string, offset = 0): Promise<void> {
  const line = await lineOf(needle);
  const text = (await h.getBuffer()).split('\n')[line]!;
  await h.setCursorSettled(line, text.indexOf(needle) + offset);
}

async function scrollToEnd(): Promise<void> {
  await browser.executeObsidian(() => {
    const scroller = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await browser.pause(500);
}

/**
 * A real pointer press on a rendered mark, the way spec 80 does it: the
 * elements are looked up inside the app and the events dispatched at the
 * mark's own centre, so the press reaches whatever a user's click would.
 */
async function clickMark(selector: string, index = 0): Promise<void> {
  const all = `.cm-content ${selector}`;
  await browser.waitUntil(
    async () =>
      (await browser.executeObsidian(
        ({ app, obsidian }, all) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
          if (!view) return 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cm = (view.editor as any).cm;
          return (cm.dom as HTMLElement).querySelectorAll(all).length as number;
        },
        all,
      )) > index,
    { timeout: 5000, interval: 100, timeoutMsg: `no ${all}[${index}] rendered` },
  );
  await browser.executeObsidian(
    ({ app, obsidian }, all, index) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const mark = (cm.dom as HTMLElement).querySelectorAll(all)[index] as HTMLElement | undefined;
      if (!mark) throw new Error(`no element ${all}[${index}]`);
      const r = mark.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const target = mark.ownerDocument.elementFromPoint(x, y) as HTMLElement | null;
      if (!target) throw new Error('nothing at the mark');
      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
      };
      target.dispatchEvent(new PointerEvent('pointerdown', opts));
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      target.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
    },
    all,
    index,
  );
  await browser.pause(250);
}

/** Where a document position sits on screen, as the pointer needs it. */
async function pointAt(needle: string, offset: number): Promise<{ x: number; y: number }> {
  const line = await lineOf(needle);
  const text = (await h.getBuffer()).split('\n')[line]!;
  const c = await h.posToCoords(line, text.indexOf(needle) + offset);
  return { x: Math.round(c.left), y: Math.round((c.top + c.bottom) / 2) };
}

/** One named input source, so a press in one chain is still held in the
 * next: wdio numbers each unnamed chain afresh, and a move on a new source
 * carries no button. */
const mouse = () => browser.action('pointer', { id: 'capture-mouse', parameters: { pointerType: 'mouse' } });

function dumpDom(name: string): Promise<void> {
  return browser
    .executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((view.editor as any).cm.contentDOM as HTMLElement).innerHTML as string;
    })
    .then((html) => {
      fs.mkdirSync(DOM, { recursive: true });
      fs.writeFileSync(path.join(DOM, `${name}.html`), html);
    });
}

// ---- The captures -----------------------------------------------------------

describe('website captures', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await frameWindow();
  });

  after(async function () {
    await h.setTheme(false);
    await h.applyStyleOverride('capture-chrome', null);
  });

  afterEach(async function () {
    await h.runCommand('zoom-clear');
    await h.dismissNotices();
  });

  const desktop = (name: string, body: () => Promise<void>) =>
    it(name, async function () {
      if (h.IS_MOBILE_RUN) this.skip();
      await body();
    });

  desktop('dom: Live Preview markup of the two demo notes', async () => {
    await openOutlined('Notes/List decoration demo.md');
    await caretIn('A paragraph under the heading');
    await settle(300);
    await dumpDom('list-decoration-demo');
    await openOutlined('Projects/Kitchen Renovation.md');
    await caretIn('Sarah leads design');
    await settle(300);
    await dumpDom('kitchen-renovation');
    await openFresh('Capture/Inline.md', INLINE);
    await caretIn('caret rests here');
    await settle(300);
    await dumpDom('inline-formatting');
    // Its links would otherwise show up in the Kitchen note's footer.
    await openOutlined('Projects/Kitchen Renovation.md');
    await deleteNote('Capture/Inline.md');
  });

  desktop('shot hero-outline', async () => {
    await shot('hero-outline', async () => {
      await openOutlined('Projects/Kitchen Renovation.md');
      await caretIn('brass ages well', 5);
    });
  });

  desktop('shot hero-stock', async () => {
    await shot('hero-stock', async () => {
      await h.openNote('Projects/Kitchen Renovation.md');
      await h.setOutlineMode(false);
      await settle(200);
      await caretIn('brass ages well', 5);
    });
    await h.setOutlineMode(true);
  });

  desktop('shot guides-markers', async () => {
    await shot('guides-markers', async () => {
      await openOutlined('Notes/List decoration demo.md');
      await caretIn('deeper item', 3);
    });
  });

  desktop('shot block-selection', async () => {
    await shot('block-selection', async () => {
      await openOutlined('Projects/Kitchen Renovation.md');
      await caretIn('handles: undecided', 3);
      await browser.keys([Key.Shift, Key.ArrowDown]);
      await browser.pause(150);
      await browser.keys([Key.Shift, Key.ArrowDown]);
      await browser.pause(150);
    });
  });

  desktop('shot zoom', async () => {
    await shot('zoom', async () => {
      await openOutlined('Projects/Kitchen Renovation.md');
      await caretIn('## Materials', 3);
      await h.runCommand('zoom-in');
      await browser.pause(300);
      await caretIn('brass ages well', 5);
    });
  });

  desktop('shot backlinks-footer', async () => {
    await shot('backlinks-footer', async () => {
      // Two referrers, chosen for that: one row per node kind, and one
      // reference carrying a real subtree, on a single screen.
      await h.waitForBacklinkIndexReady('Backlinks/Reference target.md', 2);
      await openOutlined('Backlinks/Reference target.md');
      // The footer is taller than the frame, so the end of the document is
      // mostly the scroller's bottom padding; its header at the top of the
      // frame shows the totals, the controls and the first groups instead.
      await scrollToEnd();
      await browser.executeObsidian(() => {
        document.querySelector('.workspace-leaf.mod-active .to-backlinks')?.scrollIntoView(true);
        const scroller = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
        if (scroller) scroller.scrollTop -= 48;
      });
      await browser.pause(400);
    });
  });

  desktop('shot settings', async () => {
    await shot('settings', async () => {
      await openOutlined('Projects/Kitchen Renovation.md');
      // Obsidian 1.13 can open its settings in a popout window, which a
      // screenshot of the main window never shows; the in-window modal is
      // asked for explicitly.
      await browser.executeObsidian(({ app }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const setting = (app as any).setting;
        setting.shouldUsePopout = () => false;
        setting.open();
        setting.openTabById('true-outliner');
      });
      await browser.waitUntil(
        () => browser.execute(() => document.querySelector('.modal-container') !== null),
        { timeout: 5000, timeoutMsg: 'the settings modal never opened' },
      );
      await browser.pause(500);
    });
    await browser.executeObsidian(({ app }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as any).setting.close();
    });
  });

  it('shot mobile-outline', async function () {
    if (!h.IS_MOBILE_RUN) this.skip();
    await shot('mobile-outline', async () => {
      await openOutlined('Projects/Kitchen Renovation.md');
      await caretIn('brass ages well', 5);
    });
  });

  desktop('clip indent-outdent', async () => {
    await clip('indent-outdent', async (c) => {
      await openFresh(CLIP_NOTE, KITCHEN);
      await caretIn('steel matches', 5);
      await c.frame(HOLD);
      await h.keys.shiftTab();
      await c.frame(STEP);
      await h.keys.tab();
      await c.frame(STEP);
      await h.keys.tab();
      await c.frame(HOLD);
    });
  });

  desktop('clip enter-split', async () => {
    await clip('enter-split', async (c) => {
      await openFresh(CLIP_NOTE, KITCHEN);
      await caretIn('counters last,', 'counters last,'.length);
      await c.frame(HOLD);
      await h.keys.enter();
      await c.frame(STEP);
      await h.keys.end();
      await c.frame(TAP);
      await h.keys.enter();
      await c.frame(STEP);
      for (const word of ['celebrate', ' with', ' pizza']) {
        await h.keys.type(word);
        await c.frame(TAP);
      }
      await c.frame(HOLD);
    });
  });

  desktop('clip select-nodes', async () => {
    await clip('select-nodes', async (c) => {
      await openFresh(CLIP_NOTE, KITCHEN);
      await caretIn('handles: undecided', 3);
      await c.frame(HOLD);
      // Two presses reach the section's last node; a third has nothing to add.
      for (let i = 0; i < 2; i++) {
        await browser.keys([Key.Shift, Key.ArrowDown]);
        await c.frame(STEP);
      }
      await caretIn('handles: undecided', 3);
      await c.frame(STEP);
      for (let i = 0; i < 3; i++) {
        await h.pressSelectAll();
        await c.frame(STEP);
      }
      await c.frame(HOLD);
    });
  });

  desktop('clip move-node', async () => {
    await clip('move-node', async (c) => {
      await openFresh(CLIP_NOTE, KITCHEN);
      await caretIn('handles: undecided', 3);
      await c.frame(HOLD);
      await h.keys.moveNodeUp();
      await c.frame(STEP);
      await h.keys.moveNodeUp();
      await c.frame(HOLD);
      await h.keys.moveNodeDown();
      await c.frame(STEP);
      await h.keys.moveNodeDown();
      await c.frame(HOLD);
    });
  });

  desktop('clip zoom-in-out', async () => {
    await clip('zoom-in-out', async (c) => {
      await openFresh(CLIP_NOTE, KITCHEN);
      await caretIn('brass ages well', 5);
      await c.frame(HOLD);
      // Marker icons in document order: the title, the intro paragraph, Plan,
      // Materials — so Materials is the fourth.
      await clickMark('.to-decor-marker-icon', 3);
      await c.frame(HOLD);
      // Bullets in the zoomed view: tile, paint, handles.
      await clickMark('.list-bullet', 2);
      await c.frame(HOLD);
      await h.runCommand('zoom-out');
      await c.frame(STEP);
      await h.runCommand('zoom-clear');
      await c.frame(HOLD);
    });
  });

  desktop('clip merge-backspace', async () => {
    await clip('merge-backspace', async (c) => {
      await openFresh(CLIP_NOTE, MERGE);
      await caretIn('This one starts');
      await c.frame(HOLD);
      await h.keys.backspace();
      await c.frame(HOLD);
      await caretIn('handles: undecided');
      await c.frame(STEP);
      await h.keys.backspace();
      await c.frame(HOLD);
    });
  });

  desktop('clip escalation', async () => {
    await clip('escalation', async (c) => {
      await openFresh(CLIP_NOTE, KITCHEN);
      await caretIn('brass ages well', 5);
      await c.frame(HOLD);
      const from = await pointAt('brass ages well', 5);
      const within = await pointAt('shows prints', 'shows prints'.length);
      const across = await pointAt('steel matches', 5);
      await mouse()
        .move({ ...from, origin: 'viewport' })
        .down({ button: 0 })
        .pause(30)
        .move({ ...within, origin: 'viewport', duration: 80 })
        .perform(true);
      await c.frame(STEP);
      await mouse().move({ ...across, origin: 'viewport', duration: 80 }).perform(true);
      await c.frame(HOLD);
      await mouse().up({ button: 0 }).perform();
      await c.frame(HOLD);
    });
  });

  desktop('clip outline-toggle', async () => {
    await clip('outline-toggle', async (c) => {
      await openFresh(CLIP_NOTE, KITCHEN);
      await caretIn('brass ages well', 5);
      await h.setOutlineMode(false);
      await settle(200);
      await c.frame(HOLD);
      await h.setOutlineMode(true);
      await settle(200);
      await c.frame(HOLD);
      await h.setOutlineMode(false);
      await settle(200);
      await c.frame(HOLD);
      await h.setOutlineMode(true);
      await settle(200);
      await c.frame(HOLD);
    });
  });
});
