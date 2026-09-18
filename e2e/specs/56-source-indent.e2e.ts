/**
 * A non-list-item child of a list item stands in ONE column
 * (`source-indentation-collapses`, issue #117).
 *
 * The depth rules state where such a line begins; the whitespace the file wrote
 * to express the same depth used to render on top of that as characters, so one
 * tree level showed two visual columns and the second one's width depended on
 * whether the file used a tab or spaces. The node's OWN indentation is now
 * undrawn and the caret treats it as chrome; what a line carries BEYOND it is
 * ordinary text, and pushes the line's own text right.
 *
 * Two questions, both asserted here: where a line's text lands, and what the
 * caret does around characters that are not drawn. Measured rather than
 * screenshotted, and against the SOURCE positions CM6 itself reports
 * (`posToCoords`), for the reason the decoration postmortem records: a class or
 * a custom property only proves our code ran, never that Obsidian's own
 * rendering ended up where we said.
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

/** A paragraph whose second line is indented deeper than the node it belongs
 * to: two characters of the node's own indentation, four of its own. */
const DEEPER = ['- alpha', '', '  first line', '      second deeper', ''].join('\n');

/** Where line `i`'s own text begins, relative to the content's left edge. */
async function textColumn(i: number, text: string): Promise<number> {
  const first = text.search(/\S/);
  const coords = await h.posToCoords(i, first < 0 ? 0 : first);
  return +(coords.left - (await h.contentLeftAbsoluteX())).toFixed(2);
}

/** Where line `i`'s own BOX begins — an atom renders one, and it is the box
 * that stands on the column, its content one padding inside. */
async function boxColumn(i: number): Promise<number> {
  const info = await h.getLineElementInfo(i);
  return +(info.rect.left - (await h.contentLeftAbsoluteX())).toFixed(2);
}

/** The caret's own line, column and x — what a reader sees move, or not. */
async function caret(): Promise<{ line: number; ch: number; x: number | null }> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
    const cm = (view.editor as any).cm;
    const head = cm.state.selection.main.head;
    const line = cm.state.doc.lineAt(head);
    const coords = cm.coordsAtPos(head);
    const left = cm.contentDOM.getBoundingClientRect().left;
    return {
      line: line.number - 1,
      ch: head - line.from,
      x: coords ? +(coords.left - left).toFixed(2) : null,
    };
  });
}

/** The caret after each of `presses` taps of `key`, the starting position
 * first. */
async function walk(key: string, presses: number): Promise<{ line: number; ch: number; x: number | null }[]> {
  const seen = [await caret()];
  for (let i = 0; i < presses; i++) {
    await browser.keys([key]);
    await browser.pause(70);
    seen.push(await caret());
  }
  return seen;
}

