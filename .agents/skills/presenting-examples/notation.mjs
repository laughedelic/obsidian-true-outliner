// The presenting-examples notation as a module: the layout script, the case runner and the
// editor-state helper all read and draw it through this file, so a drawing one of them makes
// reads back in the others.
//
// A column is written as the document itself (see SKILL.md): real tabs and spaces, `▒` opening a
// block-selected line, `«…»` around a selection, `┃` the caret, `‸` a paste point, `∅` the end of
// the text. A drawn block is what `layout` prints from columns.

const UNDERLINE = '̲';
const EDGE = '┆';
const BLOCK = '▒';
const TAB = '⏵   ';
const GAP = 3;

const width = (s) => [...s].filter((c) => c !== UNDERLINE).length;
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

// ---- Columns ---------------------------------------------------------------------------------

/** Splits `=== <header>` input into columns of raw lines. Text before the first header is an
 * error unless it is blank. */
export function readColumns(text) {
	const columns = [];
	text.split('\n').forEach((line, i) => {
		const header = line.match(/^=== (.*)$/);
		if (header) columns.push({ header: header[1], lines: [], line: i + 1 });
		else if (columns.length) columns.at(-1).lines.push(line);
		else if (line.trim()) throw new Error('input must start with a "=== <header>" line');
	});
	return columns;
}

// ---- Reading a column ------------------------------------------------------------------------

/**
 * Reads a column of raw lines into the text it draws and the selection it states.
 *
 * `selection` is null when the column states none; `blockLines` holds the 0-based lines that open
 * with `▒`, which state no range. Errors name the line, counted from `firstLine`.
 */
export function readDocument(rawLines, firstLine = 1) {
	const lines = [...rawLines];
	while (lines.length && lines.at(-1) === '') lines.pop();
	const blockLines = [];
	let text = '';
	let ended = false;
	let caret = null;
	let insertion = null;
	let open = null;
	let selected = null;
	const fail = (i, message) => {
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
				selected = { start: open, end: text.length };
				open = null;
			} else if (ch === '∅') {
				if (i !== lines.length - 1) fail(i, '∅ is not on the last line');
				ended = true;
			} else text += ch;
		}
	});
	if (open !== null) fail(lines.length - 1, '« without »');
	if (!ended && lines.length) text += '\n';

	let selection = null;
	if (blockLines.length) {
		if (caret !== null || selected) fail(blockLines[0], 'a block selection has no caret or selection');
	} else if (selected) {
		let head = selected.end;
		if (caret !== null) {
			if (caret === selected.end) head = selected.end;
			else if (caret === selected.start) head = selected.start;
			else fail(lines.length - 1, 'the caret must touch the selection');
		}
		selection = { anchor: head === selected.end ? selected.start : selected.end, head };
	} else if (caret !== null) selection = { anchor: caret, head: caret };
	else if (insertion !== null) selection = { anchor: insertion, head: insertion };
	return { text, selection, blockLines };
}

// ---- Drawing a state -------------------------------------------------------------------------

/**
 * Draws a state as the lines of a column, the inverse of `readDocument`.
 *
 * `ranges[0]` is the range drawn. `∅` is left off exactly when reading would supply it: a text
 * that ends in one newline with nothing on the empty last line.
 */
