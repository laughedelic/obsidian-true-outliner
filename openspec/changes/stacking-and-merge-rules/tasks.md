## 1. The measurement

- [x] 1.1 Measure what a cloud session can do with a stack. Verified by the table in the "A stacked
      PR from a cloud session" section of `docs/research/cloud-session-github-access.md`: a stack
      created, seen in the UI by the maintainer, unstacked, and both PRs' bases restored.
- [x] 1.2 Name the `gh-stack` release the routes were read from, in that section. Verified by the
      note naming v0.2.0, the module version in the downloaded binary's build info.
- [x] 1.3 Measure what plain git does for each restack case, in scratch repositories. Verified by
      `docs/research/restacking-with-plain-git.md` and its index row, `node scripts/check-research-index.ts`
      exiting 0.
- [x] 1.4 Measure whether a cloud session force-pushes layers that are not its checked-out branch, on
      two throwaway branches. Verified by the table in the same note: both layers updated in one
      `--force-with-lease` push.

## 2. The three edits

- [x] 2.1 In `AGENTS.md`, "Branching and PR stacks": replace the file-overlap test with the two
      conditions, keep "state the reading", and replace the `git diff --name-only` block with the
      `git diff` first pass and the `git merge-tree --write-tree` check, run before the PR opens and
      before the version bump. Verified by reading the section through the `CLAUDE.md` symlink.
- [x] 2.2 In the same section, replace "adopting a stack, opening and updating its PRs with
      `gh stack submit`" and the "no `gh stack` at all" paragraph with the REST recipe for creating,
      extending and dissolving a stack and the two git restack recipes, and point to
      `docs/pr-stacks.md`. Verified by a diff showing no sentence that says a cloud session cannot open
      a stacked PR, and `grep -n 'gh stack' AGENTS.md` printing nothing.
- [x] 2.3 In "Change lifecycle", step 5: the maintainer squash-merges; agents prepare landing and
      never merge. Verified by `grep -n 'never merge' AGENTS.md`.

## 3. The merge hook

- [x] 3.1 In `scripts/agent-conventions.ts`, deny `mcp__github__merge_pull_request` and
      `mcp__github__enable_pr_auto_merge`, and in `Bash` deny `gh pr merge`, `gh stack merge` and
      `gh api` to a `…/pulls/{n}/merge` or `…/auto_merge` path, with a message naming the rule and
      saying to prepare landing and stop; add the rule to the file's header comment. Verified by piping
      `PreToolUse` payloads into the script: each of the five refused forms, with `-R <repo>` between
      `gh` and `pr`, an env prefix, and `git -C` before another command in the same line, prints a deny
      naming the rule; `gh pr view`, `gh pr create`, `gh api repos/o/r/pulls/1`, `git merge main`,
      `update_pull_request_branch` and a `git commit -m "gh pr merge"` print nothing; the branch-name
      and `send_later` payloads still behave as before. The shell lexer the push rule shares now ends a
      command at a newline and skips a here-document's body, since the merge rule otherwise missed a
      merge on a second line and refused a body that only names one; each has rows and a control. Negative control: matching `gh pr` instead of
      `gh pr merge` must refuse `gh pr view` and fail that row.
- [x] 3.2 Check the rule in the session that made the edit: call `mcp__github__merge_pull_request` with a
      pull request number that does not exist, so a hook that fails to refuse errors out and merges
      nothing, and see it refused with the rule's message. Verified by the refusal text, recorded in
      the PR.
- [x] 3.3 Update the sentence in `AGENTS.md`, "Agent files", that says what `agent-conventions.ts` does.
      Verified by `grep -n 'merge' AGENTS.md` showing it.

## 4. Dropping `gh stack`

- [x] 4.1 Rewrite `docs/pr-stacks.md` around the REST recipe and the git restack, with the ancestor
      test, the no-worktree condition and what is unmeasured; drop the `gh stack` table, the
      "Worktrees hold branches hostage" section and the landing section's `gh stack merge`, and say
      that the maintainer lands. Verified by `grep -n 'gh stack\|stack-park' docs/pr-stacks.md` matching
      only the sentence that says the extension is not used, and by running the trunk-moved recipe's
      commands against a local bare `origin`: every adjacent pair an ancestor, one commit per layer,
      and the three layers force-pushed in one command from a checkout of none of them.
- [x] 4.2 Delete `scripts/stack-park.ts`. Verified by `npm run typecheck:scripts` exiting 0 and
      `grep -rn 'stack-park' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive`
      matching only this change's own files and the research notes.
- [x] 4.3 In `scripts/agent-setup.sh`, remove the `gh-stack` extension install and its note, and reword
      the cloud message that says "no `gh stack` here" to say what the proxy refuses (`gh pr`,
      `gh repo`) and that stacks go through `gh api`; in `AGENTS.md`, "Agent files", drop the
      extension from the list of what the script installs. Verified by running the script in this
      session and reading its notes, and `grep -rn 'gh-stack\|gh stack' scripts AGENTS.md .github` matching only the merge rule's own
      comments in `scripts/agent-conventions.ts`; run with `npm` and `apt-get` stubbed, as a cloud
      session and outside the cloud, the script prints no extension note and the cloud note names the
      stacks recipe.
- [x] 4.4 `docs/cloud-sessions.md`: the sentences that give a cloud session only the layer's own work and
      say the setup script installs `gh` and not `gh-stack`. `docs/research/cloud-session-github-access.md`:
      the same sentence in the "`gh stack` from the cloud" section. Verified by
      `grep -rn "layer.s own work\|gh-stack" docs --include=*.md` matching only the research notes'
      history of what was measured.

## 5. Integration

- [ ] 5.1 This branch is stacked on #351 (stack 356, #351's head `55b52ef`) at the maintainer's request,
      though the stacking test would not stack it: `git merge-tree` of the two exits 0 and nothing
      here reads code #351 adds. When #351 lands its commits are squashed into `main`, so restack with
      `git rebase --onto origin/main 55b52ef chore/stacking-and-merge-rules` (not `--update-refs`),
      push with `--force-with-lease`, and set the PR's base to `main`; if #351 moves first, the same
      command from its previous tip. Verified by `git merge-tree --write-tree HEAD origin/main`
      exiting 0 on the result and the PR's file list holding only this change's files.
- [x] 5.2 Run `npm run typecheck:scripts`, `npm run lint`, and
      `openspec validate stacking-and-merge-rules --strict`. Verified by all three exiting 0, after
      `npm ci` replaced a `node_modules` that predated the lockfile.
