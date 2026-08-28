## 1. Spike series — setup

The series follows the ground rules of `docs/research/07-decoration-experiments-plan.md`
verbatim: one technique per spike, isolated; a fixed shared fixture corpus screenshotted every
time; a mandatory real-vault pass before any spike is called done; a recorded verdict before the
next begins; green unit tests are never the gate for anything visual.

- [x] 1.1 Create `docs/research/17-backlinks-footer-spikes.md` as the series hub: ground rules
      (inherited, not restated), the results table with one row per spike awaiting a verdict, and
      the map to per-spike sections
- [x] 1.2 Assemble the shared fixture corpus in `test-vault/`: a target note referenced from
      notes exercising every case — deep single-child chain, one branch with arms of differing
      depth, reference at root depth, reference inside a list under a paragraph, reference inside
      an atom (callout/table), multi-line ancestor, frontmatter property, embed, anchor link,
      alias link, and a hub note with several hundred references
- [x] 1.3 Record the corpus in the hub doc and note which spike each fixture is diagnostic for

## 2. Spike S1 — block widget vs. the enforcement layer (gates everything after)

- [x] 2.1 Build a minimal, content-free `Decoration.widget({block: true})` at `state.doc.length`
      behind a debug flag, registered alongside the existing extensions
- [x] 2.2 Measure caret behaviour: caret to document end, `Mod+End`, arrow-down off the last
      line, click below the last line, click into the widget region — record actual resulting
      positions against `content-space-caret`'s addressability rules
- [x] 2.3 Measure selection behaviour: the `progressive-select-all` ladder to whole-document,
      shift-extension past the last node, and escalation of a selection ending at the last node
- [x] 2.4 Measure structural operations on the last node — indent, outdent, move up/down, Enter
      and Shift+Enter at the end of the document — and undo/redo across each
- [x] 2.5 Instrument via the existing transaction-classification stats; record which
      classifications the widget's presence changes, if any
- [x] 2.6 Record the S1 verdict in the hub doc. **If the widget perturbs caret placement or
      selection escalation in ways the transaction filter cannot absorb, stop and reopen D1
      (surface) with the user before proceeding** — the sidebar-pane fallback leaves tasks 4–7
      intact and only replaces group 8

## 3. Spike S2 — widget lifecycle

- [x] 3.1 Exercise mode toggle on/off, file switch within one leaf, two leaves on one file,
      Live Preview ↔ Source toggle, and window resize; assert exactly one widget instance per
      editor at all times
- [x] 3.2 Exercise print/export and the mobile viewport; record what the widget does in each
- [x] 3.3 Check for orphaned DOM and duplicate widgets after 50 rapid open/close cycles — the
      failure mode `coalesce` fights with a `MutationObserver`; record whether any equivalent
      defence would be needed and why
- [x] 3.4 Record the S2 verdict; any leak or duplicate changes the mechanism before group 8 starts

## 4. Spike S3 — `decorate()` on a foreign, projected tree

> **Order adjusted during apply.** S3 decorates a *projection*, so it depends on `project()`
> from group 5, which the original ordering put after it. Group 5.1 (and only 5.1) therefore
> runs first; S3 then measures against it, and the rest of group 5 hardens the function
> afterwards — which keeps 4.3's intent intact, since a divergence still lands before the
> projection is finalised.

- [x] 4.1 Write a throwaway harness that decorates each corpus note twice: once as the open
      document, once as a projection of that note parsed from disk
- [x] 4.2 Assert per-node equality of depth, kind, `isFirstLine`, `isAtom`, `isListItem`,
      `hasNativeMarker`, `supplementalDepth` and `hasChildren` for every surviving node
- [x] 4.3 Record the S3 verdict. Any divergence means D-A is wrong and `decorate()` needs an
      explicit seam before reuse — resolve before group 5 hardens the projection

## 5. Tree projection (mapping core, pure)

- [x] 5.1 Implement `project(doc, predicate, descendantDepth) → OutlineDoc` per the
      `tree-projection` spec: matches, their ancestors, their descendants to depth, nothing else
- [x] 5.2 Unit-test the subset guarantees: only paths reaching a match survive; ancestors
      survive; descendants respect the depth bound; node content carried through unmodified;
      empty predicate yields an empty document
- [x] 5.3 Property-test with fast-check (following `tests/` convention): projection is
      idempotent; surviving nodes preserve source document order; a projection over a predicate
      matching everything is structurally the source
- [x] 5.4 Implement the lineage pass as a separate function over a projected tree: maximal runs
      of non-match, non-branch-point nodes collapse into chains; the terminating branch point
      joins its chain; a terminating match does not
- [x] 5.5 Unit-test lineage recursion explicitly with the `a/b → c/d → e/f/g` shape from
      `docs/research/16`: each arm collapses independently, not only the common prefix
- [x] 5.6 Unit-test the edge cases: a one-element chain still forms a chain; a root-level match
      forms none; a chain reports its first element's kind; elements stay individually addressable