export function drawDocument({ text, ranges = [], blockLines = [] }) {
	const marks = new Map();
	const put = (at, glyphs) => marks.set(at, (marks.get(at) ?? '') + glyphs);
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

// `open` carries a selection that began on an earlier line: its characters are underlined until
// the `»` that closes it.
function drawLine(raw, open) {
	let edge = EDGE;
	let s = raw;
	if (s.startsWith(BLOCK)) {
		edge = BLOCK;
		s = s.slice(BLOCK.length);
	}
	const dots = (m) => '·'.repeat(m.length);
	s = s
		.replace(/ +(?=[┃‸∅]*$)/, dots)
		.replace(/ +(?=\t)|(?<=\t) +/g, dots)
		.replace(/\t/g, TAB);
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
export function layout(columns) {
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

// ---- Reading a drawn block -------------------------------------------------------------------

// A visible character with the underline that follows it, so column offsets count what is seen.
function units(row) {
	const u = [];
	for (const c of row) {
		if (c === UNDERLINE && u.length) u[u.length - 1] += c;
		else u.push(c);
	}
	return u;
}

function undrawLine(cell) {
	const edge = cell[0];
	const body = cell.slice(1).replace(/⏵ {3}/g, '\t').replace(/·/g, ' ');
	let out = '';
	let on = false;
	for (const u of units(body)) {
		const underlined = u.endsWith(UNDERLINE);
		if (underlined && !on) out += '«';
		else if (!underlined && on) out += '»';
		on = underlined;
		out += underlined ? u.slice(0, -1) : u;
	}
	if (on) out += '»';
	return (edge === BLOCK ? BLOCK : '') + out;
}

/**
 * Reads a drawn block back into columns of literal lines, the input `layout` takes.
 *
 * A cell starts at an edge glyph at column 0 or after two spaces, so a header that a hand
 * alignment put over the wrong cells still labels the column it sits over. `·` reads as a space,
 * which a note containing a middle dot cannot survive.
 */
export function undraw(block) {
	const rows = block.split('\n');
	while (rows.length && rows[0].trim() === '') rows.shift();
	while (rows.length && rows.at(-1).trim() === '') rows.pop();
	const [header = '', ...body] = rows;
	const cells = body.map(units);
	const starts = new Set();
	for (const u of cells) {
		u.forEach((c, p) => {
			if ((c === EDGE || c === BLOCK) && (p === 0 || (u[p - 1] === ' ' && u[p - 2] === ' '))) starts.add(p);
		});
	}
	const tokens = [];
	for (const m of header.matchAll(/\S+(?: \S+)*/g)) tokens.push({ text: m[0], at: m.index });
	// A header with no edge under or near it labels a column with no rows.
	for (const t of tokens) {
		if (![...starts].some((p) => p <= t.at && t.at <= p + 12)) starts.add(Math.max(0, t.at - 1));
	}
	const at = [...starts].sort((a, b) => a - b);
	const columns = at.map((start, k) => ({
		header: tokens
			.filter((t) => t.at >= (k === 0 ? 0 : start) && t.at < (at[k + 1] ?? Infinity))
			.map((t) => t.text)
			.join(' '),
		lines: [],
	}));
	for (const u of cells) {
		at.forEach((start, k) => {
			const cell = u.slice(start, at[k + 1] ?? u.length).join('').replace(/\s+$/, '');
			if (cell && (cell[0] === EDGE || cell[0] === BLOCK)) columns[k].lines.push(undrawLine(cell));
		});
	}
	return columns;
}

// ---- Keys ------------------------------------------------------------------------------------

const SYMBOL_KEYS = {
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
const MODIFIER_SYMBOLS = { '⌘': 'mod', '⌃': 'ctrl', '⌥': 'alt', '⇧': 'shift' };
const SPELLED_KEYS = {
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
const SPELLED_MODIFIERS = { mod: 'mod', cmd: 'mod', ctrl: 'ctrl', alt: 'alt', opt: 'alt', shift: 'shift' };

function parseStep(token) {
	const symbol = /^([⌘⌃⌥⇧]*)(⇥|⏎|⌫|⌦|↑|↓|←|→|⎋|[^\s])(?:×(\d+))?$/u.exec(token);
	if (symbol) {
		const mods = [...symbol[1]].map((m) => MODIFIER_SYMBOLS[m]);
		const key = SYMBOL_KEYS[symbol[2]] ?? (mods.length ? symbol[2].toLowerCase() : symbol[2]);
		return { kind: 'chord', mods, key, times: Number(symbol[3] ?? 1), source: token };
	}
	const spelled = /^([A-Za-z]+(?:-[A-Za-z]+)*)(?:×(\d+))?$/.exec(token);
	if (spelled) {
		const parts = spelled[1].toLowerCase().split('-');
		const name = parts.pop();
		const mods = parts.map((p) => SPELLED_MODIFIERS[p]);
		const key = SPELLED_KEYS[name] ?? (name.length === 1 && mods.length ? name : undefined);
		if (key !== undefined && mods.every(Boolean)) {
			return { kind: 'chord', mods, key, times: Number(spelled[2] ?? 1), source: token };
		}
	}
	return null;
}

/**
 * Parses a `keys` value: phases separated by ` | `, each a run of steps. A step is a chord
 * (`⌘⇧↓`, `mod-shift-enter`, `Home`) with an optional `×N`, or quoted text typed as characters.
 * An empty value is no phase at all.
 */
export function parseKeys(value) {
	if (!value.trim()) return [];
	return value.split(' | ').map((phase) => {
		const steps = [];
		for (const m of phase.matchAll(/"([^"]*)"|\S+/g)) {
			if (m[1] !== undefined) steps.push({ kind: 'text', text: m[1], source: m[0] });
			else {
				const step = parseStep(m[0]);
				if (!step) throw new Error(`${JSON.stringify(m[0])} is not a key`);
				steps.push(step);
			}
		}
		if (!steps.length) throw new Error('a phase with no keys');
		return steps;
	});
}

// ---- Case files ------------------------------------------------------------------------------

const PREAMBLE = {
	case: (v) => v,
	outline: (v) => choice(v, { on: true, off: false }),
	tabs: (v) => choice(v, { on: true, off: false }),
	platform: (v) => choice(v, { desktop: 'desktop', mobile: 'mobile' }),
	keys: (v) => parseKeys(v),
};

function choice(value, options) {
	if (!Object.hasOwn(options, value)) throw new Error(`${JSON.stringify(value)} is not one of ${Object.keys(options).join(', ')}`);
	return options[value];
}

/**
 * Parses a case file: a preamble of `name: value` lines, then `=== <header>` columns.
 *
 * Returns the settings, the phases, and the columns read into text and selection: `before`, the
 * optional `clipboard`, and `results`, one per phase in order. Any other column, `actual`
 * included, is kept as a reference. Errors name the file's line. With `record`, a file with no
 * result column at all is accepted: recording is what fills them in.
 */
export function parseCase(source, { record = false } = {}) {
	const lines = source.replace(/\r\n/g, '\n').split('\n');
	const settings = { title: undefined, outline: true, tabs: false, platform: undefined, keys: [] };
	let first = lines.findIndex((l) => l.startsWith('=== '));
	if (first < 0) first = lines.length;
	const fail = (i, message) => {
		throw new Error(`line ${i + 1}: ${message}`);
	};
	lines.slice(0, first).forEach((line, i) => {
		if (!line.trim()) return;
		const m = /^([a-z]+): ?(.*)$/.exec(line);
		if (!m) fail(i, `expected "name: value" before the first "=== " header, found ${JSON.stringify(line)}`);
		const [, name, value] = m;
		if (!Object.hasOwn(PREAMBLE, name)) fail(i, `unknown name ${JSON.stringify(name)} (one of ${Object.keys(PREAMBLE).join(', ')})`);
		try {
			const parsed = PREAMBLE[name](value.trim());
			if (name === 'case') settings.title = parsed;
			else settings[name] = parsed;
		} catch (e) {
			fail(i, `${name}: ${e.message}`);
		}
	});

	const columns = readColumns(lines.slice(first).join('\n')).map((c) => ({ ...c, line: c.line + first }));
	const read = (c) => {
		try {
			return readDocument(c.lines, c.line + 1);
		} catch (e) {
			throw new Error(e.message);
		}
	};
	const byName = (name) => columns.filter((c) => c.header === name);
	const [before, ...extraBefore] = byName('before');
	if (!before) throw new Error('a case file needs a "=== before" column');
	if (extraBefore.length) fail(extraBefore[0].line - 1, 'a second "before" column');
	const clipboards = byName('clipboard');
	if (clipboards.length > 1) fail(clipboards[1].line - 1, 'a second "clipboard" column');
	const resultColumns = columns.filter((c) => /^(expected|after)(\s|$)/.test(c.header));
	const phases = settings.keys;
	const wanted = Math.max(1, phases.length);
	if (resultColumns.length !== wanted && !(record && resultColumns.length === 0)) {
		throw new Error(
			`${phases.length} keys phase(s) need ${wanted} "expected" or "after" column(s), found ${resultColumns.length}`,
		);
	}
	const pastes = phases.flat().some((s) => s.kind === 'chord' && s.mods.length === 1 && s.mods[0] === 'mod' && s.key === 'v');
	if (pastes && !clipboards.length) throw new Error('⌘V needs a "=== clipboard" column');

	// A column's trailing empty lines only separate it from the next, as in `layout`.
	const trimmed = (lines) => {
		const kept = [...lines];
		while (kept.length && kept.at(-1) === '') kept.pop();
		return kept;
	};

	return {
		title: settings.title,
		outline: settings.outline,
		tabs: settings.tabs,
		platform: settings.platform,
		phases,
		before: read(before),
		clipboard: clipboards.length ? read(clipboards[0]).text : undefined,
		results: resultColumns.map((c) => ({ header: c.header, ...read(c), lines: trimmed(c.lines) })),
		beforeLines: trimmed(before.lines),
		references: columns.filter((c) => c !== before && !clipboards.includes(c) && !resultColumns.includes(c)).map((c) => c.header),
	};
}
