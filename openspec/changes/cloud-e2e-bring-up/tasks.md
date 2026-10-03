## 1. The drift check

- [ ] 1.1 Write `scripts/lockfile-drift.ts` (the comparison as an exported function, a CLI that
      exits 0 or 1 and prints the first differences) and a unit test in `tests/` that feeds it
      lockfile pairs: in sync, a lockfile entry missing, a version that differs, an installed entry
      the lockfile dropped, an optional entry missing (not drift), the root `""` entry present only in the lockfile (not
      drift), a missing hidden lockfile (drift). A second group runs the CLI against lockfile pairs
      in a temporary directory and asserts its exit status (0 in sync, 1 on drift, 1 on an
      unreadable file) and that drift names the first differing entries on stdout. Verified by
      `npm test`. Negative controls: counting a missing optional entry as drift must fail the
      optional row, and not skipping the root entry must fail the root row.
- [ ] 1.2 In `scripts/agent-setup.sh`, replace the `[ ! -d node_modules ]` guard with a run of the
      script: drift runs `npm ci` in a throwaway environment and reports it elsewhere. Verified on
      this VM's stale snapshot, which the script reports as missing four packages, and again after
      `npm ci`, which it reports as in sync, both recorded in the research note. Negative control:
      the previous guard reports nothing on the same snapshot.

## 2. The wrapper

- [x] 2.1 In `e2e-tests/docker/start-xvfb-and-run.sh`, send Xvfb's output to a log file removed by
      the `EXIT` trap, print it when the socket does not appear, replace `exec "$@"` with the
      command in the foreground, and rewrite the script's header, which says it execs the command. Verified by `node scripts/e2e-narrow.ts 00-smoke | tail -5` run
      inside the wrapper in this cloud session, which returns when the run ends with the same exit
      status as the run, and by a failing command, whose status the wrapper passes on. Negative
      control: restoring `exec "$@"` makes the piped run hang, as in the research note's "before".
- [ ] 2.2 Block landing on `npm run test:e2e:docker -- 00-smoke` running to completion and, run
      again, being interrupted with Ctrl-C and stopping the container promptly. This VM has no Docker
      daemon, so the maintainer runs it and the result goes in the PR and in the research note's "Not
      measured". An interruption that regressed is fixed before landing, by running the command in the
      background and forwarding `INT` and `TERM` to it.

## 3. Docs

- [ ] 3.1 In `docs/cloud-sessions.md`, remove the paragraph that tells a session to redirect the
      wrapper's output to a file, and rewrite the one before it: the wrapper runs the command and
      stops Xvfb when it ends. In `e2e-tests/docker/README.md`, "No `xvfb-run`", replace "`exec`ing whatever
      command it's given" with what the wrapper does now: it runs the command and stops Xvfb when it
      ends. Add a pointer to the fix under the hang in `docs/research/rendered-ui-observability.md`,
      "From inside a spec". Verified by `grep -n "exec\|redirect"
      docs/cloud-sessions.md e2e-tests/docker/README.md e2e-tests/docker/start-xvfb-and-run.sh`, which
      no longer describes the starter as exec'ing.
- [ ] 3.2 Add the "after" measurements to `docs/research/cloud-e2e-bring-up.md`.

## 4. Integration

- [ ] 4.1 Run `npm run typecheck:scripts`, `npm run lint`, `npm test`, and
      `openspec validate cloud-e2e-bring-up --strict`. Verified by all four exiting 0. The change
      touches only `scripts/`, `e2e-tests/` and `docs/`, so `node scripts/check-landed.ts
      origin/main "fix(agents): ..."` passes without a version bump.
