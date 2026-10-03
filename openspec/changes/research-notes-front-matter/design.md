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
- Validating `description` against the body; the lint checks that it is present, not that it is true.

## Decisions

**`description` is the index row, unedited.** The text is already written and reviewed, and a
reworded one would be a second change mixed into the first. OKF describes the key as one sentence and
the rows run to 1011 characters; that mismatch is recorded in the research note and left to the
rework.

**`description` is required, `title` is absent.** OKF only recommends `description`, but the index
row was the one summary every note was made to write, so a note without one would leave nothing to
find it by. `title` would copy the H1 and could drift from it, and OKF derives an absent title from
the filename; agents read the notes, and a note's first line is its heading.

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
