/** THROWAWAY: screenshots of the search-palette prototype shells. Not a test. */
import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as path from 'node:path';
import * as h from '../helpers.js';

const SHOTS = path.join(process.cwd(), '.obsidian-cache', 'search-prototype-shots');

async function openPalette(cmd: string, query: string): Promise<void> {
  await h.runCommand(cmd);
  await browser.pause(300);
  await browser.keys([...query]);
  await browser.pause(900);
}

async function dismiss(): Promise<void> {
  await browser.keys(Key.Escape);
  await browser.pause(300);
}

async function domOf(selector: string): Promise<string> {
  return browser.execute((sel: string) => {
    const el = document.querySelector(sel);
    return el ? el.outerHTML.slice(0, 4000) : '(none)';
  }, selector);
}

describe('search palette prototype capture', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.setTheme(true);
    await h.openNote('Projects/Aurora Dashboard.md');
    await h.setOutlineMode(true);
    await browser.pause(500);
  });

  it('captures the SuggestModal shell', async function () {
    await openPalette('prototype-search-suggest', 'layout');
    await browser.keys(Key.ArrowDown);
    await browser.pause(200);
    await h.screenshotFull(SHOTS, 'suggest-layout-down1');
    await dismiss();

    await openPalette('prototype-search-suggest-restyled', 'layout');
    await browser.keys(Key.ArrowDown);
    await browser.pause(200);
    await h.screenshotFull(SHOTS, 'suggest-restyled-layout-down1');
    await dismiss();
  });

  it('captures the custom Modal shell', async function () {
    await openPalette('prototype-search-custom', 'layout');
    await browser.keys(Key.ArrowDown);
    await browser.pause(200);
    await h.screenshotFull(SHOTS, 'custom-layout-down1');
    await browser.keys(Key.Tab);
    await browser.pause(600);
    await h.screenshotFull(SHOTS, 'custom-layout-this-note');
    await browser.keys(Key.Enter);
    await browser.pause(800);
    await h.screenshotFull(SHOTS, 'custom-layout-opened-zoomed');
  });
});