## 6. Backlink index

- [x] 6.1 Build the reverse map from `resolvedLinks` at `onLayoutReady`, and update it
      incrementally on `metadataCache` `changed`, `resolve`, `resolved` and `deleted`
- [x] 6.2 Classify each reference as Note, Anchor, Embed or Property from `getFileCache().links`,
      `.embeds` and `.frontmatterLinks`, using `parseLinktext` and `resolveSubpath`; exclude
      self-references
- [x] 6.3 Add the source-tree cache: `cachedRead` + the plugin's own `parse()`, keyed on path and
      mtime, following the `parsed-doc.ts` pattern with a key appropriate to files rather than
      CM6 `Text`
- [x] 6.4 Map each reference's text position to the node containing it, and build the predicate
      that `project()` consumes
- [x] 6.5 Expose the two-stage answer: referencing notes and per-note counts without any file
      read; placed references per source, resolving independently
- [x] 6.6 Test invalidation against the spec's scenarios: added link appears, removed link
      disappears, deleted source evicted, renamed source re-keyed, edited source re-parsed
- [x] 6.7 Verify no undocumented API is reached — lint clean under `eslint-plugin-obsidianmd`,
      no `any`-cast into Obsidian internals

## 7. Chrome refactor (S4 informs this)

> **Order adjusted during apply.** 7.2 and 7.3 stand alone and are done: the token layer is
> extracted and the editor is proven unchanged by it. 7.1 (S4's screenshot verdict) and 7.4
> (the footer-scoped layer) both need a footer DOM to render, which is group 8 — CSS written
> against a DOM that does not exist yet cannot be verified, and a screenshot pass needs
> something to screenshot. Both move into group 8, where they land with the markup they
> describe.

- [ ] 7.1 Spike S4 *(runs in group 8)*: port the guide gradient, marker widget and depth rules
      to a non-`.cm-line` DOM against the corpus, in both bundled themes; screenshot every
      fixture; record the verdict
- [x] 7.2 Split `styles.css` into a surface-neutral token layer (geometry and colour custom
      properties, no surface selectors) and the existing CM6-scoped layer that consumes it —
      behaviour-preserving, same properties and values, moved only
- [x] 7.3 Run the existing decoration e2e suites and a corpus screenshot pass in both themes to
      prove the editor is unchanged by the split
- [ ] 7.4 Add the footer-scoped layer consuming the same tokens *(runs in group 8, with the DOM it styles)*

## 8. Footer surface

- [ ] 8.1 Render the footer as a block widget at document end, gated on outline mode and the
      editing view, using the mechanism S1 and S2 settled on
- [ ] 8.2 Render group cards: source note name, folder, per-note count, collapse; and the footer
      totals
- [ ] 8.3 Render rows from `decorate(projected)` — lineage lines, referencing nodes, one level of
      children — with markers drawn identically for lineage and reference, emphasis carried by
      text treatment only
- [ ] 8.4 Render node content through `MarkdownRenderer.render` with `sourcePath` set to the
      referencing note, wrapped in a `MarkdownRenderChild` for lifecycle
- [ ] 8.5 Add the fold affordance for children that have children, matching the editor's own
      fold chevron placement
- [ ] 8.6 Add the property row kind (no lineage, no indent, property name shown) and the embed
      marking
- [ ] 8.7 Implement progressive paint: totals and note names first, groups filling in per source
      as parses land, a resolving indication that shows no fabricated structure
- [ ] 8.8 Implement navigation: clicking a reference or a lineage element opens the source at
      that node, honouring Obsidian's new-pane modifiers
- [ ] 8.9 Implement the dormant state for a note with no references

## 9. Verification

- [ ] 9.1 e2e: the footer renders in outline mode and not off-mode, and not in reading view
- [ ] 9.2 e2e: opening, scrolling and interacting with a note leaves its bytes and undo stack
      unchanged, and document positions identical with and without the footer
- [ ] 9.3 e2e: shared ancestors render once; an unbranching chain renders as one lineage line;
      each arm of a branch collapses independently
- [ ] 9.4 e2e: counts appear before context, and groups resolve independently
- [ ] 9.5 Real-vault pass over the corpus in both bundled themes, screenshotted — the mandatory
      gate, not the unit tests
- [ ] 9.6 Spike S5: time index build, per-source read+parse, projection and first paint on the
      hub-note fixture; record the numbers in the hub doc as the input `backlinks-controls` needs
      for its cap defaults
- [ ] 9.7 Close every spike row in the hub doc with a verdict, and record cross-spike lessons
      where they belong (`docs/research/11` for decoration/CM6 findings)

## 10. Close-out

- [ ] 10.1 Update `docs/research/16-structured-backlinks.md` where a spike result contradicts or
      sharpens a recorded decision
- [ ] 10.2 Confirm `openspec validate backlinks-footer --strict` passes and every spec scenario
      has either automated coverage or a recorded manual verification
