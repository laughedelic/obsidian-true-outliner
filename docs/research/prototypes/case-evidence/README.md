# Case evidence probes

What `docs/research/case-evidence.md` measured, and how to run it again.

- `cases/pr264`, `cases/pr270`, `cases/pr274`: the drawn manual-test cases of the three fix PRs as
  case files, converted with `scripts/layout.ts --read` and given a `keys` line. `c5-control-…`
  has no result column and runs under `--record` only. `cases/extra` holds three probes for
  steps the PRs describe in prose: reading view after a paste (`⌘E`) and a fold (`⌘⌥↑`).
- `frames.e2e.ts.txt`: a spec that takes a frame in light and dark after `before` and after each
  key phase, then measures a static screen with the native caret and with the drawn one. Copy it to
  `e2e-tests/specs/99-zz-case-evidence-probe.e2e.ts` in a checkout that carries the case runner
  and delete it after the run. It asserts nothing about a case.
- `analyze.mjs`: reads the recorded case files of a head and of `main` and compares each with the
  drawing: text, and the caret where the drawing draws one.
- `frame-stats.mjs`: cost, caret source and stability of the frames the probe wrote.
- `frames/`: eight of the 336 frames, the ones the note links.

The layout `analyze.mjs` and `frame-stats.mjs` read from a root directory:

```
cases/pr<N>/*.case
runs/records/pr<N>-head/<case>.<platform>.case      # npm run case -- … --record, on the merged head
runs/records/pr<N>-main/<case>.<platform>.case      # the same, on main
frames/pr<N>/frames.<side>.<platform>.json          # written by the probe
frames/pr<N>/static.<side>.<platform>.json
```

Each PR's head is checked out as `main` merged with the head: the heads predate the runner.
