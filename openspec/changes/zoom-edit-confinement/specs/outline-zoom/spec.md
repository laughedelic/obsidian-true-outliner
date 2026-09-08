## MODIFIED Requirements

### Requirement: An operation whose result would leave the zoom scope is rejected
While zoomed, a structural operation or an ENFORCED EDIT SHALL be rejected — with no document
change — when its result would place content outside the zoom root's subtree.

One GROUND covers both, and it is the scope's invariant below. Three predicates express it,
because the three sites are asked at different moments and hold different things: a structural
operation is judged before it is planned, from its resolved operand; a node-splitting key is
judged from its destination scope; and an enforced edit is judged from the change that would
actually be dispatched, which is the only one of the three that exists as a concrete after-state.
They SHALL agree on the ground, and each SHALL be stated in terms of it — a predicate that admits
a result the invariant forbids is a defect in that predicate, not a second rule.

The invariant: content is inside the scope when, with the change applied and the document
re-parsed, ALL THREE hold —

1. the text outside the zoom root's subtree is byte-identical to what it was before;
2. everything the change inserts lies inside the root's subtree as it stands after the change;
3. the zoom root has not been REPLACED — either the node beginning on its own first line holds
   the same position in the tree, or no node begins there at all. Only a DIFFERENT node
   resolving there fails this clause.

Clause (3) is stated that way on purpose. "No node begins there" is the root having been removed
outright, which is the automatic exit's business rather than an escape, and folding it into the
clause is what keeps the rule from depending on how much document follows the root: read as
"a node must resolve", it would refuse the whole-subtree deletion of a root that ENDS the document
while allowing the identical deletion anywhere else.

Each clause is load-bearing and none subsumes another. Deleting one line break can absorb a whole
hidden node into the subtree while changing nothing but that break, which only (1) catches. A
paste can leave every hidden byte untouched and still add a sibling beside the root, which only
(2) catches. A Backspace can dissolve the root without touching a byte outside it, which only (3)
catches. A rule stated as "the changed positions lie inside the cover" fails all three ways, and
a rule stated over before-state positions cannot decide the question at all, because the same
insertion offset yields content inside the subtree or outside it depending only on what is
inserted.

For a structural operation the judgement SHALL be made over the operation's RESOLVED OPERAND —
the covered roots of the current selection — rather than over a single node, so a multi-root
operand with one escaping root is refused as a whole rather than applied to the roots that happen
to be safe. It covers an operand containing the zoom root itself and an outdent of any direct
child of the zoom root. For the node-splitting keys the same ground is judged by DESTINATION
SCOPE rather than by node identity — a split landing in the zoom root's child scope is inside the
scope and is allowed — which `outline-keyboard-grammar` states case by case.

For an enforced edit the judgement SHALL be made over the change the enforcement layer would
actually dispatch, not over the keystroke's own range: a paste rewritten to splice at a node
boundary can land outside the subtree from a caret that was inside it. The edit's own kind is
irrelevant to the rule — a merge, a deletion, a type-over and a structural paste are all judged
the same way.

An edit that would DISSOLVE the zoom root without deleting its subtree SHALL be rejected on the
same ground, because the root is what the scope names: a Backspace that would unwrap an emptied
list-item zoom root moves the root itself and re-parents its children outside the subtree.
Deleting the root's whole subtree deliberately is not this case and remains allowed; it exits the
zoom instead.

The rejection SHALL use the same typed-rejection feedback path as every other structural
rejection, with a distinct reason of its own — the same reason from all three predicates, so a
refusal never tells the user which layer refused. The keyboard and the command palette already
resolve one operand and one after-state between them and SHALL keep agreeing by construction; the
enforcement filter SHALL consult the same module the other two do, so its predicate sits beside
theirs rather than in a second home.

Operations and edits whose results stay inside the scope SHALL be unaffected: indenting, moving
among siblings, splitting, merging, pasting and deleting inside the subtree all behave exactly as
they do unzoomed — including an edit that APPENDS a new last child of the zoom root, which is
inside the scope however far down the document the text lands.

#### Scenario: Outdenting a direct child of the zoom root is refused
- **WHEN** the selection covers a direct child of the zoom root and the user outdents
- **THEN** the document is unchanged and a rejection cue explains that the result would leave the
  zoomed view

#### Scenario: A multi-root operand with one escaping root is refused as a whole
- **WHEN** the selection covers several sibling subtrees that are direct children of the zoom root
  and the user outdents
- **THEN** none of them moves

#### Scenario: A split whose destination is the zoom root's sibling scope is refused
- **WHEN** the caret is at the end of a CHILDLESS zoom root's own line and the user presses Enter
- **THEN** no sibling is created, the document is unchanged, and the rejection cue is shown

#### Scenario: A split whose destination is inside the scope is allowed
- **WHEN** the caret is at the end of a zoom root that HAS children and the user presses Enter
- **THEN** a new position is created in the root's child scope, inside the visible range

#### Scenario: The same refusal comes from the command palette
- **WHEN** the outdent command is invoked from the palette with the caret in a direct child of the
  zoom root
- **THEN** it is rejected the same way, with the same cue

#### Scenario: Operations inside the subtree are untouched
- **WHEN** the user indents, moves, splits or deletes nodes strictly inside the zoom root's
  subtree
- **THEN** every operation behaves exactly as it does with no zoom active

