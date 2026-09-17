/**
 * A non-list-item child of a list item stands in ONE column
 * (`source-indentation-collapses`, issue #117).
 *
 * The depth rules state where such a line begins; the whitespace the file wrote
 * to express the same depth used to render on top of that as characters, so one
 * tree level showed two visual columns and the second one's width depended on
 * whether the file used a tab or spaces. What is asserted here is the
 * consequence a reader sees: every kind written under the same item begins on
 * the same column, that column is the grid's (`depth × unit + gutter`), and it
 * is the same column whichever whitespace the file used.
 *
 * Measured rather than screenshotted, and against the SOURCE positions CM6
 * itself reports (`posToCoords`), for the reason the decoration postmortem
 * records: a class or a custom property only proves our code ran, never that
 * Obsidian's own rendering ended up where we said.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

/** Every non-list kind the issue names, blank-separated under one item. */
const SPACED = [
  '- alpha',
  '',
  '  child paragraph',
  '',
  '  ```js',
  '  fenced',
  '      deeper',
  '  ```',
  '',
  '  | a | b |',
  '  | - | - |',
  '  | 1 | 2 |',
  '',
  '  > quote child',
  '',
  '  > [!note] callout',
  '  > body',
  '',
].join('\n');

/** The same document, written with tabs. */
const TABBED = ['- alpha', '', '\tchild paragraph', '', '\t```js', '\tfenced', '\t```', ''].join(
  '\n',
);

/** Where line `i`'s own text begins, relative to the content's left edge. */
async function textColumn(i: number, text: string): Promise<number> {
  const first = text.search(/\S/);
  const coords = await h.posToCoords(i, first < 0 ? 0 : first);
  return +(coords.left - (await h.contentLeftAbsoluteX())).toFixed(2);
}

/** Where line `i` BEGINS — the caret's own column at its first character. */
async function lineStartColumn(i: number): Promise<number> {
  const coords = await h.posToCoords(i, 0);
  return +(coords.left - (await h.contentLeftAbsoluteX())).toFixed(2);
}

async function openOutlined(path: string, content: string): Promise<void> {
  await h.createNote(path, content);
  await h.setOutlineMode(true);
  await h.dismissNotices();
  // Off every line under assertion: the caret's own line is re-rendered with
  // its raw source revealed, which is a different question than this one.
  await h.setCursorSettled(0, 0);
}

