# Known-failing case files

The probes behind "Waiting on a fix" in [`../../drawn-case-files.md`](../../drawn-case-files.md).

- `extract.mjs` reads issue and comment bodies (`<name>.md`, one file per issue, its comments
  appended), writes every fenced block that draws a column edge to `<name>-<n>.txt`, and reads it
  back into columns with `layout.ts --read` (`<name>-<n>.cols`).

  ```bash
  node docs/research/prototypes/known-failing-cases/extract.mjs <bodies-dir> <blocks-dir>
  ```

- `assemble.mjs` turns fifteen of those blocks into case files: it adds the preamble and the
  `keys` line, renames the tracker's `after …` headers (what happened) to `actual`, and puts the
  caret where each issue's reproduction puts it. `cases/` holds its output. Thirteen run;
  `228-2-as-drawn.case` (two candidate `expected` columns) and `261-1.case` (a parse tree, no
  `before`) are refused by `parseCase`, and are kept to show its messages.

  ```bash
  node docs/research/prototypes/known-failing-cases/assemble.mjs <blocks-dir> <cases-dir>
  ```

- The thirteen that run are executed from a cloud session with the two files below removed, once
  as written and once recorded, on each platform. The four runs write `<mode>-plain.log` and the
  recordings under `.obsidian-cache/cases/`:

  ```bash
  files=$(ls <cases-dir>/*.case | grep -v -e 228-2-as-drawn -e 261-1)
  sh e2e-tests/docker/start-xvfb-and-run.sh sh -c "
    node scripts/run-case.ts $files                        > desktop-plain.log 2>&1
    node scripts/run-case.ts $files --record               > desktop-record.log 2>&1
    node scripts/run-case.ts $files --mobile               > mobile-plain.log 2>&1
    node scripts/run-case.ts $files --mobile --record      > mobile-record.log 2>&1"
  ```

  Each `--record` run overwrites the files of the same platform in `.obsidian-cache/cases/`, so
  copy them out between runs when both modes are wanted for a case.

- `compare.mjs` prints, for each case, how it ended on each platform and whether the state the
  app produced is the one the issue's `actual` column draws.

  ```bash
  node docs/research/prototypes/known-failing-cases/compare.mjs <cases-dir> <recorded-dir> desktop-plain.log mobile-plain.log
  ```

The timing check ran `275-1.case` and `146-1.case` as ten copies each in one `run-case.ts`
invocation per platform.
