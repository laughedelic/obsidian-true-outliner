## Why

Two defects in the cloud e2e bring-up have cost every cloud session time, each re-diagnosed from
scratch (#336, a sub-issue of #334):

- **A stale `node_modules` passes setup.** `scripts/agent-setup.sh` installs only when
  `node_modules` is absent, and a cloud container starts from a snapshot whose `node_modules` can
  predate `package-lock.json`. The first narrow run then fails on a missing package, and the
  session spends its first twenty minutes finding that out.
- **The Xvfb wrapper holds a piped run open.** `e2e-tests/docker/start-xvfb-and-run.sh` ends in
  `exec "$@"`, so its `EXIT` trap never runs and Xvfb keeps the run's stdout. A run piped into
  `tail` or `head` does not return after the tests finish.

Both reproduce on `main` in a cloud session
([`docs/research/cloud-e2e-bring-up.md`](../../../docs/research/cloud-e2e-bring-up.md)).

## What Changes

- **A lockfile-drift check.** `scripts/lockfile-drift.ts` compares `package-lock.json` with the
  hidden lockfile npm writes at `node_modules/.package-lock.json`, and exits non-zero naming what
  differs. `scripts/agent-setup.sh` runs `npm ci` when it does, in a throwaway environment, and
  reports it otherwise. It replaces the `[ ! -d node_modules ]` test.
- **The wrapper stops Xvfb.** `start-xvfb-and-run.sh` writes Xvfb's output to a log file instead
  of inheriting stdout, and runs the command without `exec`, so the `EXIT` trap kills Xvfb and a
  piped run returns when the command does. The log is printed if Xvfb does not come up.
- **The docs follow.** `docs/cloud-sessions.md` drops the instruction to redirect output to a
  file and says what the wrapper does now, as does `e2e-tests/docker/README.md`, which still says
  the wrapper `exec`s; the research note that first measured the hang gets a
  pointer to the fix.

## Non-goals

- **Comparing modification times.** A clone's files carry the clone time, so the lockfile is
  always newer than a snapshot's `node_modules` and every session would reinstall
  ([`cloud-e2e-bring-up`](../../../docs/research/cloud-e2e-bring-up.md), "A stale `node_modules`").
- **Detecting a changed `package.json` with an unchanged lockfile.** `npm ci` refuses that state
  itself.
- **Forwarding signals to the wrapped command**, and **a free-display search** in place of the
  fixed `:99`. Neither is part of the reported defects.
- **The Bugfix routine's preflight step.** It becomes unnecessary once this lands, and is
  revised under #348.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change touches how agent sessions bring up the e2e harness and no behaviour of the
plugin, and declares `skip_specs: true`.

## Impact

- `scripts/lockfile-drift.ts` (new), `scripts/agent-setup.sh`.
- `e2e-tests/docker/start-xvfb-and-run.sh` and `e2e-tests/docker/README.md`, used by
  `npm run test:e2e:docker` and by cloud sessions.
- `docs/cloud-sessions.md`, `docs/research/rendered-ui-observability.md` (one pointer),
  `docs/research/cloud-e2e-bring-up.md` and its row in `docs/research/index.md`.
- No `src/` or `styles/` change, so no version bump (`scripts/check-landed.ts` asks for one only
  of a change that ships those paths).
