/**
 * The presenting-examples notation as a module: the layout script, the case runner and the
 * editor-state helper all read and draw it through this file, so a drawing one of them makes reads
 * back in the others.
 *
 * A column is written as the document itself (see `.agents/skills/presenting-examples/SKILL.md`):
 * real tabs and spaces, `▒` opening a block-selected line, `«…»` around a selection, `┃` the caret,
 * `‸` a paste point, `∅` the end of the text. A drawn block is what `layout` prints from columns.
 */

const UNDERLINE = '̲';
const EDGE = '┆';
const BLOCK = '▒';
const TAB = '→ ';
// What earlier drawings wrote for a tab: `⏵` and padding to four cells.
const OLD_TAB = '⏵';
const GAP = 3;

const width = (s: string): number => [...s].filter((c) => c !== UNDERLINE).length;
const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - width(s)));

export interface Column {
  header: string;
  lines: string[];
}

export interface Range {
  anchor: number;
  head: number;
}

export interface ReadDocument {
  text: string;
  /** Null when the column states no selection. */
  selection: Range | null;
  /** The 0-based lines that open with `▒`, which state no range. */
  blockLines: number[];
}

export interface DrawnState {
  text: string;
  /** `ranges[0]` is the range drawn. */
  ranges?: readonly Range[];
  blockLines?: readonly number[];
}

// ---- Columns ---------------------------------------------------------------------------------

/** Splits `=== <header>` input into columns of raw lines. Text before the first header is an
 * error unless it is blank. `line` is the 1-based line of the header. */
export function readColumns(text: string): (Column & { line: number })[] {
  const columns: (Column & { line: number })[] = [];
  text.split('\n').forEach((line, i) => {
    const header = /^=== (.*?)\s*$/.exec(line);
    const last = columns.at(-1);
    if (header) columns.push({ header: header[1] ?? '', lines: [], line: i + 1 });
    else if (last) last.lines.push(line);
    else if (line.trim()) throw new Error('input must start with a "=== <header>" line');
  });
  return columns;
}

// ---- Reading a column ------------------------------------------------------------------------

/**
 * Reads a column of raw lines into the text it draws and the selection it states. Errors name the
 * line, counted from `firstLine`.
 */
export function readDocument(rawLines: readonly string[], firstLine = 1): ReadDocument {
  const lines = [...rawLines];
  while (lines.at(-1) === '') lines.pop();
  const blockLines: number[] = [];
  let text = '';
  let ended = false;
  let caret: number | null = null;
  let insertion: number | null = null;
  let open: number | null = null;
  let selected: { start: number; end: number } | null = null;
  const fail = (i: number, message: string): never => {
    throw new Error(`line ${firstLine + i}: ${message}`);
  };
  lines.forEach((line, i) => {
    let s = line;
    if (s.startsWith(BLOCK)) {
      blockLines.push(i);
      s = s.slice(BLOCK.length);
    }
    if (i > 0) text += '\n';
    for (const ch of s) {
      if (ch === '┃') {
        if (caret !== null) fail(i, 'a second caret');
        caret = text.length;
      } else if (ch === '‸') {
        if (insertion !== null) fail(i, 'a second ‸');
        insertion = text.length;
      } else if (ch === '«') {
        if (open !== null || selected) fail(i, 'a second selection');
        open = text.length;
      } else if (ch === '»') {
        if (open === null) fail(i, '» without «');
        selected = { start: open ?? 0, end: text.length };
        open = null;
      } else if (ch === '∅') {
        if (i !== lines.length - 1) fail(i, '∅ is not on the last line');
        ended = true;
      } else text += ch;
    }
  });
  if (open !== null) fail(lines.length - 1, '« without »');
  if (!ended && lines.length) text += '\n';

  let selection: Range | null = null;
  const firstBlock = blockLines[0];
  const range = selected as { start: number; end: number } | null;
  if (firstBlock !== undefined) {
    if (caret !== null || range) fail(firstBlock, 'a block selection has no caret or selection');
  } else if (range) {
    let head = range.end;
    if (caret !== null) {
      if (caret === range.end) head = range.end;
      else if (caret === range.start) head = range.start;
      else fail(lines.length - 1, 'the caret must touch the selection');
    }
    selection = { anchor: head === range.end ? range.start : range.end, head };
  } else if (caret !== null) selection = { anchor: caret, head: caret };
  else if (insertion !== null) selection = { anchor: insertion, head: insertion };
  return { text, selection, blockLines };
}