describe('source indentation: one column per tree level', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('starts every kind written under an item on the item’s child column', async function () {
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const column = (await h.publishedUnit()) + (await h.publishedGutter());
    const lines = SPACED.split('\n');
    // The paragraph, the table's rows and the quote: their text IS their start.
    for (const i of [2, 9, 10, 11, 13]) {
      expect(await textColumn(i, lines[i]!)).toBeCloseTo(column, 1);
    }
    // A fence renders a box of its own, so it is the BOX that begins on the
    // column; its code sits one code padding inside, asserted below.
    for (const i of [4, 5, 7]) {
      const info = await h.getLineElementInfo(i);
      expect(+(info.rect.left - (await h.contentLeftAbsoluteX())).toFixed(2)).toBeCloseTo(column, 1);
    }
  });

  it('gives an indented fence the internal padding an unindented one has', async function () {
    // Obsidian pads a top-level fence's code away from its own tinted box and
    // withholds that padding inside a list, where the source indentation used to
    // stand in for it. Collapsed, the code would sit flush against the box.
    await openOutlined('SourceIndent/topfence.md', ['```js', 'let x = 1;', '```', ''].join('\n'));
    const topBox = await h.getLineElementInfo(1);
    const topPad = (await textColumn(1, 'let x = 1;')) - (topBox.rect.left - (await h.contentLeftAbsoluteX()));
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const info = await h.getLineElementInfo(5);
    const inset = (await textColumn(5, '  fenced')) - (info.rect.left - (await h.contentLeftAbsoluteX()));
    expect(inset).toBeCloseTo(topPad, 1);
  });

  it('keeps a fence’s interior indentation at the width of its own spaces', async function () {
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const flush = await textColumn(5, '  fenced');
    // Four spaces past the fence's own two, stated from the measured space
    // advance rather than left to Obsidian's quantiser — which sized the whole
    // run, the fence's own indentation included, and rendered it half again too
    // wide.
    const advance = await h.publishedSpaceAdvance();
    expect(await textColumn(6, '      deeper')).toBeCloseTo(flush + 4 * advance, 0);
  });

  it('starts a widget-rendered callout child on the same column', async function () {
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const column = (await h.publishedUnit()) + (await h.publishedGutter());
    const info = await h.getLineElementInfo(15);
    const left = info.rect.left - (await h.contentLeftAbsoluteX());
    expect(+left.toFixed(2)).toBeCloseTo(column, 1);
  });

  it('keeps a non-fence line indented deeper than its node', async function () {
    // The wrapper Obsidian builds holds the WHOLE run, this line's surplus
    // included, so collapsing it here would take indentation the node never
    // claimed. The line therefore takes the mark alone.
    const deeper = ['- alpha', '', '  first line', '      second deeper', ''].join('\n');
    await openOutlined('SourceIndent/deeper.md', deeper);
    const flush = await textColumn(2, '  first line');
    const advance = await h.publishedSpaceAdvance();
    expect(await textColumn(3, '      second deeper')).toBeCloseTo(flush + 4 * advance, 0);
  });

  it('leaves a child of a heading alone, whose depth its whitespace never stated', async function () {
    const under = ['# Heading', '', 'plain child', '', '   three-space child', ''].join('\n');
    await openOutlined('SourceIndent/heading.md', under);
    expect(await textColumn(4, '   three-space child')).toBeGreaterThan(
      await textColumn(2, 'plain child'),
    );
  });

  it('holds with Obsidian’s own indentation guides turned off', async function () {
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const column = (await h.publishedUnit()) + (await h.publishedGutter());
    await h.setIndentGuides(false);
    try {
      await browser.pause(150);
      expect(await textColumn(2, '  child paragraph')).toBeCloseTo(column, 1);
    } finally {
      await h.setIndentGuides(true);
    }
  });

  it('puts a tab-indented child on the same column as a space-indented one', async function () {
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const spaced = await textColumn(2, '  child paragraph');
    await openOutlined('SourceIndent/tabbed.md', TABBED);
    expect(await textColumn(2, '\tchild paragraph')).toBeCloseTo(spaced, 1);
  });

  it('collapses the run itself, so the line begins where its text does', async function () {
    // A paragraph's CONTINUATION line: a first line carries the block marker,
    // an inline widget its own position 0 sits left of, which would measure the
    // marker rather than the run.
    const wrapped = ['- alpha', '', '  child paragraph', '  second line', ''].join('\n');
    await openOutlined('SourceIndent/wrapped.md', wrapped);
    expect(await lineStartColumn(3)).toBeCloseTo(await textColumn(3, '  second line'), 1);
  });

  it('leaves the item’s own indentation to the list rules', async function () {
    const nested = ['- alpha', '  - nested', '    continuation', ''].join('\n');
    await openOutlined('SourceIndent/nested.md', nested);
    const unit = await h.publishedUnit();
    const gutter = await h.publishedGutter();
    // A marker CENTRES on its column, so the root item's own marker states
    // where a marker sits relative to it; the nested one is one unit further.
    const rootMarker = await textColumn(0, '- alpha');
    expect(await textColumn(1, '  - nested')).toBeCloseTo(rootMarker + unit, 1);
    // The continuation belongs under its item's TEXT — its whitespace is SIZED
    // to the stated hang, not collapsed.
    expect(await textColumn(2, '    continuation')).toBeCloseTo(unit + gutter, 1);
  });

  it('touches nothing with outline mode off', async function () {
    await h.createNote('SourceIndent/off.md', SPACED);
    await h.setOutlineMode(false);
    await h.dismissNotices();
    await h.setCursorSettled(0, 0);
    await browser.pause(150);
    // Stock rendering: the two leading spaces are characters again, so the
    // line's text starts right of where the line itself starts.
    expect(await textColumn(2, '  child paragraph')).toBeGreaterThan(await lineStartColumn(2));
  });
});
