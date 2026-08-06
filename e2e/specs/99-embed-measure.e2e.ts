/**
 * TEMPORARY measurement probe (decorate-widget-rendered-lines task 1.2/1.3).
 * Not a test — it asserts nothing. It dumps the live DOM shape of every
 * embed placement so the fix is built against measured behavior instead of
 * an assumed DOM. Delete once the findings are recorded.
 */

import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { ALL_DECORATION_FIXTURES, createFixture } from '../fixtures/decorations.js';

interface ChildInfo {
  index: number;
  tag: string;
  cls: string;
  isCmLine: boolean;
  text: string;
  posLine: number | string;
  marginLeft: string;
  paddingLeft: string;
  hasMarkerChild: boolean;
}

interface NestedInfo {
  cls: string;
  directChildOfContent: boolean;
  ancestorChain: string;
  posLine: number | string;
  text: string;
}

function probe(): Promise<{ children: ChildInfo[]; nested: NestedInfo[]; refLine: string }> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const content: HTMLElement = cm.contentDOM;
    const lineOf = (el: Element): number | string => {
      try {
        return cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1;
      } catch (e) {
        return `ERR:${String(e)}`;
      }
    };
    const children: ChildInfo[] = Array.from(content.children).map((el, index) => {
      const he = el as HTMLElement;
      const cs = getComputedStyle(he);
      return {
        index,
        tag: he.tagName.toLowerCase(),
        cls: he.className,
        isCmLine: he.classList.contains('cm-line'),
        text: (he.textContent ?? '').slice(0, 40),
        posLine: lineOf(he),
        marginLeft: cs.marginLeft,
        paddingLeft: cs.paddingLeft,
        hasMarkerChild: !!he.querySelector(':scope > .to-decor-marker-icon'),
      };
    });
    const nested: NestedInfo[] = Array.from(content.querySelectorAll('.cm-embed-block')).map(
      (el) => {
        const chain: string[] = [];
        let p = el.parentElement;
        while (p && p !== content) {
          chain.push(`${p.tagName.toLowerCase()}.${p.className}`);
          p = p.parentElement;
        }
        return {
          cls: (el as HTMLElement).className,
          directChildOfContent: el.parentElement === content,
          ancestorChain: chain.join(' < ') || '(direct child of .cm-content)',
          posLine: lineOf(el),
          text: (el.textContent ?? '').slice(0, 40),
        };
      },
    );
    const ref = content.querySelector<HTMLElement>(
      '.cm-line:not(.to-decor-atom):not(.to-decor-list):not(.hr)',
    );
    return {
      children,
      nested,
      refLine: ref ? `${ref.className} marginLeft=${getComputedStyle(ref).marginLeft}` : 'NONE',
    };
  });
}

function dump(label: string, p: Awaited<ReturnType<typeof probe>>): void {
  console.log(`\n===== ${label} =====`);
  console.log('--- contentDOM direct children ---');
  for (const c of p.children) {
    console.log(
      `[${c.index}] line=${c.posLine} <${c.tag}> cls="${c.cls}" cmLine=${c.isCmLine} ` +
        `ml=${c.marginLeft} pl=${c.paddingLeft} marker=${c.hasMarkerChild} text="${c.text}"`,
    );
  }
  console.log('--- every .cm-embed-block in contentDOM ---');
  for (const n of p.nested) {
    console.log(
      `line=${n.posLine} direct=${n.directChildOfContent} cls="${n.cls}" ` +
        `chain="${n.ancestorChain}" text="${n.text}"`,
    );
  }
  console.log(`--- nativeMarginBasePx reference line: ${p.refLine}`);
}

describe('PROBE: embed DOM shape', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  it('dumps the embed fixture DOM with the cursor away, and on each embed line', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'embed')!;
    await createFixture(fixture, h.createNote);
    if (!(await h.isOutlineMode(fixture.note))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await browser.pause(600); // embeds load asynchronously

    console.log('\nFIXTURE MARKDOWN (0-indexed lines):');
    fixture.md.split('\n').forEach((l, i) => console.log(`  ${i}: ${JSON.stringify(l)}`));

    // Cursor parked on line 0 (the heading), away from every embed.
    await h.setCursor(0, 0);
    await browser.pause(300);
    dump('CURSOR ON HEADING (line 0) — all embeds in widget state', await probe());

    // Line 4 = whole-paragraph embed; 7 = embed as a continuation line;
    // 11 = list-item embed; 13 = inline embed among text. ch=0 sits at the
    // very start of the embed's range; ch=5 is strictly inside it, which is
    // what CM6 live preview normally needs to reveal the source.
    for (const [line, ch] of [
      [4, 0],
      [4, 5],
      [7, 5],
      [11, 5],
      [13, 20],
    ] as const) {
      await h.setCursor(line, ch);
      await browser.pause(300);
      dump(`CURSOR ON LINE ${line} ch ${ch}`, await probe());
    }
  });

  it('dumps what the CURRENT selectors match, and the widget-atom baseline', async function () {
    const embed = ALL_DECORATION_FIXTURES.find((f) => f.label === 'embed')!;
    const atoms = ALL_DECORATION_FIXTURES.find((f) => f.label === 'widget-atoms')!;
    for (const fixture of [embed, atoms]) {
      await createFixture(fixture, h.createNote);
      if (!(await h.isOutlineMode(fixture.note))) {
        await h.toggleOutlineMode();
        await h.waitForNotice('Outline mode on');
        await h.dismissNotices();
      }
      await h.setCursor(0, 0);
      await browser.pause(600);
      const report = await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) throw new Error('no active markdown view');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (view.editor as any).cm;
        const content: HTMLElement = cm.contentDOM;
        const count = (sel: string): string => {
          const all = content.querySelectorAll(sel).length;
          const direct = content.querySelectorAll(`:scope > ${sel.replace(/^:scope > /, '')}`)
            .length;
          return `${sel} -> any=${all} direct=${direct}`;
        };
        return {
          current: count('.cm-embed-block, .cm-line.hr'),
          notCmLine: Array.from(content.children)
            .filter((el) => !el.classList.contains('cm-line'))
            .map((el) => `<${el.tagName.toLowerCase()}> "${el.className}"`),
          allDirectClasses: Array.from(content.children).map((el) => el.className),
          gaps: content.querySelectorAll('.cm-gap').length,
          widgetBuffers: content.querySelectorAll('.cm-widgetBuffer').length,
        };
      });
      console.log(`\n===== SELECTOR REPORT: ${fixture.label} =====`);
      console.log(`current WIDGET_ATOM_SELECTOR: ${report.current}`);
      console.log(`direct children that are NOT .cm-line:`);
      for (const c of report.notCmLine) console.log(`   ${c}`);
      console.log(`.cm-gap count=${report.gaps}  .cm-widgetBuffer count=${report.widgetBuffers}`);
    }
  });
});
