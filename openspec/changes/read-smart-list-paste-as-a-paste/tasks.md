# Tasks

## 1. Read the rewrite as the paste it came from

- [ ] 1.1 Write a pure reader in `src/plugin/smart-list-paste.ts`: from the start document, the
  transaction's one range, its one change and the recorded clipboard texts, it returns the plain paste
  at the content start, or the changes untouched. Unit-test it in `tests/smart-list-paste.test.ts`
  with the measured changes (`docs/research/obsidian-smart-list-paste`, "Which pastes it reaches" and
  the edge table):
  - the three failing cases' changes, with and without the recorded text;
  - an empty task item, a numbered item, the start of a non-empty item, a first line that is a task;
  - the sibling and the deep payload, whose recorded text carries the first line's indentation;
  - the fallback, with no recorded text and with one that does not reproduce the change.

  Also test what it must leave alone: two ranges, two changes, a paste not after a list prefix, a
  change that does not start at the marker, a non-paste `userEvent`. Negative control: a reader that
  returns the changes untouched fails every shape case; one that always takes the inserted text fails
  the sibling and the deep payload.
- [ ] 1.2 Unit-test the reader's output through the two existing gates. For the first failing
  case's payload, assert `classify` gives `boundary-crossing-edit` and `computeVerdictForRanges` gives
  the `rewrite` the plain insertion at the content start gives. Negative control: the same facts built
  from Obsidian's replacement classify `within-node-edit`, which is #372.
- [ ] 1.3 Add the recorder, a `paste` handler at the highest precedence that stores `text/markdown`
  and `text/plain`, returns false and drops the record once the event's task ends. Register it from
  `transactionFilterExtension` and read the changes through the reader in `transaction-filter.ts`.
  Verify with `npm test`, `npm run lint` and `npm run typecheck`. Negative control: a handler that
  returns true takes Obsidian's own paste away and fails the paste cases in 2.1.

## 2. In the app, on 1.14.4 and on 1.13.7

- [ ] 2.1 Run the three failing cases on 1.14.4, desktop and `--mobile`, with
  `OBSIDIAN_VERSION=1.14.4 npm run test:e2e:narrow -- <spec> "<title>"` for `61-selection-enforcement`,
  `62-outline-edit-enforcement` and `80-outline-zoom`. Negative control: each fails on 1.14.4 with
  the reader's call removed from the filter, and passes on 1.13.7 either way. Setting up a 1.14.4 build
  in a cloud session is in the research note's last section.
- [ ] 2.2 Add drawn cases under `e2e-tests/cases/transaction-classification/` for the payloads whose
  first-line indentation decides the tree: the sibling payload and the deep payload into an empty
  top-level item, and a task destination, each with `--record` run on desktop and mobile on
  both builds, which must agree. Negative control: the first two fail on 1.14.4 with the recorded text
  ignored.
- [ ] 2.3 In `62-outline-edit-enforcement`, add the three pastes a case file cannot hold: an HTML
  clipboard (a list `a` with a nested `b`, written with `ClipboardItem`) into an empty item two levels
  deep, two carets with a two-line clipboard, and the first failing case's paste with "Smart lists"
  turned off through `app.vault.setConfig('smartIndentList', false)`, restored afterwards. Negative
  control: the HTML paste fails on 1.14.4 with the fallback removed.
- [ ] 2.4 Push the checkpoint and read CI's `clipboard` and `drawn-cases` jobs on desktop and
  mobile. They run on the pinned 1.13.7 until the pin is removed, so also run both groups once on
  1.14.4 locally, one run at a time (the groups share the machine's clipboard), and quote the counts.

## 3. The pin and the spec

- [ ] 3.1 Remove the CI pin. If #359 is on `main`, delete `env.obsidian-version` and its comment from
  `.github/workflows/ci.yml` and restore the `workflow_dispatch` input's description and the
  `inputs.obsidian-version || 'latest'` expressions; if it is not, say so in the PR and leave the
  removal to whichever of the two lands second. Verify that a pull request's required `clipboard`
  jobs run on the newest build and pass.
- [ ] 3.2 Update `docs/research/obsidian-smart-list-paste` with what 2.1 to 2.4 measured on the
  built change, replacing the prototype's source with a pointer to the module.
- [ ] 3.3 Run `openspec validate read-smart-list-paste-as-a-paste --strict`.
