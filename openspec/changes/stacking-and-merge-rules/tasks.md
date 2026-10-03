## 1. The measurement

- [x] 1.1 Measure what a cloud session can do with a stack. Verified by the table in the "A stacked
      PR from a cloud session" section of `docs/research/cloud-session-github-access.md`: a stack
      created, seen in the UI by the maintainer, unstacked, and both PRs' bases restored.
- [x] 1.2 Name the `gh-stack` release the routes were read from, in that section. Verified by the
      note naming v0.2.0, the module version in the downloaded binary's build info.

## 2. The three edits

- [ ] 2.1 In `AGENTS.md`, "Branching and PR stacks": replace the file-overlap test with the two
      conditions, keep "state the reading", and replace the `git diff --name-only` block with the
      `git diff` first pass and the `git merge-tree --write-tree` check, run before the PR opens and
      before the version bump. Verified by reading the section through the `CLAUDE.md` symlink.
- [ ] 2.2 In the same section, replace "adopting a stack, opening and updating its PRs with
      `gh stack submit`" and the "no `gh stack` at all" paragraph with the REST recipe for creating,
      extending and dissolving a stack, and keep `gh stack` for `checkout`, `rebase`, `sync` and
      `merge`. Verified by a diff showing no sentence that says a cloud session cannot open a stacked
      PR, and `grep -n 'gh stack' AGENTS.md` naming only those four.
- [ ] 2.3 In "Change lifecycle", step 5: the maintainer squash-merges; agents prepare landing and
      never merge. Verified by `grep -n 'never merge' AGENTS.md`.

## 3. The merge hook

- [ ] 3.1 In `scripts/agent-conventions.ts`, deny `mcp__github__merge_pull_request` and
      `mcp__github__enable_pr_auto_merge`, and in `Bash` deny `gh pr merge`, `gh stack merge` and
      `gh api` to a `…/pulls/{n}/merge` or `…/auto_merge` path, with a message naming the rule and
      saying to prepare landing and stop; add the rule to the file's header comment. Verified by piping
      `PreToolUse` payloads into the script: each of the five refused forms, with `-R <repo>` between
      `gh` and `pr`, an env prefix, and `git -C` before another command in the same line, prints a deny
      naming the rule; `gh pr view`, `gh pr create`, `gh api repos/o/r/pulls/1`, `git merge main`,
      `update_pull_request_branch` and a `git commit -m "gh pr merge"` print nothing; the branch-name
      and `send_later` payloads still behave as before. Negative control: matching `gh pr` instead of
      `gh pr merge` must refuse `gh pr view` and fail that row.
- [ ] 3.2 Check the rule in the session that made the edit: call `mcp__github__merge_pull_request` with a
      pull request number that does not exist, so a hook that fails to refuse errors out and merges
      nothing, and see it refused with the rule's message. Verified by the refusal text, recorded in
      the PR.
- [ ] 3.3 Update the sentence in `AGENTS.md`, "Agent files", that says what `agent-conventions.ts` does.
      Verified by `grep -n 'merge' AGENTS.md` showing it.

## 4. Where the statements repeat

- [ ] 4.1 `docs/pr-stacks.md`: the "None of this runs from a cloud session" paragraph and "Opening the
      PRs", the table split into the REST recipe and the `gh stack` rows that stay, with the
      unmeasured parts stated. `docs/cloud-sessions.md`: the sentence giving a cloud session only the
      layer's own work. `docs/research/cloud-session-github-access.md`: the same sentence in the
      "`gh stack` from the cloud" section. Verified by `grep -rn 'layer.s own work' AGENTS.md docs`
      showing no sentence that contradicts the measured result. The `SessionStart` hook's cloud message
      ("no `gh stack` here") in `scripts/agent-setup.sh` is read for the same contradiction and
      reworded to point at the REST recipe.

## 5. Integration

- [ ] 5.1 Run `npm run typecheck:scripts`, `npm run lint`, and
      `openspec validate stacking-and-merge-rules --strict`. Verified by all three exiting 0.
