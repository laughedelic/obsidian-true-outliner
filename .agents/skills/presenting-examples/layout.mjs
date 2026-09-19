#!/usr/bin/env node
// Lays editor states out as side-by-side columns for the presenting-examples skill.
//
// Input on stdin, one column after another:
//
//   === before         a header line starts a column
//   - a
//   ▒- b               a leading ▒ marks a block-selected line
//   - «big»┃ c         «…» is a selection inside one line, drawn underlined
//   \t- d              real tabs and spaces, drawn by the rules below
//   ∅
//
// Tabs become "⏵   ". Spaces touching a tab, and spaces at the end of a line (before any
// closing ┃, ‸ or ∅), become "·"; every other space stays plain. Empty lines at the end of a
// column are dropped, so columns can be separated by an empty line; a line of spaces is content.
import { readFileSync } from 'node:fs';

const UNDERLINE = '̲';
const EDGE = '┆';
const BLOCK = '▒';
const TAB = '⏵   ';
const GAP = 3;

const width = (s) => [...s].filter((c) => c !== UNDERLINE).length;
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

function draw(raw) {
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
		.replace(/\t/g, TAB)
		.replace(/«(.*?)»/g, (_, t) => [...t].map((c) => c + UNDERLINE).join(''));
	return edge + s;
}

const columns = [];
for (const line of readFileSync(0, 'utf8').split('\n')) {
	const header = line.match(/^=== (.*)$/);
	if (header) columns.push({ header: header[1], lines: [] });
	else if (columns.length) columns.at(-1).lines.push(line);
	else if (line.trim()) throw new Error('input must start with a "=== <header>" line');
}
for (const col of columns) {
	while (col.lines.at(-1) === '') col.lines.pop();
	col.lines = col.lines.map(draw);
	col.width = Math.max(width(col.header) + 1, ...col.lines.map(width)) + GAP;
}

const rows = Math.max(...columns.map((c) => c.lines.length));
const out = [columns.map((c) => pad(' ' + c.header, c.width)).join('').trimEnd()];
for (let r = 0; r < rows; r++) {
	out.push(columns.map((c) => pad(c.lines[r] ?? '', c.width)).join('').trimEnd());
}
console.log(out.join('\n'));
