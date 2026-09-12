/**
 * What the decoration layer puts in the DOM, pinned.
 *
 * Every other decoration spec asserts a relationship — this one records the
 * whole plugin-owned contract on every rendered line and compares it to a
 * recorded baseline: every `to-*` class, every `--to-*` inline custom property,
 * every `data-*` attribute, and the plugin's own elements inside the line.
 * Collected by prefix, not by a list, so a property a later change writes is
 * in the comparison without anyone remembering to add it.
 *
 * It exists for `decoration-line-inputs`, a refactor of how the two consumers
 * of this layer assemble a line's chrome, whose acceptance test is that
 * nothing here moves. Run with `UPDATE_BASELINES=1` to rewrite the files after
 * an INTENDED change to what is rendered.
 *
 * What the layer DECIDES, not what it MEASURES. Three things on a line are
 * read from the rendered DOM rather than derived from the document — the
 * chevron alignment (`--to-chevron-dx`/`-dy`) and the trail's accent stop
 * (`--to-accent-stop`), both a font's business and different on CI's font
 * from macOS's, and the widget pass's own marker on the footer's element,
 * which mounts on its own schedule — and all three are left out, so the
 * baseline holds on every platform and every frame. A widget line's own
 * border and padding, which its shift expression carries, are the theme's and
 * the same wherever the suite runs.
 */

/** The inline properties the layer measures rather than decides. */
const MEASURED = /^--to-(chevron-|accent-stop)/;

import * as fs from 'node:fs';
import * as path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { ALL_DECORATION_FIXTURES, createFixture, type DecorationFixture } from '../fixtures/decorations.js';

const BASELINES = path.join(process.cwd(), 'e2e', 'baselines', 'decorations');

/**
 * The fixtures whose rendering the indicator settings change, and the line the
 * caret sits on for them: a PLAIN line, as deep as the fixture has one. The
 * caret on a widget-rendered line makes Obsidian reveal its source beside the
 * widget, on its own schedule, which is a second rendering this baseline must
 * not depend on the timing of — so the atoms fixture keeps the caret on its
 * heading, and the embed fixture on the plain last line of the node an embed
 * runs through.
 */
const VARIED: Readonly<Record<string, number>> = {
  mixed: 5,
  'heading-then-list': 4,
  'widget-atoms': 0,
  embed: 8,
};
const MARKER_STATES = ['off', 'current', 'lineage'] as const;
const GUIDE_STATES = ['off', 'full', 'lineage'] as const;

/**
 * One line of text per element rendering a document line, in DOM order: the
 * document line it renders, the element, and everything of ours on it.
 */
function snapshot(): Promise<string> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const rows: string[] = [];
    for (const el of Array.from(cm.contentDOM.children) as HTMLElement[]) {
      if (el.classList.contains('cm-gap') || el.classList.contains('to-decor-own-chrome')) continue;
      let line = '?';
      try {
        line = String(cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1);
      } catch {
        // An element the state cannot place — recorded as such.
      }
      const classes = Array.from(el.classList).filter((c) => c.startsWith('to-')).sort();
      const props: string[] = [];
      for (let i = 0; i < el.style.length; i++) {
        const name = el.style[i]!;
        if (name.startsWith('--to-') && !MEASURED.test(name)) {
          props.push(`${name}=${el.style.getPropertyValue(name).trim()}`);
        }
      }
      props.sort();
      const data = Object.keys(el.dataset)
        .sort()
        .map((k) => `${k}=${el.dataset[k]}`);
      const own = Array.from(el.querySelectorAll<HTMLElement>('[class*="to-decor"]')).map(
        (child) =>
          `${child.tagName.toLowerCase()}.${Array.from(child.classList).sort().join('.')}` +
          (child.textContent?.trim() ? `(${child.textContent.trim()})` : ''),
      );
      rows.push(
        `L${line} ${el.tagName.toLowerCase()}${el.classList.contains('cm-line') ? '.cm-line' : ''}` +
          ` classes=[${classes.join(' ')}] style={${props.join(' ')}} data={${data.join(' ')}} own=[${own.join(' ')}]`,
      );
    }
    return `${rows.join('\n')}\n`;
  });
}

async function check(name: string): Promise<void> {
  const actual = await snapshot();
  const file = path.join(BASELINES, `${name}${h.IS_MOBILE_RUN ? '.mobile' : ''}.txt`);
  if (process.env.UPDATE_BASELINES) {
    fs.mkdirSync(BASELINES, { recursive: true });
    fs.writeFileSync(file, actual, 'utf8');
    return;
  }
  expect(fs.existsSync(file)).toBe(true);
  expect(actual).toBe(fs.readFileSync(file, 'utf8'));
}

async function open(fixture: DecorationFixture, caretLine: number): Promise<void> {
  await createFixture(fixture, h.createNote);
  await h.setOutlineMode(true);
  await h.setCursorSettled(caretLine, 0);
  await browser.pause(300 + (fixture.settleMs ?? 0));
}

async function indicators(markers: string, guides: string): Promise<void> {
  await h.setPluginSetting('markerHighlight', markers);
  await h.setPluginSetting('guideHighlight', guides);
}

describe('outline decorations: the DOM baseline', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('every fixture, at the defaults, with the caret on its first line', async function () {
    this.timeout(120_000);
    for (const fixture of ALL_DECORATION_FIXTURES) {
      await open(fixture, 0);
      await check(fixture.label);
    }
  });

  // One case per fixture: nine renders each, which is what fits inside a
  // case's budget, and a failure names the fixture.
  for (const [label, caret] of Object.entries(VARIED)) {
    it(`${label}, under every indicator setting, with the caret on line ${caret}`, async function () {
      this.timeout(120_000);
      const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === label)!;
      for (const markers of MARKER_STATES) {
        for (const guides of GUIDE_STATES) {
          await indicators(markers, guides);
          await open(fixture, caret);
          await check(`${label}--markers-${markers}--guides-${guides}`);
        }
      }
      await indicators('current', 'full');
    });
  }

  it('a folded heading, with the caret on it', async function () {
    this.timeout(60_000);
    await indicators('current', 'full');
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'heading-then-list')!;
    await open(fixture, 0);
    await h.runCommand('fold-node');
    // Re-placed after the fold: the accent follows the caret, and a fold is a
    // transaction the caret's own placement may answer to.
    await h.setCursorSettled(0, 0);
    await browser.pause(300);
    await check('heading-then-list--folded');
    await h.clearFolds();
  });
});
