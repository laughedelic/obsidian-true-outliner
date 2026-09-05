import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const TARGET = 'Projects/Aurora Dashboard.md';

describe('probe: footer design tokens', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await browser.executeObsidian(({ plugins }) => {
      (plugins.trueOutliner as never as { backlinks: { rebuild(): void } }).backlinks.rebuild();
    });
  });

  it('dumps resolved chrome values', async function () {
    await h.openNote(TARGET);
    if (!(await h.isOutlineMode(TARGET))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await browser.executeObsidian(() => {
      const s = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
      if (s) s.scrollTop = s.scrollHeight;
    });
    await browser.pause(2000);
    await browser.executeObsidian(() => {
      document
        .querySelector('.workspace-leaf.mod-active .to-backlinks-filter-toggle')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await browser.pause(1200);

    const out = await browser.executeObsidian(() => {
      const leaf = document.querySelector('.workspace-leaf.mod-active');
      const root = leaf?.querySelector<HTMLElement>('.to-backlinks');
      if (!root) return null;
      const cs = (sel: string, props: string[]) => {
        const el = root.querySelector<HTMLElement>(sel);
        if (!el) return null;
        const c = getComputedStyle(el);
        const o: Record<string, string> = {};
        for (const p of props) o[p] = c.getPropertyValue(p);
        const r = el.getBoundingClientRect();
        o['#w'] = Math.round(r.width * 10) / 10 + '';
        o['#h'] = Math.round(r.height * 10) / 10 + '';
        return o;
      };
      const body = getComputedStyle(document.body);
      const vars = [
        '--text-normal','--text-muted','--text-faint','--text-accent','--text-on-accent',
        '--background-primary','--background-secondary','--background-modifier-hover',
        '--background-modifier-border','--interactive-accent','--radius-s','--radius-m',
        '--font-ui-smaller','--font-ui-small','--font-semibold','--font-text-size',
      ];
      const resolved: Record<string,string> = {};
      for (const v of vars) resolved[v] = body.getPropertyValue(v).trim();
      const rootCs = getComputedStyle(root);
      return {
        theme: document.body.className.includes('theme-dark') ? 'dark' : 'light',
        vars: resolved,
        footerVars: {
          markerGutter: rootCs.getPropertyValue('--to-marker-gutter').trim(),
          markerIcon: rootCs.getPropertyValue('--to-marker-icon-size').trim(),
          headIcon: rootCs.getPropertyValue('--to-backlinks-head-icon').trim(),
          mark: rootCs.getPropertyValue('--to-backlinks-mark').trim(),
          groupMax: rootCs.getPropertyValue('--to-backlinks-group-max').trim(),
          decorUnit: rootCs.getPropertyValue('--to-decor-unit').trim(),
        },
        rootFont: { size: rootCs.fontSize, family: rootCs.fontFamily, color: rootCs.color },
        head: cs('.to-backlinks-head', ['font-size','color','gap','padding-left','margin-bottom']),
        title: cs('.to-backlinks-title', ['font-size','font-weight','color']),
        totals: cs('.to-backlinks-totals', ['font-size','color']),
        filters: cs('.to-backlinks-filters', ['gap','padding-left','margin-bottom']),
        axisLabel: cs('.to-backlinks-axis-label', ['font-size','color','text-transform']),
        pill: cs('.to-backlinks-pill', ['font-size','padding','border-radius','background-color','color','line-height','border-color']),
        chip: cs('.to-backlinks-chip', ['font-size','padding','border-radius','background-color','color','border-color']),
        chipSelected: cs('.to-backlinks-pill.is-selected', ['background-color','color','border-color']),
        search: cs('.to-backlinks-search', ['font-size','padding','height','background-color','border-radius','border-color','color']),
        reset: cs('.to-backlinks-reset', ['border-radius','border-color','color']),
        sort: cs('.to-backlinks-sort', ['font-size','padding','background-color','color','border-radius']),
        groupHead: cs('.to-backlinks-group-head', ['font-size','color','gap','padding']),
        groupName: cs('.to-backlinks-group-name', ['font-size','font-weight','color']),
        groupFolder: cs('.to-backlinks-group-folder', ['font-size','color']),
        groupCount: cs('.to-backlinks-group-count', ['font-size','color']),
        group: cs('.to-backlinks-group', ['background-color','border-radius','border-color','padding','margin-bottom']),
        row: cs('.to-backlinks-row', ['font-size','color','line-height','padding-left','min-height']),
        rowRef: cs('.to-backlinks-row.is-reference .to-backlinks-content', ['color']),
        lineage: cs('.to-backlinks-row.is-lineage', ['font-size','color']),
        editorLine: (() => {
          const el = leaf?.querySelector<HTMLElement>('.cm-content > .cm-line');
          if (!el) return null;
          const c = getComputedStyle(el);
          return { fontSize: c.fontSize, family: c.fontFamily, color: c.color, lineHeight: c.lineHeight };
        })(),
      };
    });
    console.log('TOKENS ' + JSON.stringify(out, null, 1));
    expect(out).not.toBeNull();
  });
});
