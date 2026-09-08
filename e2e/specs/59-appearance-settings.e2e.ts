/**
 * The appearance settings — the outline unit's step, the guides' thickness and
 * their intensity — and the mechanism that applies them.
 *
 * That mechanism is the thing under test as much as the values are. Each
 * setting is published as a property of its OWN (`--to-set-*`) which the
 * declaration in styles.css consumes as a default, so three things have to hold
 * at once: a default publishes nothing (or the stylesheet's own device-class
 * default could never resolve), a snippet overriding the token still wins over
 * the setting, and a change reaches every open pane and the footer with no note
 * touched and no decoration rebuilt.
 *
 * The unit's own geometry — every column, marker, hang and footer inset landing
 * on the chosen step — is measured in `58-unit-override.e2e.ts`, which already
 * reads every independently positioned layer. This spec asserts what carries a
 * choice to that geometry.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Notes/List decoration demo.md';

/** Every `--to-set-*` property the plugin has written onto `body`. */
function publishedProps(): Promise<Record<string, string>> {
  return browser.execute(() => {
    const out: Record<string, string> = {};
    const style = document.body.style;
    for (let i = 0; i < style.length; i++) {
      const name = style.item(i);
      if (name.startsWith('--to-set-')) out[name] = style.getPropertyValue(name).trim();
    }
    return out;
  });
}

