import fc from 'fast-check';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  drawDocument,
  layout,
  parseCase,
  parseKeys,
  readColumns,
  readDocument,
  stack,
  undraw,
} from '../scripts/notation.ts';
import { DRAWN, GOLD } from './notation-fixtures';

const draw = (text: string, anchor: number, head = anchor) =>
  drawDocument({ text, ranges: [{ anchor, head }] });

const chars = fc.constantFrom('a', 'b', ' ', '\t', '-', '\n', '\n');
const state = fc
  .array(chars, { maxLength: 24 })
  .map((cs) => cs.join(''))
  .chain((text) =>
    fc.record({
      text: fc.constant(text),
      anchor: fc.integer({ min: 0, max: text.length }),
      head: fc.integer({ min: 0, max: text.length }),
    }),
  );

describe('layout', () => {
  // What the layout script printed before the module, but for a tab, which is now `→ `.
  for (const [name, { input, output }] of Object.entries(GOLD)) {
    it(`prints side by side as before: ${name}`, () => {
      expect(layout(readColumns(input)) + '\n').toBe(output);
    });
  }
});

describe('reading a column', () => {
  it('reads the caret, and the text with the final newline a note ends in', () => {
    expect(readDocument(['- a', '- b┃'])).toEqual({
      text: '- a\n- b\n',
      selection: { anchor: 7, head: 7 },
      blockLines: [],
    });
  });

  it('reads a touching caret as the head of a selection, and the end as the default head', () => {
    expect(readDocument(['a «bc»┃']).selection).toEqual({ anchor: 2, head: 4 });
    expect(readDocument(['a ┃«bc»']).selection).toEqual({ anchor: 4, head: 2 });
    expect(readDocument(['a «bc»']).selection).toEqual({ anchor: 2, head: 4 });
  });

  it('reads a selection that closes on a later line as one range with the line breaks in it', () => {
    const doc = readDocument(['- «foo', '  bar', '- baz»┃', '- qux']);
    expect(doc.text).toBe('- foo\n  bar\n- baz\n- qux\n');
    expect(doc.selection).toEqual({ anchor: 2, head: 17 });
    expect(doc.text.slice(2, 17)).toBe('foo\n  bar\n- baz');
  });

  it('reads ∅ after a line as no final newline, and on a line of its own as an empty last line', () => {
    expect(readDocument(['a┃∅']).text).toBe('a');
    expect(readDocument(['a', '∅']).text).toBe('a\n');
    expect(readDocument(['a', '', '∅']).text).toBe('a\n\n');
    expect(readDocument(['a']).text).toBe('a\n');
    expect(readDocument(['a', '┃∅'])).toMatchObject({ text: 'a\n', selection: { anchor: 2, head: 2 } });
  });

  it('reads ▒ as a block-selected line with no range', () => {
    expect(readDocument(['- a', '▒- b', '∅'])).toEqual({
      text: '- a\n- b\n',
      selection: null,
      blockLines: [1],
    });
  });

  it('reads ‸ as the caret when the column has no ┃', () => {
    expect(readDocument(['a‸b']).selection).toEqual({ anchor: 1, head: 1 });
    expect(readDocument(['a‸b┃']).selection).toEqual({ anchor: 2, head: 2 });
  });

  it.each([
    ['a second caret', ['a┃', 'b┃'], 'line 2: a second caret'],
    ['an unclosed «', ['a«b', 'c'], 'line 2: « without »'],
    ['» without «', ['ab»'], 'line 1: » without «'],
    ['a caret away from its selection', ['«a»b┃'], 'the caret must touch the selection'],
    ['∅ off the last line', ['a∅', 'b'], 'line 1: ∅ is not on the last line'],
    ['a block selection with a caret', ['▒a┃'], 'line 1: a block selection has no caret'],
  ])('refuses %s, naming the line', (_name, lines, message) => {
    expect(() => readDocument(lines)).toThrow(message);
  });

  it('counts errors from the first line it is given', () => {
    expect(() => readDocument(['a', 'b┃┃'], 10)).toThrow('line 11: a second caret');
  });
});

