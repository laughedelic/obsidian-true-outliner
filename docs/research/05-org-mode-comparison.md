# Org-mode Comparison

Org-mode (Emacs) is the closest living reference for our mapping algebra: a plain-text file
whose heading tree + plain lists support promote/demote/move/fold/narrow as first-class
structural operations, with the markup itself as the only source of truth. This doc records
where we deliberately align with org and where we diverge — both to keep our own rules
consistent and to give org-literate users a mental anchor.

(Author note: neither of us is an org user; this is from documentation/community knowledge.
Claims worth re-verifying against a live org session are marked ⚠.)

## Where we align

| Concept | Org-mode | True Outliner |
| --- | --- | --- |
| Heading depth encoding | `*` count = level; hierarchy **derived** from levels | `#` count = level; same derivation |
| Promote/demote | level ± 1 (`M-S-←/→` shifts whole subtree) | Tab/S-Tab = level ± 1, subtree always shifts |
| Skipped levels | permitted; hierarchy still derives correctly | preserved as-is; depth = tree position |
| Demote creating a "skip" | allowed — a styling-only edit, position unchanged | same, accepted consequence |
| Zoom | narrowing (`C-x n s` on a subtree) | zoom via replace-decorations + breadcrumbs |
| Display-only indentation | `org-indent-mode`: **virtual** indentation reflecting depth, file content untouched | the entire outline toggle — pure UI, zero rewrite |
| Source of truth | the plain-text file, always | markdown file, always (isomorphism invariant) |
| Fold anything | headlines and list subtrees both fold | same (Obsidian core already does both) |

The `org-indent-mode` precedent is worth stressing: org proved decades ago that "render the
implied hierarchy as indentation without touching the file" is a workable, beloved editing
model. Our outline toggle is that idea, generalized.

## Where we diverge (deliberately)

| Concept | Org-mode | True Outliner | Why we diverge |
| --- | --- | --- | --- |
| Depth bound | unlimited stars | h6 floor — demote rejected at h6 | markdown has no h7; principle says reject, never mangle |
| Headline-only promote | `M-←/→` re-levels a single headline, children can end up re-parented oddly ⚠ | not offered in v1 — subtree shift only | single-heading re-level lets users create structural surprises; one predictable op beats two confusable ones |
| Paragraphs as nodes | body text is *content of* a headline, not an outline node; structure ops don't move individual paragraphs | paragraphs are first-class tree nodes: selectable, movable, indentable | this is the core of the "any note is an outline" thesis |
| List after paragraph | no parent–child relation; a list is just section content | list following a paragraph = that paragraph's children (provisional) | the only lossless way to give paragraphs children in markdown |
| Tab key | `TAB` = visibility cycling (fold), structure edits on `M-` chords | Tab/S-Tab = indent/outdent (fold on chevron/command) | we follow the Workflowy/Logseq/Roam outliner convention our users expect |
| Node types on reparent | n/a (one body-content blob) | context-determined encoding (nearest-sibling type) | needed because markdown has multiple encodings for "a node" |
| Task/TODO states | first-class on headlines (TODO/DONE, tags, properties) | plain content in v1 | deliberate MVP cut (Q9) |
| Fold persistence | in-file (`STARTUP` keywords, `VISIBILITY` properties) | plugin data store, files stay clean | clean-files invariant (Q3) |

## Takeaways for implementation

1. When in doubt on a heading-op edge case, ask "what does org do?" first — it has 20+ years
   of edge-case erosion behind it.
2. When our answer differs, it should trace back to one of: (a) a markdown constraint (h6),
   (b) the paragraphs-are-nodes thesis, (c) the clean-files invariant, or (d) outliner-UX
   convention. If a divergence doesn't trace to one of those, reconsider it.
3. Positioning bonus: "org-mode-style structure editing for any markdown note" is a crisp,
   honest one-liner for the org-aware slice of the audience.
