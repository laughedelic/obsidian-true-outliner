# Paste differential

The probe behind "The extended check: the empty item, the settings and a drop" in
[`../../obsidian-smart-list-paste.md`](../../obsidian-smart-list-paste.md). It pastes every
combination of a set of clipboard entries, as synthetic `paste` events, with outline mode off
(Obsidian's own paste) and on (the plugin's paste handler), at two destinations: an empty note, and
the empty item of `- A` / `- `. The empty item is pasted at under the four combinations of "Smart
lists" and "Convert pasted HTML to Markdown", and dropped on with the defaults.

The oracle is a third editor: Obsidian's paste into an empty note with outline mode off and the
conversion on, of the clipboard, or of its plain text alone where Obsidian's paste would insert the
files. That is the text outline mode takes, by the maintainer's decisions: a list beside a file is
taken as text, and HTML is converted whatever the setting says. An empty note has no list prefix, so
1.14.4's marker collapse does not reach the oracle.

`probe.js` runs inside a driven Obsidian (`.agents/skills/driving-obsidian`), with the build to test
in the working tree. It starts the sweep and returns, since one evaluation must answer within 20 s:

```bash
OBSIDIAN_VERSION=1.14.4 npm run drive -- start
npm run drive -- eval - < docs/research/prototypes/paste-differential/probe.js
npm run drive -- eval 'JSON.stringify(window.__pasteDiff.progress)'   # until "status":"done"
npm run drive -- eval 'JSON.stringify({rows: window.__pasteDiff.rows, axes: window.__pasteDiff.axes, settings: window.__pasteDiff.settings})' \
  | tail -1 > /tmp/rows-1.14.4.json
npm run drive -- stop
```

Start a fresh Obsidian for each run: the probe registers a `clipboardInputFilter`, and a second run in
the same session registers it twice. `window.__pasteDiffLimit = 20`, evaluated first, runs a short
sweep for trying the probe out.

`analyse.test.ts.txt` sorts the pastes into verdicts with the parser the classifier uses, and, given
the other build's rows, lists every outline-mode result that differs between the builds. Copy it into
`tests/` and run it once per build:

```bash
cp docs/research/prototypes/paste-differential/analyse.test.ts.txt tests/zz-paste-diff.test.ts
ROWS=/tmp/rows-1.14.4.json OTHER=/tmp/rows-1.13.7.json npx vitest run tests/zz-paste-diff.test.ts
rm tests/zz-paste-diff.test.ts
```

A verdict marked ✗ is a paste where outline mode does something other than the rule it is held to:

- a structural oracle text is taken, and the text the handler inserts equals it;
- a non-structural text whose first line is a list item lands on the empty item as the marker rule
  writes it;
- other converted HTML is inserted as it is;
- anything else is left to Obsidian, which the enforcement may then rewrite as it does without the
  handler;

and, given the other build's rows, every outline-mode result is the same on both builds, and a
paste outline mode takes gives the same result under every setting.

The axes: seven plain texts (none, nested and first-line-indented lists, paragraphs, a lone item, a
URL, CRLF line breaks), Markdown or none, ten HTML clipboards (none, a list, Obsidian's own copy, a
list with an image from a web address, with a 1200-character `data:` image, with a `javascript:`
link, a lone image, paragraphs, a lone item in bold, a code editor's copy), three `text/uri-list`
values (none, the plain text, another URL), and a PNG file or none: 840 clipboards, 3360 pastes at
the item, about 7 minutes a build. A `clipboardInputFilter` that appends `⟦F⟧` is registered for
the run, so a row shows which branch each paste took.
