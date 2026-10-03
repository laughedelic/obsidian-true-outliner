## 1. The check

- [x] 1.1 `scripts/check-landed.ts` takes its base from a `origin/main` fetched when it runs, and the
  version rule and the freshness rule become pure functions of the versions, the kind, the paths and
  whether the head contains the tip
- [x] 1.2 The version must be above `main`'s and at least the bump the kind and paths call for;
  negative control: a head whose version equals `main`'s, as when another PR bumped first, fails
- [x] 1.3 A PR with something to land must contain the `main` tip; a PR with nothing to land is not
  held to it; negative control: a landing PR one commit behind fails, a dependency update one commit
  behind passes
- [x] 1.4 Unit tests for the two rules, run by `npm test`

## 2. The workflow

- [x] 2.1 `.github/workflows/landed.yml`: the `auto_merge_enabled` trigger, `environment: landing-zone`,
  `if: github.event.pull_request.auto_merge != null`, the fresh base, the per-PR concurrency group
  kept; the header comment says why the gate is a deployment and not a check
- [ ] 2.2 On a throwaway PR: without auto-merge the job is skipped and no deployment appears; with it
  the job runs; a push while it is set runs the job again

## 3. The guard

- [x] 3.1 `scripts/agent-conventions.ts` refuses `mcp__github__disable_pr_auto_merge`; the test
  beside the others in `tests/agent-conventions.test.ts` fails with the line removed

## 4. The skill and the docs

- [x] 4.1 `.agents/skills/land/SKILL.md` and the symlinks in `.claude/skills/` and `.github/skills/`:
  the steps in design.md, and a refusal for a PR whose base is not `main`
- [x] 4.2 `AGENTS.md` step 5 describes enable auto-merge, a failed `Landed` wakes the session,
  `/land`, merge on green; the `steward` skill acts on that failure and says a session never enables
  or disables auto-merge
- [x] 4.3 `docs/pr-stacks.md` says stacked PRs are not covered by the gate

## 5. The ruleset, last

- [ ] 5.1 The maintainer adds the requirement of a successful deployment to `landing-zone` to `Protect
  main`, once `landed.yml` is on `main`; `Landed` is not added as a required check
- [ ] 5.2 On a throwaway PR the maintainer enables auto-merge, a session lands it, and GitHub merges:
  the unapproved PR was blocked, the failed `Landed` woke the session, and auto-merge survived the push

## 6. Validate

- [ ] 6.1 `openspec validate land-through-auto-merge --strict`
