## 1. Spike series — setup

The series follows the ground rules of `docs/research/07-decoration-experiments-plan.md`
verbatim: one technique per spike, isolated; a fixed shared fixture corpus screenshotted every
time; a mandatory real-vault pass before any spike is called done; a recorded verdict before the
next begins; green unit tests are never the gate for anything visual.

- [x] 1.1 Create `docs/research/19-backlinks-footer-spikes.md` as the series hub: ground rules
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
      `docs/research/18`: each arm collapses independently, not only the common prefix
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

> **Order adjusted during apply.** 7.2 and 7.3 stand alone and were done first: the token layer
> is extracted and the editor is proven unchanged by it. 7.1 (S4's screenshot verdict) and 7.4
> (the footer-scoped layer) both need a footer DOM to render, which is group 8 — CSS written
> against a DOM that does not exist yet cannot be verified, and a screenshot pass needs
> something to screenshot. Both ran after group 8, against the markup they describe.
>
> **Scope corrected by the result.** S4's first verdict said the token vocabulary was
> sufficient. Measured against the rendered footer it was not: the editor computes no geometry
> in JS, so a surface sharing only the tokens writes its own layout rules and diverges. The
> shared unit is the fact→(class, custom properties) contract, now `src/plugin/chrome-line.ts`.
> S6 (below) confirmed the two alternatives to consuming it are both worse.

- [x] 7.1 Spike S4: port the guide gradient, marker widget and depth rules to a non-`.cm-line`
      DOM against the corpus, in both bundled themes; screenshot every fixture; record the
      verdict
- [x] 7.2 Split `styles.css` into a surface-neutral token layer (geometry and colour custom
      properties, no surface selectors) and the existing CM6-scoped layer that consumes it —
      behaviour-preserving, same properties and values, moved only
- [x] 7.3 Run the existing decoration e2e suites and a corpus screenshot pass in both themes to
      prove the editor is unchanged by the split
- [x] 7.4 Add the footer-scoped layer consuming the same tokens *(ran after group 8, with the DOM it styles)*

## 8. Footer surface

- [x] 8.1 Render the footer as a block widget at document end, gated on outline mode and the
      editing view, using the mechanism S1 and S2 settled on
- [x] 8.2 Render group cards: source note name, folder, per-note count, collapse; and the footer
      totals
- [x] 8.3 Render rows from `decorate(projected)` — lineage lines, referencing nodes, one level of
      children — with markers drawn identically for lineage and reference, emphasis carried by
      text treatment only
- [x] 8.4 Render node content through `MarkdownRenderer.render` with `sourcePath` set to the
      referencing note, wrapped in a `MarkdownRenderChild` for lifecycle
- [x] 8.5 Add the fold affordance for children that have children, matching the editor's own
      fold chevron placement
- [x] 8.6 Add the property row kind (no lineage, no indent, property name shown) and the embed
      marking
- [x] 8.7 Implement progressive paint: totals and note names first, groups filling in per source
      as parses land, a resolving indication that shows no fabricated structure
- [x] 8.8 Implement navigation: clicking a reference or a lineage element opens the source at
      that node, honouring Obsidian's new-pane modifiers
- [x] 8.9 Implement the dormant state for a note with no references

## 8b. Rendering model — content is notation, not reproduction (D-I / D18)

> **Added after group 8 shipped and was looked at.** The specs said what structure a row carries
> and nothing about its content, so the implementation reproduced each kind's own typography and
> the footer read as a scrapbook of other documents' fragments rather than as an index of
> mentions. Validated against a working prototype before being written down.

- [ ] 8b.1 Implement `inlineTextOf(node)`: strip the block prefix — heading hashes, quote carets,
      list marker, checkbox, ordered number, callout type token — so the renderer is only ever
      handed inline markdown and returns a single paragraph
- [ ] 8b.2 Apply the prose/record split: paragraph, heading, quote and callout lines join into one
      row; a code row shows the line the reference sits on; a table row shows the header row and
      the reference's own row, cells joined
- [ ] 8b.3 Render an HTML block's text content as plain text, not as markdown — Obsidian does not
      resolve wikilinks inside an HTML block, so rendering it as markdown only pretends to
- [ ] 8b.4 Move a task's checked state into the marker: the checkbox replaces the bullet, drawn on
      the marker column, with no checkbox inside the row's text
- [ ] 8b.5 Align the ordered-item number marker with the editor's own ordered markers, reusing the
      list-grid geometry rather than a footer-local approximation (docs/research/16)
- [ ] 8b.6 Delete what the model removes: the footer's widget-atom marker branch and the
      heading-size branch, and the CSS that served them. `markerAnchorLeftExpr` stays in
      `chrome-line.ts` — it is the editor's
- [ ] 8b.7 Extend `Backlinks/Kinds gallery.md` so every kind in the D18 table has a reference,
      including a hard-wrapped paragraph, a multi-row table with a header, and a titled callout
      whose reference sits in the BODY rather than the title

## 8c. Conformance matrix (replaces spot-checking)

> The previous verification was geometric spot-checks on a couple of rows plus a human reading
> screenshots, and it missed six defects a reader found immediately. Every assertion below is
> mechanical.

- [ ] 8c.1 The single invariant that catches the whole class: **no row contains a block-level
      element**. Asserted over every row of every fixture, in both themes
- [ ] 8c.2 Per-kind matrix over `Kinds gallery`: for every kind, assert the marker is present and
      of that kind, sits on the depth's column, and is centred on its own text's x-height band
- [ ] 8c.3 Per-kind matrix, continued: assert every row's height is within one line-height of a
      plain paragraph row's — the machine-checkable form of "the outline has one rhythm"
- [ ] 8c.4 Assert the per-kind content rules directly: a heading row's font-size equals a
      paragraph row's; a task row's marker is a checkbox and its text holds none; an ordered row's
      marker is its number; a callout row shows no type token; a table row shows exactly two
      source rows
- [ ] 8c.5 Commit screenshot baselines per fixture and theme, and diff against them, so a
      rendering change fails a test rather than waiting to be noticed
- [ ] 8c.6 Run the matrix on mobile as well as desktop — the viewport differences are exactly
      where the earlier assertions turned out to be measuring the wrong thing

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

## 9b. Spike S6 — is there a cheaper renderer than our own chrome?

- [x] 9b.1 Build both alternatives behind a switch: the group as one markdown list, and a real
      CodeMirror per group running the plugin's decoration stack
- [x] 9b.2 Render the same note in all three modes across both bundled themes, screenshot, and
      compare as pictures rather than as arguments
- [x] 9b.3 Record the S6 verdict and remove the apparatus

## 10. Close-out

- [ ] 10.1 Update `docs/research/18-structured-backlinks.md` where a spike result contradicts or
      sharpens a recorded decision
- [ ] 10.2 Confirm `openspec validate backlinks-footer --strict` passes and every spec scenario
      has either automated coverage or a recorded manual verification
