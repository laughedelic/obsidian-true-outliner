/**
 * The dev build's status-bar stamp names the runtime it is loaded in.
 *
 * The expected versions come from the run record the launching process wrote
 * (`.obsidian-cache/e2e-target.json`, from the launcher's own table), and the
 * stamp reads them from the running app. Three sources that have to agree: the
 * table, the process that started, and the plugin's own reading. A run that asks
 * for one installer and starts another fails here, whichever config it was.
 */

import { readFileSync } from 'node:fs';
import { browser, expect } from '@wdio/globals';
import * as h from '../helpers.js';
import { TARGET_RECORD_FILE, type TargetRecord } from '../target-record.mjs';

const record = JSON.parse(readFileSync(TARGET_RECORD_FILE, 'utf-8')) as TargetRecord;

interface Stamp {
  text: string;
  label: string;
}

/** Read from the DOM, not the plugin object: the stamp is the thing a tester's
 * screenshot shows, and the status bar item exists under emulation too. */
function readStamp(): Promise<Stamp | null> {
  return browser.execute(() => {
    const el = document.querySelector('.true-outliner-dev-stamp');
    return el ? { text: el.textContent ?? '', label: el.getAttribute('aria-label') ?? '' } : null;
  });
}

describe('runtime stamp', function () {
  it('names the app version and the full Chromium version of the installer the run resolved', async function () {
    await browser.waitUntil(
      async () => (await readStamp())?.text.includes(`Chromium ${record.chrome}`) === true,
      {
        timeout: h.waitBudget(5000),
        timeoutMsg: `the stamp never named Chromium ${record.chrome}: ${JSON.stringify(await readStamp())}`,
      },
    );
    const stamp = (await readStamp())!;
    expect(stamp.text).toContain(`app ${record.app} · Chromium ${record.chrome}`);
    expect(stamp.label).toContain(`Obsidian ${record.app} on `);
    expect(stamp.label).toContain(`Chromium ${record.chrome}`);
  });

  it('keeps the versions when the keymap readout redraws the stamp', async function () {
    await h.openNote('Notes/Sourdough Log.md');
    await h.resetMotionCounts();
    await h.setCursorSettled(0, 3);
    await h.keys.home();
    await browser.waitUntil(async () => /Home \d+\/\d+/.test((await readStamp())?.text ?? ''), {
      timeout: h.waitBudget(5000),
      timeoutMsg: `Home never reached the stamp: ${JSON.stringify(await readStamp())}`,
    });
    const { text } = (await readStamp())!;
    expect(text).toContain(`app ${record.app} · Chromium ${record.chrome}`);
  });
});
