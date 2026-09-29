/**
 * The ambient monitors, checked against defects made on purpose.
 *
 * Each row reads a clean state first, then breaks the one thing a monitor reads, and reads again.
 * The reading is taken by calling the monitors' install and read directly, so every case here
 * exempts itself from the hooks' own reading — otherwise the defects made here would land in the
 * run's report as findings.
 *
 * Every rule has a control on the clean side of its threshold as well as a case on the broken
 * side: a monitor that reports everything passes the second half of a pair and fails the first.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as h from '../helpers.js';
import {
  MONITOR_RECORD_DIR,
  afterCase,
  beforeCase,
  exempt,
  install,
  read,
  type CaseRecord,
  type MonitorName,
} from '../monitors.js';

const NOTE = 'Scratch/ambient-monitors.md';
const SHORT = ['# Head', '', '- alpha', '\t- beta bravo', '\t\t- gamma', '- delta', ''].join('\n');
const LONG = [
  '# Long',
  '',
  '- wrapped ' + 'wrap '.repeat(60).trim(),
  ...Array.from({ length: 60 }, (_, i) => `- item ${i}`),
  '',
].join('\n');

async function open(text: string): Promise<void> {
  await h.createNote(NOTE, text);
  await h.setOutlineMode(true);
  await browser.pause(300);
}

/** The rules a monitor reported, from one reading. */
async function rules(monitor: MonitorName, expected: string[] = []): Promise<string[]> {
  const reading = await read(expected);
  if (!reading) throw new Error('the monitors were not installed');
  const result = reading[monitor];
  if (result.skipped !== undefined) throw new Error(`${monitor} was not read: ${result.skipped}`);
  return result.observations.map((o) => o.rule);
}

/** Runs in the page: `body` gets the active `cm`, and the next two frames are waited for. */
function inPage(body: string, ...args: unknown[]): Promise<unknown> {
  return browser.execute(
    (src: string, a: unknown[]) => {
      const cm = (window as any).app.workspace.activeEditor.editor.cm;
      const fn = new Function('cm', 'args', src);
      const result = fn(cm, a);
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(result))),
      );
    },
    body,
    args,
  );
}

/** The line element for a 0-based document line. */
const LINE = `
  const lineEl = (n) => {
    for (const c of cm.contentDOM.children) {
      try { if (cm.state.doc.lineAt(cm.posAtDOM(c)).number - 1 === n) return c; } catch {}
    }
    throw new Error('no element for line ' + n);
  };
  const nudge = (n, px) => { const el = lineEl(n); el.style.position = 'relative'; el.style.left = px + 'px'; };
`;