/** A length-valued custom property, RESOLVED the way layout resolves it. */
function resolveLength(prop: string): Promise<number> {
  return browser.execute((p: string) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:var(${p});`;
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return +width.toFixed(2);
  }, prop);
}

/** The resolved guide colour, as the overlay actually paints it. */
function guideColor(): Promise<string> {
  return browser.execute(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:0;color:var(--to-guide-color);';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
}

/** The alpha channel of an `rgb()/rgba()` string — intensity, as painted. */
function alphaOf(color: string): number {
  const parts = color.match(/[\d.]+/g) ?? [];
  return parts.length >= 4 ? Number(parts[3]) : 1;
}

async function set(key: string, value: unknown): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, k: string, v: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tab = (app as any).setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
      await tab.setControlValue(k, v);
    },
    key,
    value,
  );
  await browser.pause(300);
}

describe('outline appearance settings', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
  });

  afterEach(async function () {
    await h.applyStyleOverride('appearance-spec-override', null);
    // Every setting here is global and persisted, so one test's choice is the
    // next one's starting point — and a test that begins by setting the value
    // it means to change measures nothing.
    await set('outlineUnit', 'auto');
    await set('guideThickness', 'hairline');
    await set('guideIntensity', 'normal');
  });

  after(async function () {
    await h.resetPluginState();
  });

  it('publishes nothing while every appearance setting is at its default', async function () {
    // Not tidiness: the unit's default differs by device class, and that branch
    // lives in the stylesheet. A property written here for a default choice
    // would override it on both classes, and the mobile default would never
    // resolve anywhere.
    expect(await publishedProps()).toEqual({});
  });

  it('publishes a reference to the declaration a preset names, never a length', async function () {
    // The numbers live once, in styles.css, beside the defaults that read the
    // same declarations. A published length would be a second copy — and the
    // compact rung and the mobile default are the same number, so they would be
    // two copies that agree only until someone edits one.
    await set('outlineUnit', 'roomy');
    await set('guideThickness', 'medium');
    await set('guideIntensity', 'strong');
    const props = await publishedProps();
    expect(props['--to-set-unit']).toBe('var(--to-unit-roomy)');
    expect(props['--to-set-guide-width']).toBe('var(--to-guide-width-medium)');
    expect(props['--to-set-guide-intensity']).toBe('var(--to-guide-intensity-strong)');
  });

  it('moves the resolved token, on both surfaces, with no note touched', async function () {
    const before = await h.getBuffer();
    let lightStrong = '';

    await set('outlineUnit', 'compact');
    const compact = await h.publishedUnit();
    await set('outlineUnit', 'wide');
    const wide = await h.publishedUnit();
    // A relationship, never a pixel: what the ladder promises is that a wider
    // rung is wider, and that every rung is one value every layer reads.
    expect(wide).toBeGreaterThan(compact);

    await set('guideThickness', 'hairline');
    const hairline = await resolveLength('--to-guide-width');
    await set('guideThickness', 'medium');
    const medium = await resolveLength('--to-guide-width');
    expect(medium).toBeGreaterThan(hairline);
    // The accent follows the guide at every thickness — an accent is a change
    // of colour, not of weight.
    expect(await resolveLength('--to-trail-width')).toBe(medium);

    // Intensity is a proportion of the theme's own faint text, so the ordering
    // has to hold in a light theme and a dark one, and the colour itself has to
    // come from the theme rather than from us.
    for (const dark of [false, true]) {
      await h.setTheme(dark);
      await set('guideIntensity', 'subtle');
      const subtle = await guideColor();
      await set('guideIntensity', 'strong');
      const strong = await guideColor();
      expect(alphaOf(strong)).toBeGreaterThan(alphaOf(subtle));
      if (dark) expect(strong).not.toBe(lightStrong);
      else lightStrong = strong;
    }
    await h.setTheme(false);

    // Nothing above is a document change.
    expect(await h.getBuffer()).toBe(before);
  });

  it('leaves a snippet’s own override winning over the setting', async function () {
    // The precedence the whole mechanism exists for. Writing `--to-decor-unit`
    // itself as an inline style would beat every stylesheet rule at any
    // specificity and demote the snippet route — a stated requirement — to
    // whatever the plugin is not currently setting.
    await set('outlineUnit', 'compact');
    const chosen = await h.publishedUnit();
    await h.applyStyleOverride('appearance-spec-override', 'body { --to-decor-unit: 3rem; }');
    const overridden = await h.publishedUnit();
    expect(overridden).toBeGreaterThan(chosen);
    expect(overridden).toBe(48); // 3rem at the 16px root the harness runs

    // The same for the guides' own two tokens.
    await set('guideThickness', 'medium');
    await h.applyStyleOverride(
      'appearance-spec-override',
      'body { --to-guide-width: 5px; --to-guide-color: rgb(1, 2, 3); }',
    );
    expect(await resolveLength('--to-guide-width')).toBe(5);
    expect(await guideColor()).toBe('rgb(1, 2, 3)');
  });

  it('reaches a second, inactive pane — which no decoration rebuild does', async function () {
    // Desktop only, for the reason `IS_MOBILE_RUN` records about drag-based
    // specs: a phone's workspace has no split to open, so under mobile
    // emulation this would be measuring something that does not exist.
    if (h.IS_MOBILE_RUN) this.skip();

    // `forceRedraw` (main.ts) applies a setting by toggling outline mode in the
    // ACTIVE view, so a second pane keeps rendering the old one until something
    // else wakes it. A property on `body` has no such limit: every pane
    // inherits it, and the change lands on the next style recalculation.
    await browser.executeObsidian(async ({ app, obsidian }) => {
      const leaf = app.workspace.getLeaf('split');
      const file = app.vault.getAbstractFileByPath('Notes/Edge Case Zoo.md');
      if (file instanceof obsidian.TFile) await leaf.openFile(file);
    });
    await browser.pause(800);

    /** The guide width each open editor resolves, in DOM order. */
    const perPane = (): Promise<number[]> =>
      browser.execute(() => {
        const panes = Array.from(document.querySelectorAll<HTMLElement>('.cm-content'));
        return panes.map((pane) => {
          const probe = document.createElement('div');
          probe.style.cssText =
            'position:absolute;visibility:hidden;height:0;width:var(--to-guide-width);';
          pane.appendChild(probe);
          const width = +probe.getBoundingClientRect().width.toFixed(2);
          probe.remove();
          return width;
        });
      });

    const before = await perPane();
    expect(before.length).toBeGreaterThan(1); // two panes, or this proves nothing
    await set('guideThickness', 'medium');
    const after = await perPane();
    expect(after.length).toBe(before.length);
    // EVERY pane, not just the one the settings tab was opened over.
    for (const [i, width] of after.entries()) expect(width).toBeGreaterThan(before[i]!);

    await set('guideThickness', 'hairline');
    await browser.executeObsidian(({ app }) => {
      const leaves = app.workspace.getLeavesOfType('markdown');
      if (leaves.length > 1) leaves[leaves.length - 1]!.detach();
    });
    await browser.pause(400);
  });

  it('clears what it published on unload, and republishes the saved choices on enable', async function () {
    // Starting from non-default choices on purpose: a disable/enable cycle from
    // the defaults exercises no cleanup at all, because there is nothing
    // published to remove.
    await set('outlineUnit', 'wide');
    await set('guideThickness', 'medium');
    await set('guideIntensity', 'subtle');
    expect(Object.keys(await publishedProps()).sort()).toEqual([
      '--to-set-guide-intensity',
      '--to-set-guide-width',
      '--to-set-unit',
    ]);

    await obsidianPage.disablePlugin(h.PLUGIN_ID);
    expect(await publishedProps()).toEqual({});
    // The token goes with the plugin's own stylesheet, so the document is back
    // to Obsidian's own rendering rather than to some half-applied grid.
    expect(
      await browser.execute(() =>
        getComputedStyle(document.body).getPropertyValue('--to-decor-unit').trim(),
      ),
    ).toBe('');

    await obsidianPage.enablePlugin(h.PLUGIN_ID);
    await browser.pause(500);
    const props = await publishedProps();
    expect(props['--to-set-unit']).toBe('var(--to-unit-wide)');
    expect(props['--to-set-guide-width']).toBe('var(--to-guide-width-medium)');
    expect(props['--to-set-guide-intensity']).toBe('var(--to-guide-intensity-subtle)');
  });
});
