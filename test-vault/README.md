# True Outliner test vault

A realistic journal-style vault for manual testing, e2e automation, and demos.
The notes belong to a fictional product designer juggling a work project, a kitchen
renovation, and trail-race training — with enough structural diversity to exercise
every mapping rule.

## Setup

```sh
npm run vault:install   # builds the plugin and copies it into .obsidian/plugins
```

Open this folder as a vault, turn off restricted mode, and True Outliner is enabled.
Then follow `openspec/changes/editor-core/verification.md`.

## What exercises what

| Note | Exercises |
| --- | --- |
| `Journal/2026-07-06` | flat prose (paragraphs only) — the universal outline demo |
| `Journal/2026-07-08` | paragraph-with-following-list (attachment rule), tasks |
| `Journal/2026-07-10` | mixed headings/paragraphs/lists, callout, block id |
| `Journal/2026-07-12` | deep nested lists (tabs), multiline items, ordered list |
| `People/*` | frontmatter, short mixed notes, backlink targets |
| `Projects/Aurora Dashboard` | full tree: skipped heading levels, table, code fence |
| `Projects/Kitchen Renovation` | ordered lists, embeds, quote |
| `Projects/Trail Race Training` | setext headings, h6 bound case |
| `Notes/Sourdough Log` | list-only note (visually unchanged in outline mode) |
| `Notes/Reading – The Design of Everyday Things` | quotes, multiline items |
| `Notes/Edge Case Zoo` | adversarial structures for rejection cues |
