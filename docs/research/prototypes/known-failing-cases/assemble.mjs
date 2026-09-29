// Builds a case file from a block read back by extract.mjs: a preamble (title, keys, settings),
// the columns with the headers a case file gives its roles (the tracker's "after ⇧⇥" is what
// happened, which a case file reads as what should), and the few edits that put the drawn caret
// where the issue's reproduction puts it.
//
//   node assemble.mjs <cols-dir> <out-dir>
import { mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
const [S, OUT] = process.argv.slice(2);
const read = (b) => {
  const cols = []; let cur = null;
  for (const line of readFileSync(`${S}/${b}.cols`, 'utf8').split('\n')) {
    if (line.startsWith('=== ')) { cur = { header: line.slice(4), lines: [] }; cols.push(cur); }
    else if (cur) cur.lines.push(line);
  }
  for (const c of cols) while (c.lines.length && c.lines.at(-1) === '') c.lines.pop();
  return cols;
};
// spec: name, block, preamble, rename {old: new}, edit {header: fn(lines)}, add [{header, lines, at}]
mkdirSync(OUT, { recursive: true });
const specs = [
  { name: '228-1', block: '228-1', pre: ['case: an edit in one ordered list does not renumber the list after it (#228)', 'keys: ⏎'] },
  { name: '228-2-as-drawn', block: '228-2', pre: ['case: a pasted ordered item beside a run written with the other delimiter (#228)', 'keys: ⌘V'] },
  { name: '198-1', block: '198-1', pre: ['case: a paragraph pasted from column 4 to the margin stays a paragraph (#198)', 'keys: ⌘V'] },
  { name: '275-1', block: '275-1', pre: ['case: a Backspace merge right after typing is its own undo step (#275)', 'keys: ⌫ ⌫ | ⌘Z'],
    rename: { '⌫ ⌫': 'after ⌫ ⌫', '⌘Z expected': 'after ⌘Z', '⌘Z actual': 'actual ⌘Z' } },
  { name: '255-1', block: '255-1', pre: ['case: outdenting a later child leaves the quote above it flush (#255)', 'keys: ⇧⇥'], rename: { 'after ⇧⇥': 'actual' } },
  { name: '255-2', block: '255-2', pre: ['case: indenting a quote under an item adds no blank line (#255)', 'keys: ⇥'], rename: { 'after ⇥': 'actual' } },
  { name: '244-1', block: '244-1', pre: ['case: a pasted subtree moved right keeps a tab-indented child under its parent (#244)', 'keys: ⌘V'],
    edit: { before: (l) => l.map((x) => (x === '  1. b' ? '  1. b┃' : x)) } },
  { name: '215-1', block: '215-1', pre: ['case: a paragraph indented into a tab list moves its children in tabs (#215)', 'tabs: on', 'keys: ⇥'],
    edit: { before: (l) => l.map((x) => (x === 'Para.' ? 'Para.┃' : x)) } },
  { name: '272-1', block: '272-1', pre: ['case: a run pasted at a tight list\'s last item keeps the list tight (#272)', 'keys: ⌘V'],
    edit: { before: (l) => l.map((x) => (x === '- b' ? '- b┃' : x)) },
    add: [{ header: 'clipboard', lines: ['- x'], at: 0 }] },
  { name: '279-2', block: '279-2', pre: ['case: a task pasted after a list item\'s paragraph child is accepted (#279)', 'keys: ⌘V'],
    custom: [
      { header: 'clipboard', lines: ['- [ ] t'] },
      { header: 'before', lines: ['- x', '', '  P┃'] },
      { header: 'expected', lines: ['- x', '', '  P', '  - [ ] t'] },
    ] },
  { name: '278-3', block: '278-3', pre: ['case: Tab on a paragraph after a list item\'s paragraph is refused (#278)', 'keys: ⇥'],
    custom: [
      { header: 'before', lines: ['- x', '', '  P', '', '  Q┃'] },
      { header: 'expected', lines: ['- x', '', '  P', '', '  Q'] },
    ] },
  { name: '278-2', block: '278-2', pre: ['case: Tab on a list item after a list item\'s paragraph is refused (#278)', 'keys: ⇥'],
    custom: [
      { header: 'before', lines: ['- x', '', '  P', '', '  - y┃'] },
      { header: 'expected', lines: ['- x', '', '  P', '', '  - y'] },
    ] },
  { name: '146-1', block: '146-1', pre: ['case: leaving a table upward lands on the line above in one press (#146)', 'keys: ↑'],
    rename: { 'actual ↑': 'actual', 'expected ↑': 'expected' }, drop: ['actual ↑ ↑'] },
  { name: '115-1', block: '115-1', pre: ['case: delete to line start at the end of a childless paragraph empties the line (#115)', 'keys: ⌘⌫'] },
  { name: '261-1', block: '261-1', pre: ['case: a lazy continuation line is one node (#261)'] },
];
for (const s of specs) {
  let cols = s.custom ?? read(s.block);
  if (!s.custom) {
    cols = cols.filter((c) => !(s.drop ?? []).includes(c.header)).map((c) => ({ ...c, header: (s.rename ?? {})[c.header] ?? c.header }));
    for (const [h, fn] of Object.entries(s.edit ?? {})) cols = cols.map((c) => (c.header === h ? { ...c, lines: fn(c.lines) } : c));
    for (const a of s.add ?? []) cols.splice(a.at, 0, a);
  }
  const out = [...s.pre, '', ...cols.flatMap((c) => [`=== ${c.header}`, ...c.lines])];
  writeFileSync(`${OUT}/${s.name}.case`, out.join('\n') + '\n');
}
