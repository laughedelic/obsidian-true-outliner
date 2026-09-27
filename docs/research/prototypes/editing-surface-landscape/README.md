# Editing surface, measured

The probe and the data behind the figures in
[`../../editing-surface-landscape.md`](../../editing-surface-landscape.md).

## `keys.ts.txt`: the keyboard grammar over every small note

Runs `planKey` (`src/plugin/grammar.ts`) for every structural key on every node of every
admissible forest up to `maxN` nodes, and classifies what the key did to that node from the
re-parse: its depth, its kind or heading level, its parent and position, the nodes it created, and
whether other nodes moved. A list item is also tried as a task. Split and continue are tried with
the caret at the end of the node's first line and in the middle of it; the other keys at the end.

It reuses the forest generator in
[`../placement-grammar-formalization/`](../placement-grammar-formalization/), so both files need a
`.ts` extension to run, from the repository root:

```bash
P=docs/research/prototypes/placement-grammar-formalization
D=docs/research/prototypes/editing-surface-landscape
cp $P/grammar.ts.txt $P/grammar.ts && cp $D/keys.ts.txt $D/keys.ts
npx tsx $D/keys.ts 4
rm $P/grammar.ts $D/keys.ts
```

At four nodes it makes 144,976 `planKey` calls in about 8 s.

## `issue-layers.tsv`: the tracker, classified

Every issue in the repository on 2026-09-27, one row each: its state, its `kind/` label, the layer
of the stack its defect lives in, the families it belongs to, and its title. The layer and the
families are a reading of each issue's title and body, not a label: the tracker's `area/` labels
name the code a fix touches, which is a different question. Families:

- `numbering`: ordered-list numbers and renumbering
- `places`: provisional positions and their records
- `seams`: blank lines between blocks
- `columns`: indentation units, content columns and the three-column margin
- `readers`: where our parse reads a line differently from CommonMark or Obsidian
- `second-writer`: edits Obsidian or CodeMirror make inside our transactions or keys
- `undo`: how structural edits group into undo steps
- `placement`: where a node lands and what it becomes
- `block-ids`: `^id` lines and what they attach to

The raw list comes from:

```bash
gh api 'repos/{owner}/{repo}/issues?state=all&per_page=100' --paginate \
  --jq '.[] | select(.pull_request|not) | [.number, .state, ([.labels[].name]|join(",")), .title] | @tsv'
```
