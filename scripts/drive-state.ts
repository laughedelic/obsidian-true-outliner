/**
 * The editor's state as a drawn column, for `scripts/drive.ts state`.
 *
 * `stateMarkup` writes a document in the form `.agents/skills/presenting-examples/layout.mjs`
 * reads: `┃` at each range's head, `«…»` around the part of each line a range covers, `∅` at the
 * end of the document, and `▒` opening a block-selected line. A block selection has no caret (the
 * editor gives up focus while one holds), so while any line is block-selected no line carries `«»`
 * or `┃`.
 *
 * `drawColumns` is a copy of `layout.mjs`'s layout. That file is a script that reads stdin and
 * cannot be imported, so the logic is duplicated here until the case-file work (#289) gives it
 * one home; `tests/drive-state.test.ts` runs both on the same input and requires equal output.
 */

export interface StateRange {
  anchor: number;
  head: number;
}

const CARET = '┃';
const OPEN = '«';
const CLOSE = '»';
const END = '∅';

/** Order of markers at one position: a selection's end, then the caret, then a selection's start. */
const ORDER: Record<string, number> = { [CLOSE]: 0, [CARET]: 1, [OPEN]: 2 };

/**
 * `doc` with the selection drawn into it. `blockLines` are 0-based line numbers the editor draws
 * as block-selected.
 */
export function stateMarkup(doc: string, ranges: readonly StateRange[], blockLines: ReadonlySet<number>): string {
  const out: string[] = [];
  const shown = blockLines.size === 0 ? ranges : [];
  let from = 0;
  const lines = doc.split('\n');
  lines.forEach((text, index) => {
    const to = from + text.length;
    const last = index === lines.length - 1;
    if (blockLines.has(index)) {
      out.push(`▒${text}${last ? END : ''}`);
    } else {
      const marks: { at: number; glyph: string }[] = [];
      for (const range of shown) {
        const start = Math.max(from, Math.min(range.anchor, range.head));
        const end = Math.min(to, Math.max(range.anchor, range.head));
        if (start < end) marks.push({ at: start, glyph: OPEN }, { at: end, glyph: CLOSE });
        if (range.head >= from && range.head <= to) marks.push({ at: range.head, glyph: CARET });
      }
      marks.sort((a, b) => a.at - b.at || (ORDER[a.glyph] ?? 0) - (ORDER[b.glyph] ?? 0));
      let drawn = '';
      let cursor = from;
      for (const mark of marks) {
        drawn += text.slice(cursor - from, mark.at - from) + mark.glyph;
        cursor = mark.at;
      }
      out.push(drawn + text.slice(cursor - from) + (last ? END : ''));
    }
    from = to + 1;
  });
  return out.join('\n');
}

const UNDERLINE = '̲';
const EDGE = '┆';
const BLOCK = '▒';
const TAB = '⏵   ';
const GAP = 3;

const width = (s: string): number => [...s].filter((c) => c !== UNDERLINE).length;
const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - width(s)));

function draw(raw: string): string {
  let edge = EDGE;
  let s = raw;
  if (s.startsWith(BLOCK)) {
    edge = BLOCK;
    s = s.slice(BLOCK.length);
  }
  const dots = (m: string): string => '·'.repeat(m.length);
  s = s
    .replace(/ +(?=[┃‸∅]*$)/, dots)
    .replace(/ +(?=\t)|(?<=\t) +/g, dots)
    .replace(/\t/g, TAB)
    .replace(/«(.*?)»/g, (_, t: string) => [...t].map((c) => c + UNDERLINE).join(''));
  return edge + s;
}

export interface Column {
  header: string;
  /** The column in `layout.mjs`'s input form, lines joined by `\n`. */
  text: string;
}

/** Columns side by side, as `layout.mjs` prints them. */
export function drawColumns(columns: readonly Column[]): string {
  const cols = columns.map((c) => {
    const lines = c.text.split('\n');
    while (lines.at(-1) === '') lines.pop();
    const drawn = lines.map(draw);
    return {
      header: c.header,
      lines: drawn,
      width: Math.max(width(c.header) + 1, ...drawn.map(width)) + GAP,
    };
  });
  const rows = Math.max(...cols.map((c) => c.lines.length));
  const out = [cols.map((c) => pad(' ' + c.header, c.width)).join('').trimEnd()];
  for (let r = 0; r < rows; r++) {
    out.push(cols.map((c) => pad(c.lines[r] ?? '', c.width)).join('').trimEnd());
  }
  return out.join('\n');
}
