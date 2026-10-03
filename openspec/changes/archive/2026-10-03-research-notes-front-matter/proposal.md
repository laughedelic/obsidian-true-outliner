## Why

`docs/research/index.md` costs more than it returns. Every new note adds a row to it, so nearly every
parallel PR touches it, and `merge=union` duplicates a row whenever `main` rewords one; the sessions
that hit it each wrote their own resolver. Agents rarely look anything up in it, and go straight to
the notes (#340;
[`docs/research/research-note-front-matter.md`](../../../../docs/research/research-note-front-matter.md),
"What the index costs"). #340 is a sub-issue of #334.

## What Changes

- **Front matter on every note** under `docs/research/`, `README.md` included, following the Open
  Knowledge Format v0.2: `type: research` (the same value on every file, the README included) and `description`, taken
  verbatim from the note's current index row; the README, which had none, gets a new one.
- **`docs/research/index.md` is deleted**, with `.gitattributes` (which held only its
  `merge=union` line) and `scripts/check-research-index.ts`.
- **A new lint**, `scripts/check-research-front-matter.ts`, replaces the old one in `npm run lint`:
  every `.md` file under `docs/research/` opens with a parseable front-matter block whose `type` and
  `description` are non-empty strings.
- **`AGENTS.md`** (`CLAUDE.md` is a symlink to it) and every live reference to the index describe the
  new rule: a note is a file with front matter and nothing else.

## Non-goals

- **Reorganising the notes**, grouping them or changing what a note holds. A fuller rework comes
  after this change (#334).
- **`title`, `tags` and a timestamp key.** A title would copy the note's H1. No tag vocabulary exists to apply, and a hand-kept date goes stale
  where git already records one; both can be added to any note later without touching the lint.
- **Shortening the descriptions.** The index rows are paragraphs, and they move as they are.
- **Archived changes.** Their mentions of the index record what was true when they landed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change touches how research notes are kept and no behaviour of the plugin, and declares
`skip_specs: true`.

## Impact

- `docs/research/*.md`: a front-matter block on each of the 71 files; `index.md` removed.
- `scripts/check-research-front-matter.ts` added, `scripts/check-research-index.ts` removed,
  `package.json`'s `lint` script, `.gitattributes`.
- `AGENTS.md`; `docs/research/README.md`'s pointer to the index.
- `docs/research/research-note-front-matter.md`: the measurements, which is the first note written in
  the new format.
- No `src/` or `styles/` change, so no version bump.
