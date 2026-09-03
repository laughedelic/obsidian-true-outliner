/**
 * The footer's settings, in both places the settings tab declares them.
 *
 * `TrueOutlinerSettingTab` declares every setting twice — `getSettingDefinitions()`
 * for Obsidian 1.13+, and `display()` as the documented fallback for older
 * builds. Obsidian calls exactly one of them, so a setting added to one and not
 * the other is invisible on half the supported range and nothing else notices.
 * This spec calls both.
 *
 * Searchability is asserted through the definitions rather than by driving the
 * settings search box: a declaration with a name and a description is what makes
 * Obsidian's search find it, and scraping the search UI's own DOM would fail on
 * an Obsidian release for reasons that have nothing to do with this plugin.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

/** Every footer setting the settings tab is meant to offer, with its key. */
const FOOTER_SETTINGS = [
  { key: 'backlinksFooter', control: 'toggle' },
  { key: 'backlinksOverallCap', control: 'dropdown' },
  { key: 'backlinksGroupHeight', control: 'dropdown' },
  { key: 'backlinksSuppressCore', control: 'toggle' },
  { key: 'backlinksSegmentIcons', control: 'dropdown' },
  { key: 'backlinksSeparator', control: 'dropdown' },
  { key: 'backlinksGuides', control: 'toggle' },
] as const;

/** A value each key can be set to that differs from its default. */
const CHANGED: Record<string, string | boolean> = {
  backlinksFooter: false,
  backlinksOverallCap: '100',
  backlinksGroupHeight: 'compact',
  backlinksSuppressCore: false,
  backlinksSegmentIcons: 'none',
  backlinksSeparator: 'chevron',
  backlinksGuides: true,
};

interface Declared {
  key: string;
  name: string;
  desc: string;
  type: string;
}

/** What `getSettingDefinitions()` offers — the 1.13+ path. */
function declaredSettings(): Promise<Declared[]> {
  return browser.executeObsidian(({ app }) => {
    const tab = (app as any).setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
    return tab.getSettingDefinitions().map((d: any) => ({
      key: d.control?.key ?? '',
      name: d.name ?? '',
      desc: d.desc ?? '',
      type: d.control?.type ?? '',
    }));
  });
}

/** The setting NAMES `display()` renders — the pre-1.13 fallback path. */
function fallbackSettingNames(): Promise<string[]> {
  return browser.executeObsidian(({ app }) => {
    const tab = (app as any).setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
    // `display()` empties its own container first, so calling it here is the
    // same operation Obsidian performs on an older build.
    tab.display();
    const names = Array.from(
      tab.containerEl.querySelectorAll('.setting-item-name') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent ?? '');
    tab.containerEl.empty();
    return names;
  });
}

describe('the footer settings', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  it('declares every footer setting for Obsidian 1.13+', async function () {
    const keys = (await declaredSettings()).map((d) => d.key);
    for (const { key } of FOOTER_SETTINGS) expect(keys).toContain(key);
  });

  it('gives each declaration the name and description that make it searchable', async function () {
    const declared = await declaredSettings();
    for (const { key } of FOOTER_SETTINGS) {
      const found = declared.find((d) => d.key === key);
      expect(found).toBeDefined();
      expect(found?.name.length).toBeGreaterThan(0);
      expect(found?.desc.length).toBeGreaterThan(0);
    }
  });

  it('uses the control kind each setting is meant to have', async function () {
    const declared = await declaredSettings();
    for (const { key, control } of FOOTER_SETTINGS) {
      expect(declared.find((d) => d.key === key)?.type).toBe(control);
    }
  });

  it('renders the same settings through the pre-1.13 fallback', async function () {
    const declared = await declaredSettings();
    const rendered = await fallbackSettingNames();
    // Compared by NAME because that is all the fallback path exposes, and it is
    // what a reader on an older build would look for.
    for (const { key } of FOOTER_SETTINGS) {
      const name = declared.find((d) => d.key === key)?.name ?? `«${key} undeclared»`;
      expect(rendered).toContain(name);
    }
  });

  it('writes every setting through to plugin data, and reads it back', async function () {
    for (const { key } of FOOTER_SETTINGS) {
      const value = CHANGED[key];
      await browser.executeObsidian(
        async ({ app }, settingKey: string, next: unknown) => {
          const tab = (app as any).setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
          await tab.setControlValue(settingKey, next);
        },
        key,
        value,
      );

      const readBack = await browser.executeObsidian(({ app }, settingKey: string) => {
        const tab = (app as any).setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
        return tab.getControlValue(settingKey);
      }, key);
      expect(readBack).toEqual(value);

      const stored = (await h.readPluginData()) as unknown as Record<string, unknown> | null;
      expect(stored?.[key]).toEqual(value);
    }
  });

  it('survives a reload with every setting still changed', async function () {
    await obsidianPage.disablePlugin(h.PLUGIN_ID);
    await obsidianPage.enablePlugin(h.PLUGIN_ID);
    for (const { key } of FOOTER_SETTINGS) {
      const value = await browser.executeObsidian(({ app }, settingKey: string) => {
        const tab = (app as any).setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
        return tab.getControlValue(settingKey);
      }, key);
      expect(value).toEqual(CHANGED[key]);
    }
  });

  it('falls back to the default when a stored enum is not a known state', async function () {
    await browser.executeObsidian(async ({ plugins }) => {
      const plugin = plugins.trueOutliner as any;
      const data = await plugin.loadData();
      await plugin.saveData({
        ...data,
        backlinksOverallCap: 'a hundred and twelve',
        backlinksSegmentIcons: 42,
      });
    });
    await obsidianPage.disablePlugin(h.PLUGIN_ID);
    await obsidianPage.enablePlugin(h.PLUGIN_ID);

    const values = await browser.executeObsidian(({ app }) => {
      const tab = (app as any).setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
      return {
        cap: tab.getControlValue('backlinksOverallCap'),
        icons: tab.getControlValue('backlinksSegmentIcons'),
      };
    });
    expect(values.cap).toBe('50');
    expect(values.icons).toBe('all');
  });

  after(async function () {
    await h.resetPluginState();
  });
});
