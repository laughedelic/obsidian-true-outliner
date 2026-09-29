/**
 * Smoke for `e2e-tests/cdp.ts`: a spec reaches the page WebDriver is driving over the DevTools
 * protocol, on the desktop run and under mobile emulation.
 *
 * One case, because each step needs the state the one before left. It walks the
 * `e2e-verification` requirement "DevTools-protocol access from a spec".
 */

import { browser, expect } from '@wdio/globals';
import { connectCdp, withCdp, type Cdp } from '../cdp.js';
import * as h from '../helpers.js';

/** The error a promise rejects with; fails the case when it resolves. */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('expected the promise to reject, and it resolved');
}

/** A PNG's pixel size, from its IHDR chunk. */
function pngSize(base64: string): { width: number; height: number } {
  const png = Buffer.from(base64, 'base64');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const VIEWPORT = '[innerWidth, innerHeight, devicePixelRatio]';

describe('devtools protocol', function () {
  it('drives the page WebDriver drives, and fails by name when a command cannot complete', async function () {
    await h.createNote('Scratch/devtools-protocol.md', '- a\n- b');
    await h.setCursor(1, 3);
    const viewport = () => browser.execute(`return ${VIEWPORT}`) as Promise<number[]>;
    const [width, height, ratio] = (await viewport()) as [number, number, number];
    const evaluate = (cdp: Cdp, expression: string) =>
      cdp.send<{ result: { value: unknown } }>('Runtime.evaluate', { expression, returnByValue: true });

    let released: Cdp | undefined;
    await withCdp(async (cdp) => {
      released = cdp;

      // An evaluation reads the page WebDriver reads.
      expect((await evaluate(cdp, VIEWPORT)).result.value).toEqual([width, height, ratio]);

      // A key sent this way reaches the editor:
      //
      //  before    after
      // ┆- a      ┆- a
      // ┆- b┃     ┆- bx┃
      const key = { key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88 };
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: 'x', ...key });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
      await browser.waitUntil(async () => (await h.getBuffer()) === '- a\n- bx', {
        timeout: h.waitBudget(4000),
        timeoutMsg: 'the key sent over the protocol did not reach the editor',
      });
      expect(await h.getCursor()).toEqual({ line: 1, ch: 4 });

      // A screenshot is the viewport's size, phone-sized under emulation.
      const shot = await cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
      expect(pngSize(shot.data)).toEqual({ width: width * ratio, height: height * ratio });

      // A subscribed event reaches the spec.
      const marker = `cdp-smoke-${Date.now()}`;
      let logged = false;
      const off = cdp.on<{ args: { value?: unknown }[] }>('Runtime.consoleAPICalled', (p) => {
        if (p.args.some((a) => a.value === marker)) logged = true;
      });
      await cdp.send('Runtime.enable');
      await browser.execute((m) => console.log(m), marker);
      await browser.waitUntil(async () => logged, {
        timeout: h.waitBudget(4000),
        timeoutMsg: 'the console message never reached the subscriber',
      });
      off();

      // A command past its limit fails by name, and the connection carries on.
      const late = await rejection(cdp.send('Page.captureScreenshot', {}, { timeoutMs: 1 }));
      expect(late.message).toContain('Page.captureScreenshot timed out');
      expect((await evaluate(cdp, '1 + 1')).result.value).toBe(2);
    });

    // A command on a released connection fails by name; WebDriver is unaffected.
    const afterClose = await rejection(released!.send('Runtime.evaluate', { expression: '1' }));
    expect(afterClose.message).toContain('Runtime.evaluate');
    expect(await viewport()).toEqual([width, height, ratio]);

    // The lookup: a prefixed handle still finds the page, and a handle that finds none names
    // itself and the targets that were there.
    const handle = await browser.getWindowHandle();
    await withCdp(async (cdp) => {
      expect((await evaluate(cdp, VIEWPORT)).result.value).toEqual([width, height, ratio]);
    }, { handle: `CDwindow-${handle}` });
    const missing = await rejection(connectCdp({ handle: 'no-such-target' }));
    expect(missing.message).toContain('no-such-target');
    expect(missing.message).toContain(handle);

    // A new connection follows a reload, which changes the address and the handle.
    await browser.reloadObsidian();
    await withCdp(async (cdp) => {
      expect((await evaluate(cdp, VIEWPORT)).result.value).toEqual(await viewport());
    });
  });
});
