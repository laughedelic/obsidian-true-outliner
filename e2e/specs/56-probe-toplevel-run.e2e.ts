/**
 * PROBE, not a spec: what a TOP-LEVEL leading run renders as, and what a
 * candidate override would make of it (issue #140).
 *
 * Deleted once its figures are recorded in
 * `docs/research/source-indentation-width`.
 */

import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const FIXTURE = [
  'Intro paragraph.',
  '',
  '    four-space line,',
  '         an indented code block',
  '',
  '\ttab-indented line',
  '',
  '# Heading',
  '',
  'plain child',
  '',
  '   three-space child',
  '',
  '```js',
  'flush',
  '    deeper',
  '```',
  '',
].join('\n');

const UNDER_ITEM = ['- alpha', '', '  first line', '      second deeper', ''].join('\n');

const CANDIDATE = `
.markdown-source-view.mod-cm6
  .cm-content
  > .cm-line:is(.to-decor-block, .to-decor-atom)
  :is(.cm-hmd-list-indent, .cm-indent, .cm-indent-spacing) {
  width: auto !important;
  min-width: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
}
`;

/** Caret x for every position in the line's leading run, plus its text start. */
async function runWalk(lineIndex: number): Promise<(number | null)[]> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const line = cm.state.doc.line(lineIndex + 1);
      const run = /^[ \t]*/.exec(line.text)![0];
      const left = cm.contentDOM.getBoundingClientRect().left;
      const out: (number | null)[] = [];
      for (let ch = 0; ch <= run.length; ch++) {
        const coords = cm.coordsAtPos(line.from + ch);
        out.push(coords ? +(coords.left - left).toFixed(2) : null);
      }
      return out;
    },
    lineIndex,
  );
}

/** Every span Obsidian made of the run, with what states its width. */
async function runSpans(lineIndex: number): Promise<unknown> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const el = lines[lineIndex] as HTMLElement | undefined;
      if (!el) return null;
      const left = cm.contentDOM.getBoundingClientRect().left;
      const spans = Array.from(
        el.querySelectorAll('.cm-hmd-list-indent, .cm-indent, .cm-indent-spacing'),
      ) as HTMLElement[];
      return {
        classes: Array.from(el.classList).filter((c) => c.startsWith('to-decor-') || c.startsWith('HyperMD') || c.startsWith('cm-hmd')),
        guide: getComputedStyle(el).getPropertyValue('--indentation-guide-width').trim(),
        listIndent: getComputedStyle(el).getPropertyValue('--list-indent').trim(),
        spans: spans.map((n) => {
          const cs = getComputedStyle(n);
          return {
            cls: n.className,
            text: JSON.stringify(n.textContent),
            x: +(n.getBoundingClientRect().left - left).toFixed(2),
            w: +n.getBoundingClientRect().width.toFixed(2),
            width: cs.width,
            minWidth: cs.minWidth,
            padLeft: cs.paddingLeft,
          };
        }),
      };
    },
    lineIndex,
  );
}

async function textColumn(lineIndex: number): Promise<number | null> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const line = cm.state.doc.line(lineIndex + 1);
      const first = line.text.search(/\S/);
      const coords = cm.coordsAtPos(line.from + (first < 0 ? 0 : first));
      const left = cm.contentDOM.getBoundingClientRect().left;
      return coords ? +(coords.left - left).toFixed(2) : null;
    },
    lineIndex,
  );
}

const LINES = [2, 3, 5, 11, 14, 15];

async function report(label: string, lineIndices: number[] = LINES): Promise<void> {
  const rows: Record<string, unknown> = {};
  for (const i of lineIndices) {
    rows[String(i)] = {
      walk: await runWalk(i),
      text: await textColumn(i),
      dom: await runSpans(i),
    };
  }
  console.log(`\n### PROBE ${label}\n${JSON.stringify(rows, null, 1)}`);
}

describe('probe: a top-level leading run', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  it('measures the run with outline mode on, off, and under the candidate', async function () {
    await h.createNote('Probe/toplevel.md', FIXTURE);
    await h.setOutlineMode(true);
    await h.dismissNotices();
    await h.setCursorSettled(0, 0);
    await browser.pause(300);
    console.log(`\n### PROBE unit=${await h.publishedUnit()} gutter=${await h.publishedGutter()} advance=${await h.publishedSpaceAdvance()}`);
    await report('mode ON, stock');

    await h.applyStyleOverride('probe-140', CANDIDATE);
    await report('mode ON, candidate');
    await h.applyStyleOverride('probe-140', null);

    await h.setOutlineMode(false);
    await browser.pause(300);
    await report('mode OFF');
    await h.setOutlineMode(true);
  });

  it('measures a run under a list item, where the own indentation is hidden', async function () {
    await h.createNote('Probe/under-item.md', UNDER_ITEM);
    await h.setOutlineMode(true);
    await h.dismissNotices();
    await h.setCursorSettled(0, 0);
    await browser.pause(300);
    await report('under item, stock', [2, 3]);
    await h.applyStyleOverride('probe-140', CANDIDATE);
    await report('under item, candidate', [2, 3]);
    await h.applyStyleOverride('probe-140', null);
  });

  it('measures the indentation guide Obsidian would draw from the run', async function () {
    await h.createNote('Probe/guides.md', FIXTURE);
    await h.setOutlineMode(true);
    await h.dismissNotices();
    await h.setCursorSettled(0, 0);
    await browser.pause(300);
    const rows: Record<string, unknown> = {};
    for (const i of LINES) {
      rows[String(i)] = {
        classes: await h.getLineClassList(i),
        guide: (await h.getLineComputedStyle(i, '--indentation-guide-width')).trim(),
      };
    }
    console.log(`\n### PROBE guides\n${JSON.stringify(rows, null, 1)}`);
  });
});
