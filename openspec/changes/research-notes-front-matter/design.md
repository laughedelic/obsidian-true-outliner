## Context

The index exists so a note can be found and so a new note has one place to be announced. Sessions
found notes by reading and grepping them directly, and the announcement is what made PRs collide
([`research-note-front-matter`](../../../docs/research/research-note-front-matter.md)). OKF puts the
same metadata on the note itself, so adding a note touches only that file.

## Goals / Non-Goals

**Goals:**

- Adding a note touches one file, and two branches adding notes cannot conflict.
- The metadata each index row carried is not lost.
- A note without a `type` fails `npm run lint`.

**Non-Goals:**

- Generating an index from the front matter. Nothing reads one today.
- Validating `title` or `description` against the body; they are optional in OKF.

## Decisions

**`description` is the index row, unedited.** The text is already written and reviewed, and a
reworded one would be a second change mixed into the first. OKF describes the key as one sentence and
the rows run to 1011 characters; that mismatch is recorded in the research note and left to the
rework.

**`title` is the H1, copied.** OKF derives an absent title from the filename, which loses the
subject line the notes already have. The copy can drift from the heading; the lint does not compare
them, because a note's heading is its own to reword.

**The block is a double-quoted scalar per key.** 64 of the 70 rows contain a character that a plain
scalar mishandles, so one quoting rule avoids deciding per row.

**`type` is `research` on every file, `README.md` included.** OKF leaves values free, and one
short value needs no rule for which file takes which.

**The lint parses with `yaml`**, already a dependency, rather than matching `^type:`. A block that
does not parse is the failure the check is for, and a regular expression would pass `type: ` with
nothing after it.

**The lint covers every `.md` file in the directory,** as OKF's conformance rule does, so the old
`NOT_NOTES` list goes away with `index.md`.

## Risks / Trade-offs

- **Parallel PRs that add a note and an index row** conflict with the deletion. Rebase them and
  drop the row; the conflict is one file and the fix is mechanical.
- **Properties view in Obsidian** shows the block for anyone who opens the notes in a vault. The
  maintainer looked at the sample: bold markup in a `description` does not render and a long one is
  truncated, but most of it is visible.
