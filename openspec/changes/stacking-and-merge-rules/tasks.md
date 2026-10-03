## 1. The measurement (primary checkout)

- [ ] 1.1 Run the measurement plan in `design.md` in the primary checkout, with `gh stack` installed.
      Verified by the commands and their output, step by step, added to the "A stacked PR from a cloud
      session" section of `docs/research/cloud-session-github-access.md`, which already holds the
      `#190`/`#267` readings and the `#274`/`#270` merge-tree figure the proposal cites.
- [ ] 1.2 Choose the row of the design's table that the output supports, and state it in the PR before
      group 2 starts.

## 2. The three edits

- [ ] 2.1 In `AGENTS.md`, "Branching and PR stacks": replace the file-overlap test with the two
      conditions, keep "state the reading", and drop the `git diff --name-only` block for the
      `git diff main...<other>` and `git merge-tree --write-tree` pair. Verified by reading the
      section through the `CLAUDE.md` symlink.
- [ ] 2.2 In the same section, reword "Opening a stacked PR, restacking, and landing wait for the
      primary checkout" to the row chosen in 1.2. Verified by a diff showing the sentence no longer
      says a cloud session cannot open a stacked PR, if the measurement allows it.
- [ ] 2.3 In "Change lifecycle", step 5: the maintainer squash-merges; agents prepare landing and
      never merge. Verified by `grep -n 'never merge' AGENTS.md`.

## 3. Where the statements repeat

- [ ] 3.1 `docs/pr-stacks.md`: the "None of this runs from a cloud session" paragraph and "Opening the
      PRs", to match 2.2. `docs/cloud-sessions.md`: the sentence giving a cloud session only the
      layer's own work. `docs/research/cloud-session-github-access.md`: the same sentence in the
      "`gh stack` from the cloud" section. Verified by `grep -rn 'layer.s own work' AGENTS.md docs`
      showing no sentence that contradicts the measured result.

## 4. Integration

- [ ] 4.1 Run `npm run lint`, and `openspec validate stacking-and-merge-rules --strict`. Verified by
      both exiting 0.
