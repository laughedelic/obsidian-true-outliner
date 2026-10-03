## 1. The measurement

- [x] 1.1 Measure what a cloud session can do with a stack. Verified by the table in the "A stacked
      PR from a cloud session" section of `docs/research/cloud-session-github-access.md`: a stack
      created, seen in the UI by the maintainer, unstacked, and both PRs' bases restored.
- [x] 1.2 Name the `gh-stack` release the routes were read from, in that section. Verified by the
      note naming v0.2.0, the module version in the downloaded binary's build info.

## 2. The three edits

- [ ] 2.1 In `AGENTS.md`, "Branching and PR stacks": replace the file-overlap test with the two
      conditions, keep "state the reading", and drop the `git diff --name-only` block for the
      `git diff main...<other>` and `git merge-tree --write-tree` pair. Verified by reading the
      section through the `CLAUDE.md` symlink.
- [ ] 2.2 In the same section, reword "Opening a stacked PR, restacking, and landing wait for the
      primary checkout": a cloud session opens each PR with `create_pull_request` and creates the stack
      with `POST /repos/{o}/{r}/stacks`; restacking and landing wait. Verified by a diff showing the
      sentence no longer says a cloud session cannot open a stacked PR.
- [ ] 2.3 In "Change lifecycle", step 5: the maintainer squash-merges; agents prepare landing and
      never merge. Verified by `grep -n 'never merge' AGENTS.md`.

## 3. Where the statements repeat

- [ ] 3.1 `docs/pr-stacks.md`: the "None of this runs from a cloud session" paragraph and "Opening the
      PRs", to match 2.2, and a short section with the REST recipe: create, add, unstack. `docs/cloud-sessions.md`: the sentence giving a cloud session only the
      layer's own work. `docs/research/cloud-session-github-access.md`: the same sentence in the
      "`gh stack` from the cloud" section. Verified by `grep -rn 'layer.s own work' AGENTS.md docs`
      showing no sentence that contradicts the measured result. The `SessionStart` hook's cloud message
      ("no `gh stack` here") is read for the same contradiction and left or reworded.

## 4. Integration

- [ ] 4.1 Run `npm run lint`, and `openspec validate stacking-and-merge-rules --strict`. Verified by
      both exiting 0.
