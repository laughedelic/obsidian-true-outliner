## Why

Labels on open issues drift from what has happened on them, and the work that reads them picks the
wrong thing. #158 kept `p0` after a Bugfix run measured it as p2, and the next run took it as "the one
p0"; #257 carried `needs/diagnosis` after #274 located the cause; parallel sessions filed #153 while
#142 was being fixed. Three Bugfix retrospectives asked to rank by the latest re-validation rather
than a stale label (#344, "What the sessions show"). A narrower earlier routine, the Staleness sweep,
cost about $0.86 on Sonnet for one run and could not record what it had checked, so it re-selected the
same issues. #344 is a sub-issue of #334.

## What Changes

- **A routine prompt kept in the repository**, `.agents/routines/triage.md`. The routine's own prompt
  is a copy, so a change to how it triages is reviewed and diffable here first. Each run labels new
  issues on all four axes, reconciles labels with what has happened since (a diagnosis posted, a
  severity re-measured, a pull request opened), flags likely duplicates and "blocked by"
  dependencies, and leaves a one-line comment for each change. It reproduces, investigates and
  measures nothing, and makes no other write.
- **A dry run of that prompt on the current open issues**, recorded in a research note,
  `docs/research/triage-routine.md`, with what the run read and what it would change.

## Non-goals

- **Creating or scheduling the routine.** The maintainer does both, after reviewing the dry run.
- **Updating the `Verified on` project field.** Projects are out of reach from a cloud session
  ([`cloud-session-github-access`](../../../docs/research/cloud-session-github-access.md)), which is
  why the Staleness sweep could not keep state. The routine keeps its state in its own comments.
- **Re-verifying claims against the code.** A claim that needs measuring is left to the work that
  acts on the issue, as the `triage` skill's "Re-verify before trusting a claim" already says.
- **Closing, assigning, linking or editing issues**, and any write to a pull request.
- **A new label for "blocked" or "has a pull request".** A label is added to `.github/labels.yml` or
  nowhere; the routine flags both in a comment.
- **A marker for the routine in the `steward` skill.** Its comments land on issues, which a PR event
  does not wake a session for.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change touches how agents work in this repository and no behaviour of the plugin, and
declares `skip_specs: true`.

## Impact

- `.agents/routines/triage.md`: new.
- `docs/research/triage-routine.md`: new.
- No `src/` or `styles/` change, so no version bump.
