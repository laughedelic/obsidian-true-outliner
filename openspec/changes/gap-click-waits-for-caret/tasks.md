## 1. The wait

- [x] 1.1 Add `waitForCursor(line, ch)` to `e2e-tests/helpers.ts` beside `getCursor`, as the design
      describes: polls every 20 ms for `waitBudget(3000)`, rejects with the position asked for and
      the last one read. The third argument is the limit in milliseconds, for 1.2. Verified by
      `npm run typecheck:e2e` and by 2.1 and 2.2 passing.
- [x] 1.2 A case in `00-smoke` for the requirement's second and third scenarios: with the caret
      read at `L:C`, `waitForCursor(L, C + 1, 300)` rejects with a message naming `L:C+1` and
      `L:C`, and `waitForCursor(L, C, 300)` resolves. Verified by the case passing on both runs.
      Negative control: a `timeoutMsg` string built in the `waitUntil` options, where `last` is
      still `undefined`, must fail the message check.

## 2. The two cases

- [x] 2.1 `65-content-space-caret` D1 waits for the caret after its gap click. Verified by the spec
      passing under mobile emulation on the newest installer: ten runs of the whole file with four
      busy loops beside it (`docs/research/gap-click-timing.md`, "Reproducing"), all green. Negative
      control: the unmodified read, whose ten loaded runs the note records at 7 failing.
- [x] 2.2 `66-content-space-caret-manual-pass` D8 waits for the caret after its gap click. Verified
      the same way, eight runs, all green. Negative control: the unmodified read, whose six loaded runs the note records at 3 failing.
- [x] 2.3 The same two specs pass on the oldest installer and on desktop, so the wait costs neither
      run anything: `npm run test:e2e:narrow -- 65-content-space-caret` and `66-content-space-caret-manual-pass`,
      with and without `--mobile`.

## 3. The check

- [ ] 3.1 Dispatch `newest-installer.yml` by hand on the branch, and confirm the `selection` group
      on mobile emulation is green on D1 and D8. Verified by that run's job results.
- [ ] 3.2 `openspec validate gap-click-waits-for-caret --strict`.

## 4. Land

- [ ] 4.1 CI green on the branch head: lint, unit tests, and the desktop and mobile e2e matrix.
- [ ] 4.2 Sync the delta spec into `openspec/specs/e2e-verification/spec.md`, archive the change,
      and validate: `openspec archive gap-click-waits-for-caret`, then `openspec validate --specs`.
- [ ] 4.3 No version bump: nothing under `src/` or `styles/` changes, and the PR is a `chore`, which
      the `Landed` check does not ask to bump. Verified by that check passing on the ready PR.