// ---- Drawing a state -------------------------------------------------------------------------

/**
 * Draws a state as the lines of a column, the inverse of `readDocument`. `∅` is left off exactly
 * when reading would supply it: a text that ends in one newline with nothing on the empty last
 * line.
 */
export function drawDocument({ text, ranges = [], blockLines = [] }: DrawnState): string[] {
  const marks = new Map<number, string>();
  const put = (at: number, glyphs: string): void => {
    marks.set(at, (marks.get(at) ?? '') + glyphs);
  };
  const main = ranges[0];
  if (main && !blockLines.length) {
    const from = Math.min(main.anchor, main.head);
    const to = Math.max(main.anchor, main.head);
    if (from === to) put(from, '┃');
    else {
      put(from, (main.head === from ? '┃' : '') + '«');
      put(to, '»' + (main.head === to ? '┃' : ''));
    }
  }
  let s = '';
  for (let i = 0; i <= text.length; i++) {
    s += marks.get(i) ?? '';
    if (i < text.length) s += text[i];
  }
  const lines = s.split('\n').map((line, i) => (blockLines.includes(i) ? BLOCK + line : line));
  const last = lines.length - 1;
  // Reading drops empty lines at the end of a column and adds the final newline itself, so the
  // last line is left off only when that gives the text back.
  const implied = text.endsWith('\n') && lines[last] === '' && (lines[last - 1] ?? '') !== '';
  if (implied) lines.pop();
  else lines[last] += '∅';
  return lines;
}

// ---- Laying columns out ----------------------------------------------------------------------

// Tabs become `→ `, a space touching a tab or ending a line becomes `·`, every other space stays.
function showWhitespace(s: string): string {
  const dots = (m: string): string => '·'.repeat(m.length);
  return s
    .replace(/ +(?=[┃‸∅]*$)/, dots)
    .replace(/ +(?=\t)|(?<=\t) +/g, dots)
    .replace(/\t/g, TAB);
}

// `open` carries a selection that began on an earlier line: its characters are underlined until
// the `»` that closes it.
function drawLine(raw: string, open: boolean): { text: string; open: boolean } {
  let edge = EDGE;
  let s = raw;
  if (s.startsWith(BLOCK)) {
    edge = BLOCK;
    s = s.slice(BLOCK.length);
  }
  s = showWhitespace(s);
  let drawn = '';
  let on = open;
  for (const c of s) {
    if (c === '«') on = true;
    else if (c === '»') on = false;
    else drawn += on && !'┃‸∅'.includes(c) ? c + UNDERLINE : c;
  }
  return { text: edge + drawn, open: on };
}

/** Prints columns of `{ header, lines }` side by side. Empty lines at the end of a column are
 * dropped, so columns can be separated by an empty line; a line of spaces is content. */
export function layout(columns: readonly Column[]): string {
  const drawn = columns.map((col) => {
    const lines = [...col.lines];
    while (lines.at(-1) === '') lines.pop();
    let open = false;
    const cells = lines.map((line) => {
      const cell = drawLine(line, open);
      open = cell.open;
      return cell.text;
    });
    return {
      header: col.header,
      lines: cells,
      width: Math.max(width(col.header) + 1, ...cells.map(width)) + GAP,
    };
  });
  const rows = Math.max(0, ...drawn.map((c) => c.lines.length));
  const out = [drawn.map((c) => pad(' ' + c.header, c.width)).join('').trimEnd()];
  for (let r = 0; r < rows; r++) {
    out.push(drawn.map((c) => pad(c.lines[r] ?? '', c.width)).join('').trimEnd());
  }
  return out.join('\n');
}

