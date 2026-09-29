## 1. The wait

- [ ] 1.1 Add `waitForCursor(line, ch)` to `e2e-tests/helpers.ts` beside `getCursor`, as the design
      describes: polls every 20 ms for `waitBudget(3000)`, rejects with the position asked for and
      the last one read. Verified by `npm run typecheck:e2e` and by 2.1 and 2.2 passing.

## 2. The two cases

- [ ] 2.1 `65-content-space-caret` D1 waits for the caret after its gap click. Verified by the spec
      passing under mobile emulation on the newest installer: ten runs of the whole file with four
      busy loops beside it (`docs/research/gap-click-timing.md`, "Reproducing"), all green. Negative
      control: with the read back to one immediate `getCursor()`, the same ten runs fail at the
      rate the note records (7 of 10).
- [ ] 2.2 `66-content-space-caret-manual-pass` D8 waits for the caret after its gap click. Verified
      the same way, eight runs, all green. Negative control: the immediate read fails 3 of 6.
- [ ] 2.3 The same two specs pass on the oldest installer and on desktop, so the wait costs neither
      run anything: `npm run test:e2e:narrow -- 65-content-space-caret` and `66-content-space-caret-manual-pass`,
      with and without `--mobile`.

## 3. The check

- [ ] 3.1 Dispatch `newest-installer.yml` by hand on the branch, and confirm the `selection` group
      on mobile emulation is green on these two cases. The first scheduled result, Monday
      2026-10-05, is the standing check and closes #304.
- [ ] 3.2 `openspec validate gap-click-waits-for-caret --strict`.
