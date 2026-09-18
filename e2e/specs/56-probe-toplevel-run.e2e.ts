/**
 * PROBE, not a spec: which lines carry which decoration classes, for the
 * question of whether the kind classes cover every line whose run the layer
 * sizes today (issue #140).
 *
 * Deleted once its figures are recorded in
 * `docs/research/source-indentation-width`.
 */

import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const SPACED = [
  '- alpha',
  '',
  '  child paragraph',
  '  second line',
  '',
  '  ```js',
  '  fenced',
  '      deeper',
  '  ```',
  '',
  '  | a | b |',
  '  | - | - |',
  '  | 1 | 2 |',
  '',
  '  > quote child',
  '',
  '  > [!note] callout',
  '  > body',
  '',
  '- beta',
  '  - nested',
  '    continuation',
  '',
].join('\n');

async function classes(): Promise<Record<string, string[]>> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
    const cm = (view.editor as any).cm;
    const lines = Array.from(cm.contentDOM.querySelectorAll(':scope > .cm-line')) as HTMLElement[];
    const out: Record<string, string[]> = {};
    lines.forEach((el, i) => {
      out[String(i)] = Array.from(el.classList).filter(
        (c) => c.startsWith('to-decor-') && c !== 'to-decor-guides',
      );
    });
    return out;
  });
}

describe('probe: which lines carry a kind class', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  it('lists the classes of every line of the child fixture', async function () {
    await h.createNote('Probe/classes.md', SPACED);
    await h.setOutlineMode(true);
    await h.dismissNotices();
    await h.setCursorSettled(0, 0);
    await browser.pause(300);
    console.log(`\n### PROBE classes\n${JSON.stringify(await classes(), null, 0)}`);
  });

  it('lists them again for the line Shift+Enter opens', async function () {
    await h.createNote('Probe/shift.md', ['- alpha', '', '  first line', ''].join('\n'));
    await h.setOutlineMode(true);
    await h.setCursorSettled(2, '  first line'.length);
    await browser.keys(['Shift', 'Enter']);
    await browser.pause(400);
    await h.setCursorSettled(0, 0);
    await browser.pause(250);
    console.log(`\n### PROBE shift-enter buffer ${JSON.stringify(await h.getBuffer())}`);
    console.log(`\n### PROBE shift-enter classes\n${JSON.stringify(await classes(), null, 0)}`);
  });
});