describe('ambient monitors', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  beforeEach(function () {
    exempt('the case installs and reads the monitors itself');
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  describe('caret', function () {
    it('reads a caret on text as its own line’s, and one on an empty line as readable', async function () {
      await open(SHORT);
      await h.setCursorSettled(2, 4);
      await install();
      expect(await rules('caret')).toEqual([]);
      await h.setCursorSettled(1, 0);
      await install();
      expect(await rules('caret')).toEqual([]);
    });

    it('reports a caret its line clips out of sight', async function () {
      await open(SHORT);
      await h.setCursorSettled(2, 5);
      await install();
      await inPage(`${LINE} const el = lineEl(2); el.style.clipPath = 'inset(0 100% 0 0)';`);
      expect(await rules('caret')).toContain('caret-covered');
    });

    it('reports a caret something else is drawn over', async function () {
      await open(SHORT);
      await h.setCursorSettled(2, 5);
      await install();
      await inPage(`
        const sel = window.getSelection().getRangeAt(0).getClientRects()[0];
        const veil = document.createElement('div');
        veil.id = 'ambient-monitor-veil';
        veil.style.cssText = 'position:fixed;z-index:9999;background:transparent;left:' + (sel.left - 20) + 'px;top:' + (sel.top - 10) + 'px;width:40px;height:' + (sel.height + 20) + 'px';
        document.body.appendChild(veil);
      `);
      expect(await rules('caret')).toContain('caret-covered');
      await inPage(`document.getElementById('ambient-monitor-veil')?.remove();`);
    });

    it('reports a caret the case moved out of the scroller', async function () {
      await open(LONG);
      await h.setCursorSettled(0, 2);
      await install();
      expect(await rules('caret')).toEqual([]);
      // Moved rather than scrolled, so the scroll monitor has nothing to read.
      await inPage(`cm.contentDOM.style.transform = 'translateY(-3000px)';`);
      expect(await rules('caret')).toContain('caret-outside-scroller');
      await inPage(`cm.contentDOM.style.transform = '';`);
    });

    it('does not report a caret that was already out of view when the case began', async function () {
      await open(LONG);
      await h.setCursorSettled(0, 2);
      // Scrolled before the recorders start.
      await inPage(`cm.scrollDOM.scrollTop = cm.scrollDOM.scrollHeight;`);
      await install();
      expect(await rules('caret')).not.toContain('caret-outside-scroller');
    });

    it('leaves a caret the case scrolled away from to the scroll monitor', async function () {
      await open(LONG);
      await h.setCursorSettled(0, 2);
      await install();
      await inPage(`cm.scrollDOM.scrollTop = cm.scrollDOM.scrollHeight;`);
      expect(await rules('caret')).not.toContain('caret-outside-scroller');
    });

    it('does not read a caret in an editor without focus, and says why', async function () {
      await open(SHORT);
      await h.setCursorSettled(2, 4);
      await install();
      await inPage(`document.activeElement.blur();`);
      const reading = await read();
      expect(reading?.caret.skipped).toBe('the editor is not the active element');
      expect(reading?.grid.skipped).toBeUndefined();
    });
  });

  describe('scroll', function () {
    it('reports a position that leaves and returns', async function () {
      await open(LONG);
      await h.setCursorSettled(0, 2);
      await install();
      await inPage(`cm.scrollDOM.scrollTop = 400;`);
      await inPage(`cm.scrollDOM.scrollTop = 0;`);
      expect(await rules('scroll')).toContain('scroll-excursion');
    });

    it('does not report a position that leaves and stays away', async function () {
      await open(LONG);
      await h.setCursorSettled(0, 2);
      await install();
      await inPage(`cm.scrollDOM.scrollTop = 400;`);
      await inPage(`cm.scrollDOM.scrollTop = 380;`);
      expect(await rules('scroll')).toEqual([]);
    });

    it('does not report a small out-and-back', async function () {
      await open(LONG);
      await h.setCursorSettled(0, 2);
      await install();
      await inPage(`cm.scrollDOM.scrollTop = 20;`);
      await inPage(`cm.scrollDOM.scrollTop = 0;`);
      expect(await rules('scroll')).toEqual([]);
    });

    it('reports a large step made while the caret stayed in view', async function () {
      await open(LONG);
      await h.setCursorSettled(20, 3);
      await browser.pause(200);
      // The caret is put three quarters of the way down before the recorders start, so a step of
      // more than half the viewport that keeps it in view has to land it near the top.
      await inPage(`
        const sr = cm.scrollDOM.getBoundingClientRect();
        const y = cm.coordsAtPos(cm.state.selection.main.head).top - sr.top;
        cm.scrollDOM.scrollTop = cm.scrollDOM.scrollTop + (y - sr.height * 0.75);
      `);
      await install();
      await inPage(`
        const sr = cm.scrollDOM.getBoundingClientRect();
        const y = cm.coordsAtPos(cm.state.selection.main.head).top - sr.top;
        cm.scrollDOM.scrollTop = cm.scrollDOM.scrollTop + (y - 30);
      `);
      expect(await rules('scroll')).toContain('scroll-step-with-caret-in-view');
    });

    it('does not report a large step that took the caret out of view', async function () {
      await open(LONG);
      await h.setCursorSettled(0, 2);
      await install();
      await inPage(`cm.scrollDOM.scrollTop = cm.scrollDOM.clientHeight;`);
      expect(await rules('scroll')).not.toContain('scroll-step-with-caret-in-view');
    });
  });

  describe('grid', function () {
    it('reads an untouched note as on the grid', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      expect(await rules('grid')).toEqual([]);
    });

    it('reports a line moved right of its column, and its mark with it', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      await inPage(`${LINE} nudge(3, 9);`);
      const found = await rules('grid');
      expect(found).toContain('grid-off-column');
      expect(found).toContain('grid-marker-off-column');
    });

    it('reports a line moved left of its column', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      await inPage(`${LINE} nudge(3, -9);`);
      expect(await rules('grid')).toContain('grid-left-of-column');
    });

    it('tolerates half a pixel and reports a pixel', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      await inPage(`${LINE} nudge(3, 0.4);`);
      expect(await rules('grid')).toEqual([]);
      await inPage(`${LINE} nudge(3, 1);`);
      expect(await rules('grid')).toContain('grid-off-column');
    });

    it('reports a mark off its column by more than the guide’s half pixel, and not by less', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      const nudge = (px: number) =>
        inPage(`${LINE} const b = lineEl(2).querySelector('.list-bullet'); b.style.position = 'relative'; b.style.left = '${px}px';`);
      await nudge(0.4);
      expect(await rules('grid')).toEqual([]);
      await nudge(0.8);
      expect(await rules('grid')).toContain('grid-marker-off-column');
    });

    it('reads a wrapped line holding inline code as on the grid', async function () {
      const text = '- the flag is `--severity` ' + 'and then some more words '.repeat(12) + '`--other` ' + 'tail words '.repeat(10);
      await open(['# Head', '', text, `\t- nested ${text}`, ''].join('\n'));
      await h.setCursorSettled(0, 1);
      await install();
      expect(await rules('grid')).toEqual([]);
    });

    it('reports wrapped rows that do not start where their first row does', async function () {
      await open(LONG);
      await h.setCursorSettled(0, 1);
      await install();
      await inPage(`${LINE} lineEl(2).style.setProperty('text-indent', '13px', 'important');`);
      expect(await rules('grid')).toContain('grid-wrap-hang');
    });
  });

  describe('height map', function () {
    it('reads a rendered note as coherent', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      expect(await rules('heightMap')).toEqual([]);
    });

    it('reports a line drawn one row away as another line', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      await inPage(`${LINE} const el = lineEl(3); el.style.position = 'relative'; el.style.top = '30px';`);
      expect(await rules('heightMap')).toContain('heightmap-wrong-line');
    });

    it('reports a line drawn far from where the editor believes it is as having no position', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      await inPage(`${LINE} const el = lineEl(3); el.style.position = 'relative'; el.style.top = '90px';`);
      expect(await rules('heightMap')).toContain('heightmap-no-position');
    });
  });

  describe('layout shift', function () {
    it('reports an untouched line that moves sideways', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      await browser.keys(['x']);
      await inPage(`${LINE} nudge(5, 11);`);
      expect(await rules('layoutShift')).toContain('shift-sideways');
    });

    it('does not read a case that edited no document', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await install();
      await inPage(`${LINE} nudge(5, 11);`);
      const reading = await read();
      expect(reading?.layoutShift.skipped).toBe('the case edited no document');
    });

    it('does not report a line the edit touched', async function () {
      await open(SHORT);
      await h.setCursorSettled(3, 3);
      await install();
      await browser.keys(['x']);
      await inPage(`${LINE} nudge(3, 11);`);
      expect(await rules('layoutShift')).toEqual([]);
    });

    it('reports a line above the edit that moves, and not a line below it that moves down', async function () {
      await open(SHORT);
      await h.setCursorSettled(4, 3);
      await install();
      await browser.keys(['x']);
      await inPage(`${LINE} const e = lineEl(5); e.style.position = 'relative'; e.style.top = '30px';`);
      expect(await rules('layoutShift')).toEqual([]);
      await inPage(`${LINE} const e = lineEl(2); e.style.position = 'relative'; e.style.top = '30px';`);
      expect(await rules('layoutShift')).toContain('shift-above-edit');
    });
  });

  describe('errors', function () {
    it('reports an uncaught error, a rejection and a console error', async function () {
      await open(SHORT);
      await install();
      // From a script the page itself runs: an error thrown from the driver's own script is
      // reported by the browser as an opaque "Script error." and its rejections are swallowed.
      await inPage(`
        const s = document.createElement('script');
        s.textContent = "setTimeout(() => { throw new Error('ambient-boom'); }); setTimeout(() => { Promise.reject(new Error('ambient-rejected')); }); console.error('ambient-logged');";
        document.head.appendChild(s);
        s.remove();
      `);
      await browser.pause(200);
      const found = (await read())?.errors.observations ?? [];
      expect(found.map((o) => o.rule)).toContain('console-error');
      const details = found.map((o) => o.detail).join('\n');
      expect(details).toContain('ambient-boom');
      expect(details).toContain('ambient-rejected');
      expect(details).toContain('ambient-logged');
    });

    it('reports nothing for a clean case', async function () {
      await open(SHORT);
      await install();
      await inPage(`console.log('ambient-quiet');`);
      expect(await rules('errors')).toEqual([]);
    });
  });

  describe('notices', function () {
    const raise = (text: string) =>
      browser.executeObsidian(({ obsidian }, t) => void new obsidian.Notice(t, 4000), text);

    it('reports a notice nobody expected, and not one the case waited for', async function () {
      await open(SHORT);
      await install();
      await raise('ambient unexpected notice');
      await browser.pause(150);
      expect(await rules('notices')).toEqual(['unexpected-notice']);
      await install();
      await raise('ambient awaited notice');
      await browser.pause(150);
      expect(await rules('notices', ['ambient awaited'])).toEqual([]);
    });
  });

  describe('hooks and exemptions', function () {
    async function records(): Promise<CaseRecord[]> {
      const file = path.join(MONITOR_RECORD_DIR, `${process.env.WDIO_WORKER_ID ?? 'launcher'}.jsonl`);
      const text = await fsp.readFile(file, 'utf-8').catch(() => '');
      return text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as CaseRecord);
    }

    it('does not read a case that did not pass', async function () {
      await open(SHORT);
      const before = (await records()).length;
      await beforeCase({ title: 'a made-up case', parent: 'made up' });
      await afterCase({ title: 'a made-up case', parent: 'made up' }, false);
      const after = await records();
      expect(after.length).toBe(before + 1);
      const last = after[after.length - 1]!;
      expect(last.test).toBe('a made-up case');
      expect(Object.values(last.skipped)).toEqual(Array(7).fill('the case failed, timed out or was skipped'));
      expect(last.observations).toEqual([]);
    });

    it('ignores a late hook for a case that is no longer the running one', async function () {
      await open(SHORT);
      await beforeCase({ title: 'the running case', parent: 'made up' });
      const before = (await records()).length;
      await afterCase({ title: 'an earlier case that timed out', parent: 'made up' }, true);
      expect((await records()).length).toBe(before);
      await afterCase({ title: 'the running case', parent: 'made up' }, true);
    });

    it('takes an exemption per monitor, with its reason, and reads the others', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      await beforeCase({ title: 'an exempt case', parent: 'made up' });
      exempt('its note is set out of the grid on purpose', 'grid');
      await inPage(`${LINE} nudge(3, 9);`);
      await afterCase({ title: 'an exempt case', parent: 'made up' }, true);
      const last = (await records()).at(-1)!;
      expect(last.skipped.grid).toBe('exempt: its note is set out of the grid on purpose');
      expect(last.checked).toContain('heightMap');
      expect(last.observations.filter((o) => o.monitor === 'grid')).toEqual([]);
    });

    it('takes an exemption made before the body starts', async function () {
      await open(SHORT);
      await h.setCursorSettled(0, 1);
      // With no case running, an exemption is held for the next one, as from a `beforeEach`.
      await beforeCase({ title: 'the case before', parent: 'made up' });
      await afterCase({ title: 'the case before', parent: 'made up' }, true);
      exempt('set from a beforeEach', 'scroll');
      await beforeCase({ title: 'a case with an earlier exemption', parent: 'made up' });
      await afterCase({ title: 'a case with an earlier exemption', parent: 'made up' }, true);
      const last = (await records()).at(-1)!;
      expect(last.skipped.scroll).toBe('exempt: set from a beforeEach');
    });

    it('refuses an exemption with no reason', async function () {
      expect(() => exempt('   ')).toThrow(/reason/);
    });
  });
});
