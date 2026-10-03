## 1. The prompt

- [x] 1.1 Write `.agents/routines/triage.md`: what a run may write, the reads that bound it, what each
      check decides, how it avoids repeating itself, and the summary table. Verified by `cat` of the
      file and by a session following it without further instruction (2.1).

## 2. The dry run

- [x] 2.1 Run the prompt with the trigger text `dry run` in a session barred from write tools, and
      record the run in `docs/research/triage-routine.md`. Verified by the run's own report: zero
      writes, a table of 21 comments and one label change, and a list of what it left alone.
- [x] 2.2 Fold the ambiguities the run listed into the prompt, and run it again. Verified by the
      second run's table, whose rows are in the note. Negative control: the first run's table lacks the
      four open-pull-request links and the #209 dependency that the revised wording adds.
- [x] 2.3 Check the run's rows against GitHub with read-only calls. Verified by the spot checks listed
      in the note.

## 3. Review and scheduling (the maintainer)

- [ ] 3.1 Review the prompt and the dry run on the draft PR, and answer the open questions in the
      design.
- [ ] 3.2 Create the routine with a copy of the prompt, run it once with `dry run`, and schedule it.
      The routine is created by the maintainer; this change creates no trigger.

## 4. Integration

- [ ] 4.1 Run `npm run lint` and `openspec validate triage-routine --strict`. Verified by both
      exiting 0.