/**
 * Prints each column as its own block under its header: the column as written, with only the
 * whitespace made visible. Nothing depends on how wide a glyph is, so it reads the same in any
 * font, and a selection stays `«…»` rather than an underline.
 */
export function stack(columns: readonly Column[]): string {
  return columns
    .map((col) => {
      const lines = [...col.lines];
      while (lines.at(-1) === '') lines.pop();
      const body = lines.map(showWhitespace);
      const longest = Math.max(0, ...body.map((l) => Math.max(0, ...[...l.matchAll(/`+/g)].map((m) => m[0].length))));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      return [col.header, fence, ...body, fence].join('\n');
    })
    .join('\n\n');
}

// ---- Reading a drawn block -------------------------------------------------------------------

// A visible character with the underline that follows it, so column offsets count what is seen.
function units(row: string): string[] {
  const u: string[] = [];
  for (const c of row) {
    if (c === UNDERLINE && u.length) u[u.length - 1] += c;
    else u.push(c);
  }
  return u;
}

interface DrawnChar {
  ch: string;
  underlined: boolean;
}

// One drawn cell as characters with their underline. A tab is `→` and a padding cell, or the `⏵` and
// three that earlier drawings wrote, either of which a row's trailing trim may have shortened;
// `·` is a space.
function cellChars(cell: string[]): { block: boolean; chars: DrawnChar[] } {
  const body = cell.slice(1);
  while (body.length && body.at(-1) === ' ') body.pop();
  const chars: DrawnChar[] = [];
  for (let i = 0; i < body.length; i++) {
    const unit = body[i] ?? '';
    const underlined = unit.endsWith(UNDERLINE);
    const ch = underlined ? unit.slice(0, -1) : unit;
    if (ch === OLD_TAB || ch === '→') {
      for (let n = 0; n < (ch === OLD_TAB ? 3 : 1) && body[i + 1]?.replace(UNDERLINE, '') === ' '; n++) i++;
      chars.push({ ch: '\t', underlined });
    } else chars.push({ ch: ch === '·' ? ' ' : ch, underlined });
  }
  return { block: cell[0] === BLOCK, chars };
}

// A column's cells back to literal lines. The line breaks between lines are underlined when the
// selection runs through them: the line before ends underlined and the next non-empty line begins
// so, empty lines in between included. That is how `layout` draws a selection across lines, and
// the only way the drawn form can be read back into one range.
function undrawColumn(cells: string[][]): string[] {
  const lines = cells.map(cellChars);
  const n = lines.length;
  const endsOn: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const c = lines[i]?.chars ?? [];
    endsOn[i] = c.length ? (c.at(-1)?.underlined ?? false) : i > 0 && (endsOn[i - 1] ?? false);
  }
  const startsOn: boolean[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const c = lines[i]?.chars ?? [];
    startsOn[i] = c.length ? (c[0]?.underlined ?? false) : i + 1 < n && (startsOn[i + 1] ?? false);
  }
  const out: string[] = [];
  let on = false;
  let text = '';
  const put = (ch: string, underlined: boolean): void => {
    if (underlined && !on) text += '«';
    else if (!underlined && on) text += '»';
    on = underlined;
    text += ch;
  };
  lines.forEach((line, i) => {
    text = line.block ? BLOCK : '';
    for (const c of line.chars) put(c.ch, c.underlined);
    if (i + 1 < n && on && !(endsOn[i] && startsOn[i + 1])) put('', false);
    if (i + 1 === n && on) put('', false);
    out.push(text);
  });
  return out;
}

// A tab is `→` and its padding space; the tail of a line that a trim shortened counts too. A `→`
// with text right after it stays an arrow.
function stackedLine(line: string): string {
  return line
    .replace(/→(?: |$)/g, '\t')
    .replace(/⏵ {0,3}/g, '\t')
    .replace(/·/g, ' ');
}

// Blocks under headers, as `stack` prints them: a header line, then a fenced block.
function undrawStacked(block: string): Column[] {
  const columns: Column[] = [];
  const rows = block.split('\n');
  let header = '';
  for (let i = 0; i < rows.length; i++) {
    const open = /^ *(`{3,})/.exec(rows[i] ?? '');
    if (!open) {
      if ((rows[i] ?? '').trim()) header = (rows[i] ?? '').trim();
      continue;
    }
    const fence = open[1] ?? '```';
    const lines: string[] = [];
    for (i++; i < rows.length && !new RegExp(`^ *${fence}\\s*$`).test(rows[i] ?? ''); i++) {
      lines.push(stackedLine(rows[i] ?? ''));
    }
    columns.push({ header, lines });
    header = '';
  }
  return columns;
}

/**
 * Reads a drawn block back into columns of literal lines, the input `layout` takes. Both forms
 * read: side by side, and stacked under headers.
 *
 * A cell starts at an edge glyph at column 0 or after two spaces, so a header that a hand
 * alignment put over the wrong cells still labels the column it sits over. `·` reads as a space,
 * which a note containing a middle dot cannot survive. A line break has no underline, so a
 * selection that begins at the end of a line or ends at the start of one reads back shorter.
 */
export function undraw(block: string): Column[] {
  if (/^ *`{3,}/m.test(block)) return undrawStacked(block);
  const rows = block.split('\n');
  while (rows.length && rows[0]?.trim() === '') rows.shift();
  while (rows.length && rows.at(-1)?.trim() === '') rows.pop();
  const [header = '', ...body] = rows;
  const cells = body.map(units);
  const starts = new Set<number>();
  for (const u of cells) {
    u.forEach((c, p) => {
      if ((c === EDGE || c === BLOCK) && (p === 0 || (u[p - 1] === ' ' && u[p - 2] === ' '))) starts.add(p);
    });
  }
  const tokens: { text: string; at: number }[] = [];
  for (const m of header.matchAll(/\S+(?: \S+)*/g)) tokens.push({ text: m[0], at: m.index });
  // A header with no edge under or near it labels a column with no rows.
  for (const t of tokens) {
    if (![...starts].some((p) => p <= t.at && t.at <= p + 12)) starts.add(Math.max(0, t.at - 1));
  }
  const at = [...starts].sort((a, b) => a - b);
  const headers = at.map((start, k) =>
    tokens
      .filter((t) => t.at >= (k === 0 ? 0 : start) && t.at < (at[k + 1] ?? Infinity))
      .map((t) => t.text)
      .join(' '),
  );
  const drawn: string[][][] = at.map(() => []);
  for (const u of cells) {
    at.forEach((start, k) => {
      const cell = u.slice(start, at[k + 1] ?? u.length);
      if (cell[0] === EDGE || cell[0] === BLOCK) drawn[k]?.push(cell);
    });
  }
  return headers.map((header, k) => ({ header, lines: undrawColumn(drawn[k] ?? []) }));
}

// ---- Keys ------------------------------------------------------------------------------------

export type Modifier = 'mod' | 'ctrl' | 'alt' | 'shift';

export type KeyStep =
  | { kind: 'chord'; mods: Modifier[]; key: string; times: number; source: string }
  | { kind: 'text'; text: string; source: string };

const SYMBOL_KEYS: Record<string, string> = {
  '⇥': 'Tab',
  '⏎': 'Enter',
  '⌫': 'Backspace',
  '⌦': 'Delete',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
  '⎋': 'Escape',
};
const MODIFIER_SYMBOLS: Record<string, Modifier> = { '⌘': 'mod', '⌃': 'ctrl', '⌥': 'alt', '⇧': 'shift' };
const SPELLED_KEYS: Record<string, string> = {
  tab: 'Tab',
  enter: 'Enter',
  return: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  esc: 'Escape',
  escape: 'Escape',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  space: ' ',
};
const SPELLED_MODIFIERS: Record<string, Modifier> = {
  mod: 'mod',
  cmd: 'mod',
  ctrl: 'ctrl',
  alt: 'alt',
  opt: 'alt',
  shift: 'shift',
};

function parseStep(token: string): KeyStep | null {
  const symbol = /^([⌘⌃⌥⇧]*)(⇥|⏎|⌫|⌦|↑|↓|←|→|⎋|[^\s])(?:×(\d+))?$/u.exec(token);
  if (symbol) {
    const [, held = '', pressed = '', repeat] = symbol;
    const alone = !held && '⌘⌃⌥⇧|'.includes(pressed);
    if (!alone && !'⌘⌃⌥⇧'.includes(pressed) && Number(repeat ?? 1) > 0) {
      const mods = [...held].flatMap((m) => MODIFIER_SYMBOLS[m] ?? []);
      const key = SYMBOL_KEYS[pressed] ?? (mods.length ? pressed.toLowerCase() : pressed);
      return { kind: 'chord', mods, key, times: Number(repeat ?? 1), source: token };
    }
  }
  const spelled = /^([A-Za-z]+(?:-[A-Za-z]+)*)(?:×(\d+))?$/.exec(token);
  if (spelled) {
    const parts = (spelled[1] ?? '').toLowerCase().split('-');
    const name = parts.pop() ?? '';
    const mods = parts.map((p) => SPELLED_MODIFIERS[p]);
    const key = SPELLED_KEYS[name] ?? (name.length === 1 && mods.length ? name : undefined);
    const known = mods.filter((m): m is Modifier => m !== undefined);
    if (key !== undefined && known.length === mods.length && Number(spelled[2] ?? 1) > 0) {
      return { kind: 'chord', mods: known, key, times: Number(spelled[2] ?? 1), source: token };
    }
  }
  return null;
}

/**
 * Parses a `keys` value: phases separated by a `|` standing alone, each a run of steps. A step is
 * a chord (`⌘⇧↓`, `mod-shift-enter`, `Home`) with an optional `×N`, or quoted text typed as
 * characters. An empty value is no phase at all.
 */
export function parseKeys(value: string): KeyStep[][] {
  if (!value.trim()) return [];
  const phases: string[][] = [[]];
  for (const m of value.matchAll(/"[^"]*"|\S+/g)) {
    if (m[0] === '|') phases.push([]);
    else phases.at(-1)?.push(m[0]);
  }
  return phases.map((tokens) => {
    const steps = tokens.map((token): KeyStep => {
      if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
        return { kind: 'text', text: token.slice(1, -1), source: token };
      }
      const step = parseStep(token);
      if (!step) throw new Error(`${JSON.stringify(token)} is not a key`);
      return step;
    });
    if (!steps.length) throw new Error('a phase with no keys');
    return steps;
  });
}

/** The `keys` value that parses to `phases`: steps as written, phases joined by ` | `. */
export function keysLine(phases: readonly (readonly KeyStep[])[]): string {
  return phases.map((phase) => phase.map((step) => step.source).join(' ')).join(' | ');
}

// ---- Case files ------------------------------------------------------------------------------

export interface ParsedCase {
  title: string | undefined;
  outline: boolean;
  tabs: boolean;
  platform: 'desktop' | 'mobile' | undefined;
  phases: KeyStep[][];
  before: ReadDocument;
  beforeLines: string[];
  clipboard: string | undefined;
  results: (ReadDocument & { header: string; lines: string[] })[];
  /** Headers of the columns a run ignores. */
  references: string[];
}

function choice<T>(value: string, options: Record<string, T>): T {
  if (!Object.hasOwn(options, value)) {
    throw new Error(`${JSON.stringify(value)} is not one of ${Object.keys(options).join(', ')}`);
  }
  return options[value] as T;
}

const NAMES = ['case', 'outline', 'tabs', 'platform', 'keys'];

/**
 * Parses a case file: a preamble of `name: value` lines, then `=== <header>` columns.
 *
 * Returns the settings, the phases, and the columns read into text and selection: `before`, the
 * optional `clipboard`, and `results`, one per phase in order. Any other column, `actual`
 * included, is kept as a reference. Errors name the file's line. With `record`, a file with no
 * result column at all is accepted: recording is what fills them in.
 */
export function parseCase(source: string, { record = false }: { record?: boolean } = {}): ParsedCase {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let title: string | undefined;
  let outline = true;
  let tabs = false;
  let platform: ParsedCase['platform'];
  let phases: KeyStep[][] = [];
  let first = lines.findIndex((l) => l.startsWith('=== '));
  if (first < 0) first = lines.length;
  const fail = (i: number, message: string): never => {
    throw new Error(`line ${i + 1}: ${message}`);
  };
  const seen = new Set<string>();
  lines.slice(0, first).forEach((line, i) => {
    if (!line.trim()) return;
    const m = /^([a-z]+): ?(.*)$/.exec(line);
    if (!m) return fail(i, `expected "name: value" before the first "=== " header, found ${JSON.stringify(line)}`);
    const name = m[1] ?? '';
    const value = (m[2] ?? '').trim();
    if (!NAMES.includes(name)) return fail(i, `unknown name ${JSON.stringify(name)} (one of ${NAMES.join(', ')})`);
    if (seen.has(name)) fail(i, `${name} is given twice`);
    seen.add(name);
    try {
      if (name === 'case') title = value;
      else if (name === 'outline') outline = choice(value, { on: true, off: false });
      else if (name === 'tabs') tabs = choice(value, { on: true, off: false });
      else if (name === 'platform') platform = choice<'desktop' | 'mobile'>(value, { desktop: 'desktop', mobile: 'mobile' });
      else phases = parseKeys(value);
    } catch (e) {
      fail(i, `${name}: ${(e as Error).message}`);
    }
  });

  const columns = readColumns(lines.slice(first).join('\n')).map((c) => ({ ...c, line: c.line + first }));
  const read = (c: Column & { line: number }): ReadDocument => readDocument(c.lines, c.line + 1);
  const byName = (name: string) => columns.filter((c) => c.header === name);
  const [before, ...extraBefore] = byName('before');
  if (!before) throw new Error('a case file needs a "=== before" column');
  if (extraBefore[0]) fail(extraBefore[0].line - 1, 'a second "before" column');
  const clipboards = byName('clipboard');
  if (clipboards[1]) fail(clipboards[1].line - 1, 'a second "clipboard" column');
  const resultColumns = columns.filter((c) => /^(expected|after)(\s|$)/.test(c.header));
  const wanted = Math.max(1, phases.length);
  if (resultColumns.length !== wanted && !(record && resultColumns.length === 0)) {
    throw new Error(
      `${phases.length} keys phase(s) need ${wanted} "expected" or "after" column(s), found ${resultColumns.length}`,
    );
  }
  const pastes = phases
    .flat()
    .some((s) => s.kind === 'chord' && s.mods.length === 1 && s.mods[0] === 'mod' && s.key === 'v');
  if (pastes && !clipboards.length) throw new Error('⌘V needs a "=== clipboard" column');

  // A column's trailing empty lines only separate it from the next, as in `layout`.
  const trimmed = (ls: readonly string[]): string[] => {
    const kept = [...ls];
    while (kept.length && kept.at(-1) === '') kept.pop();
    return kept;
  };
  const clipboard = clipboards[0];

  return {
    title,
    outline,
    tabs,
    platform,
    phases,
    before: read(before),
    clipboard: clipboard ? read(clipboard).text : undefined,
    results: resultColumns.map((c) => ({ header: c.header, ...read(c), lines: trimmed(c.lines) })),
    beforeLines: trimmed(before.lines),
    references: columns
      .filter((c) => c !== before && !clipboards.includes(c) && !resultColumns.includes(c))
      .map((c) => c.header),
  };
}