describe('drawing a state', () => {
  it('draws a forward and a backward selection with the caret at the head', () => {
    expect(draw('a bc d\n', 2, 4)).toEqual(['a «bc»┃ d']);
    expect(draw('a bc d\n', 4, 2)).toEqual(['a ┃«bc» d']);
  });

  it('draws a selection across lines from its opening « to its closing »', () => {
    const lines = draw('- foo\n  bar\n- baz\n', 2, 17);
    expect(lines).toEqual(['- «foo', '  bar', '- baz»┃']);
    const under = (s: string) => [...s].map((c) => c + '\u0332').join('');
    expect(layout([{ header: 's', lines }])).toBe(
      [' s', '┆- ' + under('foo'), '┆' + under('  bar'), '┆' + under('- baz') + '┃'].join('\n'),
    );
  });

  it('draws ▒ and no caret over a block selection', () => {
    expect(drawDocument({ text: '- a\n- b\n', ranges: [{ anchor: 4, head: 7 }], blockLines: [1] })).toEqual([
      '- a',
      '▒- b',
    ]);
  });

  it('leaves ∅ off exactly when reading supplies it', () => {
    expect(draw('a\n', 1)).toEqual(['a┃']);
    expect(draw('a', 1)).toEqual(['a┃∅']);
    expect(draw('a\n', 2)).toEqual(['a', '┃∅']);
    expect(draw('a\n\n', 1)).toEqual(['a┃', '', '∅']);
    expect(draw('', 0)).toEqual(['┃∅']);
    expect(drawDocument({ text: '\n' })).toEqual(['', '∅']);
  });

  it('draws the main range only', () => {
    expect(
      drawDocument({
        text: 'ab\n',
        ranges: [
          { anchor: 1, head: 1 },
          { anchor: 0, head: 2 },
        ],
      }),
    ).toEqual(['a┃b']);
  });
});

describe('reading what was drawn', () => {
  it('returns the text and the selection for any text and any range', () => {
    fc.assert(
      fc.property(state, ({ text, anchor, head }) => {
        const back = readDocument(draw(text, anchor, head));
        expect(back.text).toBe(text);
        expect(back.selection).toEqual({ anchor, head });
      }),
      { numRuns: 500 },
    );
  });

  it('returns the text and the selection after being laid out and read as a drawn block', () => {
    // A line break has no underline of its own, so a selection that starts at the end of a line or
    // ends at the start of one draws the same as a shorter one and cannot be read back.
    const visible = ({ text, anchor, head }: { text: string; anchor: number; head: number }) => {
      const [from, to] = [Math.min(anchor, head), Math.max(anchor, head)];
      return from === to || (text[from] !== '\n' && text[to - 1] !== '\n');
    };
    fc.assert(
      fc.property(state.filter(visible), ({ text, anchor, head }) => {
        const [column] = undraw(layout([{ header: 'x', lines: draw(text, anchor, head) }]));
        const back = readDocument(column?.lines ?? []);
        expect(back.text).toBe(text);
        expect(back.selection).toEqual({ anchor, head });
      }),
      { numRuns: 500 },
    );
  });

  it('returns the text and the block lines for a block selection', () => {
    fc.assert(
      fc.property(state, ({ text }) => {
        const lines = text.split('\n').length - 1;
        const blockLines = lines > 0 ? [0] : [];
        const back = readDocument(drawDocument({ text, blockLines }));
        expect(back.text).toBe(text);
        expect(back.blockLines).toEqual(blockLines);
      }),
      { numRuns: 300 },
    );
  });
});

describe('the stacked form', () => {
  const columns = [
    { header: 'before', lines: ['- a', '\t- b  ', '▒- c┃'] },
    { header: 'after', lines: ['- «x»┃', '∅'] },
  ];

  it('prints each column under its header with only the whitespace made visible', () => {
    expect(stack(columns)).toBe(
      ['before', '```', '- a', '→ - b··', '▒- c┃', '```', '', 'after', '```', '- «x»┃', '∅', '```'].join('\n'),
    );
  });

  it('reads back into the columns it was drawn from', () => {
    expect(undraw(stack(columns))).toEqual(columns);
  });

  it('opens a longer fence when a line holds backticks', () => {
    const out = stack([{ header: 'x', lines: ['a ``` b'] }]);
    expect(out.split('\n')[1]).toBe('````');
    expect(undraw(out)).toEqual([{ header: 'x', lines: ['a ``` b'] }]);
  });

  it('keeps a lone arrow in the text and reads a tab whose padding a trim removed', () => {
    expect(undraw(['x', '```', 'a→b', 'c →', '```'].join('\n'))[0]?.lines).toEqual(['a→b', 'c \t']);
  });

  it('returns the text and the selection after being stacked and read', () => {
    fc.assert(
      fc.property(state, ({ text, anchor, head }) => {
        const [column] = undraw(stack([{ header: 'x', lines: draw(text, anchor, head) }]));
        const back = readDocument(column?.lines ?? []);
        expect(back.text).toBe(text);
        expect(back.selection).toEqual({ anchor, head });
      }),
      { numRuns: 500 },
    );
  });
});

