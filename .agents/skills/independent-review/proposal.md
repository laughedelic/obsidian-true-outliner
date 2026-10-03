# Proposal review

The checks for a plan, a design or an OpenSpec change, after the order in `SKILL.md` ("The
reviewer"). Work through all of them; each one that turns something up is a finding in the form
`SKILL.md` gives.

1. **The expected result.** Derive it from the specs for the reproduction's case, then compare it
   with the issue's drawing and the plan's. An issue's expected result can be the output of the
   very code at fault: on #270 it was the buggy fallback's, and three reviews accepted it.
2. **The cause.** Locate it in the code from the reproduction, then read the issue's and the
   plan's diagnosis as claims and test them.
3. **The fix type**, quoting the requirement it turns on:
   - *drift*: the specs already require the expected result and the code departs; no delta.
   - *gap*: the specs are silent; the delta adds a requirement or a scenario.
   - *conflict*: the specs require today's behaviour, or contradict each other; the delta
     modifies, and the issue or the maintainer decides which side wins.

   Read the requirement literally. #269 moved from gap to conflict when a review did, and #270
   went from drift to gap to conflict across three.
4. **The assumptions** about Obsidian, CodeMirror and our parse. List them; measure each one that
   is cheap to measure, in the app; name the rest as unmeasured.
5. **The design as a whole.** Every entry point that reaches the same rule (keys, commands, the
   palette, paste, drag, delete, undo) and whether the plan covers each. Where the same defect
   lives elsewhere.
6. **Each decision** against its strongest alternative, with a case where the alternative gives
   the better result. A decision with no such case is sound; say so.
7. **Blind spots**, across the shapes a document takes (tabs, ordered runs, quotes and callouts,
   headings, frontmatter, tables, code blocks, block ids, empty and blank lines, the document's
   end) and the modes it is in (outline mode off, zoom, fold, mobile).
8. **Consistency**: within the change's own artifacts; with every spec the change would make
   untrue (search `openspec/specs/` for the behaviour, not only the capabilities it names); with
   the code's other callers; with `AGENTS.md`'s conventions.
9. **The tasks.** For each, whether its verification can pass on a result that proves nothing (a
   sweep that finds 0, a check a local setting already satisfies), and whether its negative
   control would make the test fail.
10. **The brief's claims**, each confirmed or broken.