const waitMs = 300;

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
      expect(await boxColumn(i)).toBeCloseTo(column, 1);
    }
  });

  it('gives an indented fence the internal padding an unindented one has', async function () {
    // Obsidian pads a top-level fence's code away from its own tinted box and
    // withholds that padding inside a list, where the source indentation used to
    // stand in for it. Undrawn, the code would sit flush against the box.
    await openOutlined('SourceIndent/topfence.md', ['```js', 'let x = 1;', '```', ''].join('\n'));
    const topPad = (await textColumn(1, 'let x = 1;')) - (await boxColumn(1));
    await openOutlined('SourceIndent/spaced.md', SPACED);
    expect((await textColumn(5, '  fenced')) - (await boxColumn(5))).toBeCloseTo(topPad, 1);
  });

  it('keeps a fence’s interior indentation at the width of its own spaces', async function () {
    // Four spaces past the fence's own two, rendered by Obsidian at whatever a
    // space measures in the CODE font — which is not what one measures in the
    // prose font, and is the reason this layer states no width at all. The same
    // four spaces at the top level are the yardstick.
    await openOutlined(
      'SourceIndent/topdeep.md',
      ['```js', 'flush', '    deeper', '```', ''].join('\n'),
    );
    const topSurplus = (await textColumn(2, '    deeper')) - (await textColumn(1, 'flush'));
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const surplus = (await textColumn(6, '      deeper')) - (await textColumn(5, '  fenced'));
    expect(surplus).toBeCloseTo(topSurplus, 1);
  });

  it('starts a widget-rendered callout child on the same column', async function () {
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const column = (await h.publishedUnit()) + (await h.publishedGutter());
    expect(await boxColumn(15)).toBeCloseTo(column, 1);
  });

  it('keeps a line indented deeper than its node, at the width of its own spaces', async function () {
    // The node's own indentation is hidden; what this line carries past it is
    // its own, and states the one thing a deeper line says.
    await openOutlined('SourceIndent/deeper.md', DEEPER);
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
    // A tab used to be the worst case, quantised to a tab stop by Obsidian and
    // to nothing by this layer. Hidden, it states no width to disagree about.
    await openOutlined('SourceIndent/spaced.md', SPACED);
    const spaced = await textColumn(2, '  child paragraph');
    await openOutlined('SourceIndent/tabbed.md', TABBED);
    expect(await textColumn(2, '\tchild paragraph')).toBeCloseTo(spaced, 1);
  });

  it('draws nothing at all for the run itself', async function () {
    // The mechanism, asserted where it is visible from outside: a position
    // inside the node's own indentation has no coordinates, because the
    // characters have no box. Which is why the caret is floored past them —
    // there is nowhere in there to draw one.
    const wrapped = ['- alpha', '', '  child paragraph', '  second line', ''].join('\n');
    await openOutlined('SourceIndent/wrapped.md', wrapped);
    const drawn = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const line = cm.state.doc.line(4); // `  second line`, CM6 lines are 1-indexed
      return [0, 1, 2].map((ch) => cm.coordsAtPos(line.from + ch) !== null);
    });
    expect(drawn).toEqual([false, false, true]);
  });

  it('walks a line’s surplus one character at a time', async function () {
    // Four presses, four steps of one space each: what a line carries past its
    // node is ordinary text and moves the caret like ordinary text.
    await openOutlined('SourceIndent/caret.md', DEEPER);
    await h.setCursorSettled(3, 6);
    const advance = await h.publishedSpaceAdvance();
    const seen = await walk('ArrowLeft', 4);
    expect(seen.map((s) => s.ch)).toEqual([6, 5, 4, 3, 2]);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.x!).toBeCloseTo(seen[i - 1]!.x! - advance, 0);
    }
  });

  it('crosses the node’s own indentation in one press, and draws the caret at both ends', async function () {
    // Undrawn characters are chrome: a press that moved through them would look
    // dead, every position among them rendering at one x. The floor is the same
    // one a list marker gets (`caret.ts`), so the press that leaves the text
    // start leaves the LINE.
    await openOutlined('SourceIndent/caret.md', DEEPER);
    const column = (await h.publishedUnit()) + (await h.publishedGutter());
    await h.setCursorSettled(3, 2);
    expect((await caret()).x).toBeCloseTo(column, 1);
    const [, afterOne] = await walk('ArrowLeft', 1);
    expect(afterOne!.line).toBe(2);
    expect(afterOne!.ch).toBe('  first line'.length);
    // And back: one press returns to the text start, never in front of it.
    const [, back] = await walk('ArrowRight', 1);
    expect(back!.line).toBe(3);
    expect(back!.ch).toBe(2);
    expect(back!.x).toBeCloseTo(column, 1);
  });

  it('leaves deletion to stock, in the surplus and in the run alike', async function () {
    await openOutlined('SourceIndent/delete.md', DEEPER);
    await h.setCursorSettled(3, 6);
    await browser.keys(['Backspace']);
    await browser.pause(waitMs);
    // Obsidian's own editor deletes a whole indent unit inside leading
    // whitespace — two spaces here, of the four this line carries past its
    // node. Asserted so a change to what the decorations hide cannot quietly
    // change what a press removes.
    expect((await h.getBuffer()).split('\n')[3]).toBe('    second deeper');
    await h.setCursorSettled(2, 2);
    await browser.keys(['Backspace']);
    await browser.pause(waitMs);
    // At the text start the same press takes the node's own indentation whole,
    // which is the edit it stands for: the block leaving its parent.
    expect((await h.getBuffer()).split('\n')[2]).toBe('first line');
  });

  it('draws the caret on a line Shift+Enter opens, which is indentation alone', async function () {
    // Such a line has no text for a run to push right, and nothing else to
    // render: the caret needs somewhere to stand on the line's own column.
    const wrapped = ['- alpha', '', '  first line', ''].join('\n');
    await openOutlined('SourceIndent/shift-enter.md', wrapped);
    const column = (await h.publishedUnit()) + (await h.publishedGutter());
    await h.setCursorSettled(2, '  first line'.length);
    await browser.keys(['Shift', 'Enter']);
    await browser.pause(waitMs);
    expect(await h.getBuffer()).toContain('  first line\n  \n');
    const at = await caret();
    expect(at.line).toBe(3);
    expect(at.x).toBeCloseTo(column, 1);
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
    // to the stated hang, not hidden.
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
    const coords = await h.posToCoords(2, 0);
    const start = +(coords.left - (await h.contentLeftAbsoluteX())).toFixed(2);
    expect(await textColumn(2, '  child paragraph')).toBeGreaterThan(start);
  });
});