describe('reading a drawn block', () => {
  for (const [name, block] of Object.entries(DRAWN)) {
    it(`gives columns that lay out to the same rows: ${name}`, () => {
      const columns = undraw(block);
      const again = layout(columns);
      const rows = (s: string) => s.split('\n').filter((l) => l.trim());
      // A hand alignment chose its own padding; the cells are what must survive. A tab is drawn
      // differently now, so a block that has one is held to its rows and its columns only.
      const cells = (s: string) => rows(s).map((l) => l.trim().split(/ {2,}/));
      expect(rows(again).length).toBe(rows(block).length);
      if (!block.includes('⏵')) expect(cells(again)).toEqual(cells(block));
      expect(undraw(again)).toEqual(columns);
    });
  }

  it('reads a tab, a touching space and an underline back to the literal document', () => {
    const block = layout([{ header: 'x', lines: ['\t  - «ab»┃ c  '] }]);
    expect(undraw(block)).toEqual([{ header: 'x', lines: ['\t  - «ab»┃ c  '] }]);
  });

  it('reads a selection across lines back as one selection, empty lines inside it included', () => {
    for (const lines of [
      ['- «foo', '  bar', '- baz»┃', '- qux'],
      ['«a', '', 'b»┃'],
      ['┃«a', '\t- b»'],
    ]) {
      const [column] = undraw(layout([{ header: 'x', lines }]));
      expect(column?.lines).toEqual(lines);
      expect(readDocument(column?.lines ?? []).selection).not.toBeNull();
    }
  });

  it('reads a tab that is underlined, that ends a line, or that follows a space', () => {
    for (const lines of ['\t«1»', '«\t1»', '1«\t»', '1\t', ' «\t»┃'].map((l) => [l])) {
      expect(undraw(layout([{ header: 'x', lines }]))[0]?.lines).toEqual(lines);
    }
  });

  it('reads the tab that earlier drawings wrote, and the arrow that draws it now', () => {
    const old = ' x\n┆⏵   - a\n┆- b⏵\n';
    expect(undraw(old)[0]?.lines).toEqual(['\t- a', '- b\t']);
    expect(undraw(layout([{ header: 'x', lines: ['\t- a', '- b\t'] }]))[0]?.lines).toEqual(['\t- a', '- b\t']);
  });

  it('reads a block-selected line with its ▒', () => {
    const [before] = undraw(layout([{ header: 'before', lines: ['- a', '▒- b'] }]));
    expect(before?.lines).toEqual(['- a', '▒- b']);
  });
});

describe('keys', () => {
  it('parses chords, spelled keys, repeats and quoted text into phases', () => {
    expect(parseKeys('⇥ | ⇧⇥')).toHaveLength(2);
    const [phase] = parseKeys('⌘⇧↓ Home ⇧↓×2 mod-shift-enter "hi there" n');
    expect(phase?.map((s) => (s.kind === 'chord' ? [s.mods.join('+'), s.key, s.times] : [s.text]))).toEqual([
      ['mod+shift', 'ArrowDown', 1],
      ['', 'Home', 1],
      ['shift', 'ArrowDown', 2],
      ['mod+shift', 'Enter', 1],
      ['hi there'],
      ['', 'n', 1],
    ]);
  });

  it('reads ⌘A as Mod and the letter a', () => {
    expect(parseKeys('⌘A')[0]?.[0]).toMatchObject({ mods: ['mod'], key: 'a' });
  });

  it('has no phase for an empty value', () => {
    expect(parseKeys('')).toEqual([]);
  });

  it.each(['⇥⇥⇥', 'blah', 'mod-blah', '⇥ | ', '| ⇥', '⇥ | | ⇥', '⇥×', '⇥×0', '⌘', '⇧⌘', '⌘⌘', '⇧', '|'])(
    'refuses %j',
    (value) => {
      expect(() => parseKeys(value)).toThrow();
    },
  );

  it('keeps a quoted text whole, a bar inside it included', () => {
    const phases = parseKeys('"a | b" | ⇥');
    expect(phases).toHaveLength(2);
    expect(phases[0]?.[0]).toMatchObject({ kind: 'text', text: 'a | b' });
  });
});

