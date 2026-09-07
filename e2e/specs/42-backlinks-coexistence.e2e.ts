/**
 * Hiding Obsidian's own in-document backlinks where ours renders.
 *
 * `plugin-shell` permits this only as a PRESENTATIONAL suppression: no other
 * plugin's configuration is read or written, the user can turn it off at any
 * time, it reaches only notes this plugin decorates, and it leaves nothing
 * behind when the plugin is disabled.
 *
 * ## What these assert, and why it is the rule's CONDITION rather than a display
 *
 * Obsidian keeps `.embedded-backlinks` mounted and drives its visibility with an
 * inline style, so an unpopulated section already reads `display: none` on its
 * own. Asserting a computed `display` therefore passes whether or not our rule
 * exists — measured, and it is the reason this spec asserts `el.matches(...)`
 * against the rule's own selector instead. That is the thing the plugin
 * controls; the paint is Obsidian's.
 *
 * The core section is switched on here through Obsidian's internal API. That is
 * test code arranging the situation; the plugin itself never touches another
 * plugin's config, which is what the last case asserts.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Projects/Aurora Dashboard.md';
const PLAIN = 'Coexistence/Undecorated.md';

/** The rule in styles.css, verbatim. If the two drift, this spec stops meaning
 * anything — which is why it is written out rather than approximated. */
const RULE = '.cm-sizer:has(.to-backlinks.is-suppressing-core) > .embedded-backlinks';

async function enableCoreInDocument(): Promise<void> {
  await browser.executeObsidian(async ({ app }) => {
    const internal = (app as any).internalPlugins;
    if (!internal.plugins.backlink?.enabled) await internal.enablePlugin('backlink');
    const inst = internal.plugins.backlink?.instance;
    // Mutated in place: the plugin holds its own reference to this object, so
    // assigning a fresh one leaves it reading the old.
    if (inst?.options) inst.options.backlinkInDocument = true;
    inst?.updateBacklinks?.();
  });
}

/** Whether the suppression rule's condition holds for the core section. */
function suppressed(): Promise<{ present: boolean; matches: boolean }> {
  return browser.executeObsidian((_ctx, selector: string) => {
    const el = document.querySelector<HTMLElement>(
      '.workspace-leaf.mod-active .embedded-backlinks',
    );
    return { present: el !== null, matches: el !== null && el.matches(selector) };
  }, RULE);
}

async function openInOutline(notePath: string): Promise<void> {
  await h.openNote(notePath);
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
  await browser.executeObsidian(() => {
    const s = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
    if (s) s.scrollTop = s.scrollHeight;
  });
  await browser.pause(1200);
}

describe('coexistence with core backlinks', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.createNote(PLAIN, '# Undecorated\n\nThis note is never put in outline mode.\n');
    await enableCoreInDocument();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('brings Obsidian’s own section into the rule’s scope where our footer renders', async function () {
    await openInOutline(NOTE);
    const core = await suppressed();
    // PRESENT, not removed: this is a stylesheet rule, so nothing is detached
    // and nothing has to be put back.
    expect(core.present).toBe(true);
    expect(core.matches).toBe(true);
  });

  it('takes it out of scope when the setting is turned off, with no reload', async function () {
    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksSuppressCore(false);
    });
    await browser.pause(800);
    expect((await suppressed()).matches).toBe(false);

    // And back — the second toggle is the one that caught a missing repaint:
    // the footer widget's identity is its NOTE, so CM6 keeps the mounted DOM
    // and only an explicit repaint re-applies the class.
    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksSuppressCore(true);
    });
    await browser.pause(800);
    expect((await suppressed()).matches).toBe(true);
  });

  it('does not reach a note the plugin is not decorating', async function () {
    await h.openNote(PLAIN);
    await browser.pause(900);
    expect(await h.isOutlineMode(PLAIN)).toBe(false);
    // No footer in this view, so the rule's `:has()` cannot hold whatever the
    // setting says.
    expect((await suppressed()).matches).toBe(false);
  });

  it('leaves no residue when the plugin is disabled', async function () {
    await openInOutline(NOTE);
    expect((await suppressed()).matches).toBe(true);

    await obsidianPage.disablePlugin(h.PLUGIN_ID);
    await browser.pause(900);
    const after = await browser.executeObsidian((_ctx, selector: string) => {
      const el = document.querySelector<HTMLElement>('.embedded-backlinks');
      return {
        footers: document.querySelectorAll('.to-backlinks').length,
        // The selector cannot even be evaluated against a live rule any more:
        // the stylesheet went with the plugin.
        matches: el !== null && el.matches(selector),
        rulePresent: Array.from(document.styleSheets).some((sheet) => {
          try {
            return Array.from(sheet.cssRules).some(
              (r) => (r as CSSStyleRule).selectorText === selector,
            );
          } catch {
            return false;
          }
        }),
      };
    }, RULE);
    expect(after.footers).toBe(0);
    expect(after.matches).toBe(false);
    expect(after.rulePresent).toBe(false);

    await obsidianPage.enablePlugin(h.PLUGIN_ID);
    await browser.pause(900);
  });

  it('touches no other plugin’s configuration', async function () {
    const read = (): Promise<string> =>
      browser.executeObsidian(({ app }) => {
        const internal = (app as any).internalPlugins;
        return JSON.stringify({
          options: internal.plugins.backlink?.instance?.options ?? {},
          enabled: internal.plugins.backlink?.enabled ?? null,
        });
      });

    const before = await read();
    await browser.executeObsidian(async ({ plugins }) => {
      const plugin = plugins.trueOutliner as any;
      await plugin.setBacklinksSuppressCore(false);
      await plugin.setBacklinksSuppressCore(true);
    });
    await browser.pause(600);
    expect(await read()).toBe(before);
  });
});
