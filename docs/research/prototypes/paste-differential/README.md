# Paste differential

The probe behind "The differential check" in
[`../../obsidian-smart-list-paste.md`](../../obsidian-smart-list-paste.md). It pastes every
combination of a set of clipboard entries into two empty notes side by side, one with outline mode
off (Obsidian's own paste, the oracle) and one with outline mode on (the plugin's paste handler), and
records the text each inserts. An empty note has no list prefix, so Obsidian 1.14.4's marker collapse
does not reach either side, and the comparison is of the text each paste chooses.

`probe.js` runs inside a driven Obsidian (`.agents/skills/driving-obsidian`), with the build to test
in the working tree. It starts the sweep and returns, since one evaluation must answer within 20 s:

```bash
OBSIDIAN_VERSION=1.14.4 npm run drive -- start
npm run drive -- eval - < docs/research/prototypes/paste-differential/probe.js
npm run drive -- eval 'JSON.stringify(window.__pasteDiff.progress)'   # until "status":"done"
npm run drive -- eval 'JSON.stringify(window.__pasteDiff.rows)' | tail -1 > /tmp/rows.json
npm run drive -- eval 'JSON.stringify(window.__pasteDiff.axes)' | tail -1 > /tmp/axes.json
npm run drive -- stop
```

`analyse.test.ts.txt` sorts the rows into verdicts with the parser the classifier uses. Copy it into
`tests/` and run it once per build:

```bash
cp docs/research/prototypes/paste-differential/analyse.test.ts.txt tests/zz-paste-diff.test.ts
ROWS=/tmp/rows.json AXES=/tmp/axes.json npx vitest run tests/zz-paste-diff.test.ts
rm tests/zz-paste-diff.test.ts
```

The axes: seven plain texts (none, nested and first-line-indented lists, paragraphs, a lone item, a
URL, CRLF line breaks), Markdown or none, eight HTML clipboards (none, a list, Obsidian's own copy, a
list with an image from a web address, with a 1200-character `data:` image, with a `javascript:` link,
a lone image, paragraphs), three `text/uri-list` values (none, the plain text, another URL), and a PNG
file or none: 672 clipboards. A `clipboardInputFilter` that appends `⟦F⟧` is registered for the run,
so a row shows which branch each paste took.