describe('case files', () => {
  const file = (preamble: string, columns: string) => `${preamble}\n\n${columns}`;
  const OK = '=== before\n- a┃\n=== after ⇥\n- a┃\n=== after ⇧⇥\n- a┃\n';

  it('parses a title, settings, phases and one result column per phase', () => {
    const c = parseCase(file('case: two keys\ntabs: on\nkeys: ⇥ | ⇧⇥', OK));
    expect(c).toMatchObject({ title: 'two keys', tabs: true, outline: true, platform: undefined });
    expect(c.phases).toHaveLength(2);
    expect(c.results.map((r) => r.header)).toEqual(['after ⇥', 'after ⇧⇥']);
    expect(c.before.selection).toEqual({ anchor: 3, head: 3 });
  });

  it('takes one result column when there is no keys line', () => {
    const c = parseCase('=== before\n- a┃\n=== expected\n- a┃\n');
    expect(c.phases).toEqual([]);
    expect(c.results).toHaveLength(1);
  });

  it('ignores an actual column and any other header, listing them as references', () => {
    const c = parseCase('keys: ⇥\n=== before\na┃\n=== actual\nb\n=== this PR\nc\n=== expected\nd\n');
    expect(c.results).toHaveLength(1);
    expect(c.references).toEqual(['actual', 'this PR']);
  });

  it('reads the clipboard column as text', () => {
    const c = parseCase('keys: ⌘V\n=== clipboard\nx\n  y\n=== before\na┃\n=== expected\nb\n');
    expect(c.clipboard).toBe('x\n  y\n');
  });

  it.each([
    ['an unknown value', 'tabs: yes\n\n' + '=== before\na\n=== expected\na\n', 'line 1: tabs:'],
    ['an unknown name', 'colour: red\n\n' + '=== before\na\n=== expected\na\n', 'line 1: unknown name "colour"'],
    ['a step that is not a key', 'keys: ⇥⇥⇥\n\n=== before\na\n=== expected\na\n', 'line 1: keys:'],
    ['a stray line in the preamble', 'hello\n=== before\na\n=== expected\na\n', 'line 1: expected "name: value"'],
    ['a paste with no clipboard', 'keys: ⌘V\n=== before\na\n=== expected\na\n', '⌘V needs a "=== clipboard" column'],
    ['too few result columns', 'keys: ⇥ | ⇧⇥ | ⇥\n=== before\na\n=== after 1\na\n=== after 2\na\n', '3 keys phase(s) need 3'],
    ['no before', 'keys: ⇥\n=== expected\na\n', 'needs a "=== before" column'],
  ])('refuses %s', (_name, source, message) => {
    expect(() => parseCase(source)).toThrow(message);
  });

  it('refuses a name given twice and a keys value with an empty phase, as parseCase reads them', () => {
    expect(() => parseCase('keys: ⇥\nkeys: ⇧⇥\n=== before\na\n=== expected\na\n')).toThrow('line 2: keys is given twice');
    expect(() => parseCase('keys: ⇥ |\n=== before\na\n=== after\na\n=== after 2\na\n')).toThrow('line 1: keys:');
  });

  it('reads a header with trailing spaces as its name', () => {
    expect(parseCase('=== before  \na┃\n=== expected \na\n').results).toHaveLength(1);
  });

  it('draws a case file for the manual-test section, even a title holding "=== " and no result column', () => {
    const script = path.join(__dirname, '..', 'scripts', 'layout.ts');
    const out = execFileSync('node', [script, '--case'], {
      input: 'case: a === b\nkeys: ⇥\n\n=== before\n- a┃\n',
      encoding: 'utf8',
    });
    expect(out).toBe(['a === b', 'keys: ⇥ · outline on · tabs off · desktop and mobile', 'before', '```', '- a┃', '```', ''].join('\n'));
  });

  describe('known-failing', () => {
    const MARKED = 'case: waits\nknown-failing: #228\nkeys: ⏎\n\n=== before\n1. a┃\n=== expected ⏎\n1. a\n2. ┃\n=== actual ⏎\n1. a┃\n';

    it('parses the issue and reads actual as a drawn state, not a reference', () => {
      const c = parseCase(MARKED);
      expect(c.knownFailing).toBe(228);
      expect(c.actual).toMatchObject({ header: 'actual ⏎', text: '1. a\n', selection: { anchor: 4, head: 4 } });
      expect(c.references).toEqual([]);
      expect(c.results.map((r) => r.header)).toEqual(['expected ⏎']);
    });

    it('takes an actual whose header names keys, as a recording does', () => {
      const c = parseCase('known-failing: #7\nkeys: ⇥ | ⌘Z\n=== before\na┃\n=== after ⇥\nb┃\n=== after ⌘Z\nc┃\n=== actual ⌘Z\nd┃\n');
      expect(c.actual?.header).toBe('actual ⌘Z');
    });

    it('leaves an unmarked file with no issue and its actual among the references', () => {
      const c = parseCase('=== before\na┃\n=== expected\nb┃\n=== actual\nc┃\n');
      expect(c.knownFailing).toBeUndefined();
      expect(c.actual).toBeUndefined();
      expect(c.references).toEqual(['actual']);
    });

    it.each([
      ['a number with no #', 'known-failing: 228', 'line 2: known-failing: "228" is not # and an issue number'],
      ['a platform after the number', 'known-failing: #228 desktop', 'line 2: known-failing: "#228 desktop"'],
      ['no number', 'known-failing: #', 'line 2: known-failing: "#"'],
    ])('refuses %s, naming its line', (_name, line, message) => {
      expect(() => parseCase(`keys: ⏎\n${line}\n=== before\na┃\n=== expected\nb┃\n=== actual\nc┃\n`)).toThrow(message);
    });

    it('refuses the name given twice', () => {
      expect(() => parseCase('known-failing: #1\nknown-failing: #2\n=== before\na┃\n=== expected\nb\n=== actual\nc\n')).toThrow(
        'line 2: known-failing is given twice',
      );
    });

    it('refuses a marked file with no actual column, or two', () => {
      const body = '=== before\na┃\n=== expected\nb┃\n';
      expect(() => parseCase(`known-failing: #1\n${body}`)).toThrow('known-failing: #1 needs an "=== actual" column');
      expect(() => parseCase(`known-failing: #1\n${body}=== actual\nc\n=== actual ⏎\nd\n`)).toThrow('a second "actual" column');
    });

    it('accepts a marked file with no actual when recording, and still wants its result columns', () => {
      const c = parseCase('known-failing: #1\n=== before\na┃\n=== expected\nb┃\n', { record: true });
      expect(c.knownFailing).toBe(1);
      expect(c.actual).toBeUndefined();
      expect(() => parseCase('known-failing: #1\nkeys: ⇥\n=== before\na┃\n', { record: true })).toThrow('need 1 "expected" or "after" column');
      // An unmarked recording still takes none.
      expect(parseCase('keys: ⇥\n=== before\na┃\n', { record: true }).results).toEqual([]);
    });

    it('draws the marker on the setup line of a case drawn for a manual test', () => {
      const script = path.join(__dirname, '..', 'scripts', 'layout.ts');
      const out = execFileSync('node', [script, '--case'], { input: MARKED, encoding: 'utf8' });
      expect(out.split('\n').slice(0, 2)).toEqual(['waits', 'keys: ⏎ · outline on · tabs off · desktop and mobile · known-failing #228']);
      expect(out).toContain('actual ⏎');
    });
  });

  it('names the file line of a malformed column', () => {
    expect(() => parseCase('keys: ⇥\n\n=== before\na┃\nb┃\n=== expected\na\n')).toThrow('line 5: a second caret');
  });
});
