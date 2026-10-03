---
type: "research"
title: "Front matter on research notes, in place of the index"
description: "What the research index costs and returns, what the Open Knowledge Format asks of a note, and a dry run of converting every note: the figures behind replacing `docs/research/index.md` with front matter"
---

# Front matter on research notes, in place of the index

`docs/research/index.md` holds one row per note, and a new note has to add its row. Issue #340
proposes replacing it with YAML front matter on each note, following the Open Knowledge Format
(OKF). This note records what the index costs, what OKF requires, and a dry run of the conversion,
so the change rests on figures.

## What the index costs

The maintainer's retrospective of about 175 agent sessions (private; the figures are quoted in
#340) found:

- Of the 9 PRs merged on 2026-09-29, 7 touched `index.md`. `merge=union` duplicated a row whenever
  `main` had reworded one, in #298, #300, #276 and #205, and each session wrote its own resolver.
- Across 159 archived transcripts, about 35 sessions touched `index.md`: 57 commands resolved
  merges in it, 25 ran its lint, 9 edited it, and about 6 reads and 10 greps looked something up.
  92 sessions went straight to notes, with about 860 reads and greps of individual files. The
  archive is a sample, so these are proportions.

## What OKF requires

Read from `SPEC.md` in `GoogleCloudPlatform/open-knowledge-format` (v0.2; the copy in
`GoogleCloudPlatform/knowledge-catalog/okf` is a frozen snapshot):

- A bundle is a directory of Markdown files, each opening with a YAML front-matter block.
- `type` is the only required key, a non-empty string. A file carrying only `type` conforms.
- `title`, `description`, `resource` and `tags` are recommended. `description` is "a single-sentence
  summary used by index generators and search snippets". `tags` is a list of strings. `resource`
  is a URI for the underlying asset and is omitted for abstract concepts, which a note is.
- Timestamp-valued keys are ISO 8601 with an explicit UTC offset. The announcing blog post lists a
  `timestamp` key; the v0.2 text we read names `generated.at`, `verified[].at` and `last_modified`
  and does not define a key by the name `timestamp`. We do not use one.
- `index.md` and `log.md` are reserved filenames. Removing our `index.md` frees the name.
- Conformance is every non-reserved `.md` file having parseable front matter with a `type`.
  Consumers must not reject a bundle for unknown keys or missing optional fields.

`docs/research/README.md` is a non-reserved `.md` file, so it takes front matter as well. We use
`type: research` on every file, the README included, since OKF leaves the values free.

## Dry run

A script built each note's block from its current index row and H1, and parsed the result back with
the `yaml` package, which the repository already depends on (`sync-labels.ts`). Run on 2026-10-03
against `main` at `fc7ca4d`:

| Measure | Result |
| --- | --- |
| Markdown files in `docs/research/` besides `index.md` | 71: 70 notes and `README.md` |
| Notes with an index row | 70 of 70; no row without a file |
| Files with an H1 on which `title` could be taken | 71 of 71 |
| Blocks that parse back to the values put in | 71 of 71, written as double-quoted scalars |
| Rows containing a character that needs quoting in a plain scalar (`:`, `` ` ``, `*`, `[`, …) | 64 of 70 |
| Longest row | 1011 characters |
| Rows over 300 characters | 49 of 70 |

The rows are paragraphs, not the one sentence OKF describes. Taking them verbatim keeps the
information the index carried; shortening them is a separate editorial pass.

Obsidian's Properties view, checked by the maintainer on the sample note, does not render bold
markup in a `description` and truncates a long one, with most of it still visible. Nothing in
`scripts/`, `src/`, `tests/` or the workflows reads `docs/research/*.md` apart from the lint.
