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
    // Every line of every child node, the fence's own interior included: the
    // fence's indentation is the node's on all of its lines.
    for (const i of [2, 4, 5, 7, 9, 10, 11, 13]) {
      expect(await textColumn(i, lines[i]!)).toBeCloseTo(column, 1);
    }
  });

  it('keeps a fence’s interior indentation, which is the code’s own', async function () {
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const flush = await textColumn(5, '  fenced');
    // Four spaces past the fence's own two: content, not structure, and the
    // only part of the run that still occupies width.
    expect(await textColumn(6, '      deeper')).toBeGreaterThan(flush + 10);
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