#### Scenario: Backspace at the zoom root's content start is refused
- **WHEN** the caret sits at the zoom root's first content character and the user presses
  Backspace, with a node above the root that the zoom hides
- **THEN** the document is unchanged, the zoom stays exactly as it was, and the cue names the
  zoomed view — the root is not merged into content the user cannot see

#### Scenario: Delete at the end of the last visible line is refused
- **WHEN** the caret sits at the end of the zoom root's last visible content line and the user
  presses Delete, with a node below the subtree that the zoom hides
- **THEN** the document is unchanged, the zoom stays, and the cue is shown

#### Scenario: A deletion into chrome at the scope's edge is refused whatever produced it
- **WHEN** a gesture other than Backspace produces the same escaping edit — a whole-word deletion
  backward from the zoom root's content start, say
- **THEN** it is refused identically, because the judgement is over the resulting change and not
  over which key was pressed

#### Scenario: Deleting the cover's own trailing gap is allowed
- **WHEN** the caret sits on the blank line the zoom root's own subtree cover includes and the
  user presses Delete, consuming that gap and nothing else
- **THEN** the edit applies and the zoom stays active — the gap is inside the visible range, so
  removing it moves nothing out of the subtree, however close to the scope's edge it sits

#### Scenario: A paste that would splice outside the subtree is refused
- **WHEN** the user pastes a structural block at the zoom root's content start, where the splice
  rule would place it as a sibling of the root
- **THEN** nothing is inserted, the document is unchanged, and the cue is shown

#### Scenario: A paste that splices inside the subtree is allowed
- **WHEN** the user pastes the same block at the end of the zoom root's last visible content line,
  where the splice rule places it inside the subtree
- **THEN** it is inserted exactly as it would be with no zoom, and the zoom stays active

#### Scenario: Appending a new last child keeps the zoom
- **WHEN** the caret is at the end of the zoom root's last visible content line and the user
  presses Enter, creating a new node inside the subtree
- **THEN** the node is created and the zoom stays exactly as it was, whether or not the subtree's
  visible range ends on a trailing gap line

#### Scenario: Unwrapping an emptied list-item zoom root is refused
- **WHEN** the zoom root is a list item the user has emptied of text and they press Backspace
  again, which would unwrap it and re-parent its children
- **THEN** the document is unchanged, the zoom stays rooted where it was, and the cue is shown

#### Scenario: A first-node zoom root refuses for its own reason
- **WHEN** the zoom root is the document's first node — nothing is hidden above it — and the user
  presses Backspace at its content start
- **THEN** the existing first-node veto applies and its own cue is shown, unchanged by this rule

### Requirement: Zoom exits automatically when it can no longer be honest
The zoom SHALL clear itself, leaving the document fully visible, on any of exactly three
triggers:

1. The zoom root no longer resolves to THE SAME node — its lines were removed, or the document
   has no nodes left, or a different node now begins where the root's own first line began. A
   node merely starting at the anchor is not the root; identity is what the scope names.
2. A change that never passed enforcement touches any position outside the visible range as that
   range stood before the change. This covers history transactions, which bypass enforcement
   entirely; writes from sync or another application; and edits dispatched from another pane onto
   the same file. An ENFORCED edit SHALL NOT reach this trigger: one that would leave the scope
   is refused before it applies, and one that stays inside it is not an exit.
3. Outline mode is switched off for the file.

Each trigger SHALL clear the STORED anchor, not merely suppress the scope it would otherwise
derive: leaving the anchor in place behind a gate that only currently reads false is what let a
disabled-then-re-enabled outline mode silently resurrect the zoom the user had already left.

An automatic exit SHALL NOT modify the document and SHALL NOT move the caret.

Ordinary edits inside the scope — including editing the zoom root's own text, and including one
that appends content at the very end of the visible range — SHALL NOT exit the zoom.

#### Scenario: Deleting the zoom root exits the zoom
- **WHEN** the user selects the zoom root's whole subtree and deletes it
- **THEN** the zoom clears and the rest of the document becomes visible

#### Scenario: Undo past the zoom's boundary exits the zoom
- **WHEN** the user zooms in and then undoes an edit made before zooming, which touches content
  outside the visible range
- **THEN** the zoom clears rather than leaving a scope that no longer matches the document

#### Scenario: Editing the root's own text keeps the zoom
- **WHEN** the user types into the zoom root's own line, including emptying it of text
- **THEN** the zoom stays exactly as it was

#### Scenario: A write from outside the editor exits the zoom
- **WHEN** a sync write, another application, or another pane changes content outside the visible
  range
- **THEN** the zoom clears, because that change never passed the refusal

#### Scenario: The zoom never retargets to a different node
- **WHEN** an edit leaves a DIFFERENT node beginning where the zoom root's first line began
- **THEN** the zoom clears rather than continuing with a trail and a scope describing a node the
  user never zoomed into

#### Scenario: Turning outline mode off clears the zoom
- **WHEN** the user disables outline mode for the file while zoomed
- **THEN** the whole document renders as stock Obsidian, with no zoom and no breadcrumb trail

#### Scenario: Re-enabling outline mode does not revive a cleared zoom
- **WHEN** the user disables outline mode while zoomed, then re-enables it
- **THEN** the file opens unzoomed — trigger 3 clears the stored anchor itself, not only the
  scope it would otherwise still derive
