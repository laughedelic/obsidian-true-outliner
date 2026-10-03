## 1. Sample

- [x] 1.1 Write `docs/research/research-note-front-matter.md` with its index row, and convert one
      note, `decoration-experiments-plan.md`, as the sample. Verified by the block parsing with
      `yaml` and `npm run lint` passing with the index still in place.

## 2. Conversion

- [x] 2.1 Add the front-matter block to the remaining notes and `README.md`, with a throwaway script
      that builds each block from the note's index row. Verified by `git diff --stat` showing only added
      lines in each note and by the new lint passing on all 72 files.
- [x] 2.2 Add `scripts/check-research-front-matter.ts` and run it from `npm run lint` in place of
      `scripts/check-research-index.ts`. Verified by exiting 0 on the tree. Negative controls: a note
      with no block, a block that does not parse, a block with no `type`, one with `type:` empty or
      `""`, one with no `description`, and one that is not a mapping each make it exit 1 naming the
      file.
- [x] 2.3 Delete `docs/research/index.md`, `scripts/check-research-index.ts` and `.gitattributes`,
      which held only the `merge=union` line.

## 3. References

- [x] 3.1 Rewrite `AGENTS.md`'s research-note convention and `docs/research/README.md`'s pointer;
      the live references from `grep -rn "research/index" .` outside `openspec/changes/archive/`.
      Verified by that grep returning nothing outside the archive.
- [x] 3.2 Run `npm run typecheck:scripts`, `npm run lint` and
      `openspec validate research-notes-front-matter --strict`. Verified by all three exiting 0.
