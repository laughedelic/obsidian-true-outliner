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

The invariant, asked in this order:

0. **Did the change remove the zoom root's WHOLE subtree cover?** If so it is not an escape, and
   neither clause below is asked. The root was deleted outright and the automatic exit owns what
   happens next.
1. Otherwise the root SHALL NOT have been REPLACED: the node that OWNS the root's own first line
   holds the same position in the tree that the root held.
2. And the text outside the zoom root's subtree — the root re-resolved on that line — SHALL be
   byte-identical to what it was before.

**Clause 0 is asked first because the other two cannot be asked at all once the root is gone.**
Both of them begin by locating the root on its own first line, and a deletion of the whole subtree
leaves some OTHER node occupying that line — a following sibling sliding up, or, at the end of a
document, the node above owning the trailing blank line. Whichever it is gets mistaken for the
root, and the two clauses then compare against the wrong subtree: clause 2 sees the sibling move
from outside the cover to inside it and reports changed text, and clause 1 sees a different tree
position. A deliberate whole-subtree deletion is meant to succeed, and without clause 0 it is
refused twice over. Clause 0 is a fact about the CHANGE rather than about the after-state, which
is exactly why it can be answered when the other two cannot.

**Clause 1 resolves the line by OWNERSHIP**, the way every other line-to-node question in this
system is asked. Both readings refuse the same edits — a Backspace that empties the zoom root's
own line leaves nothing beginning there and the node above owning it, which fails the clause as a
differing position under one reading and as an unresolvable root under the other — so this is a
consistency requirement rather than a behavioural one, and it is stated so that an implementation
does not have to rediscover that the two agree.

Neither remaining clause subsumes the other. Deleting one line break can absorb a whole hidden
node into the subtree while changing nothing but that break, which only clause 2 catches; a
Backspace can dissolve the root without touching a byte outside it, which only clause 1 catches.
Clause 2 also covers everything an "inserted content landed outside the subtree" clause would:
content inserted outside the subtree necessarily changes the text outside it, so such a clause
could never be the one to fail and is not stated.

A rule stated as "the changed positions lie inside the cover" fails every one of these ways, and a
rule stated over before-state positions cannot decide the question at all, because the same
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

*(Amendment 2026-09-18, `paste-lands-where-it-is-pointed`: the paste scenarios below named a
GESTURE — the caret at the zoom root's content start — as the one whose splice lands beside the
root. That is no longer what the splice rule does there: a paste now anchors at the boundary
immediately after the anchor's own lines, which is the first child's `before` wherever the anchor
has children, so a caret on a zoom root WITH children splices inside the scope. The ground is
unchanged; the gestures that fall on each side of it are not. A caret on a CHILDLESS root still
names that root's next-sibling slot, which is where the refusal is stated from now.)*

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

#### Scenario: An escaping edit is refused whatever gesture produced it
- **WHEN** a gesture other than Backspace produces the same escaping change — a selection spanning
  the root's leading boundary and deleted, say
- **THEN** it is refused identically, because the judgement is over the resulting change and not
  over which key was pressed

#### Scenario: An edit enforcement never sees dissolves the root by exiting, not by refusing
- **WHEN** a change the enforcement layer does not judge leaves a DIFFERENT node where the zoom
  root's first line began — deleting to the line start empties the root's own line, and one line
  with one owner is within-node authoring
- **THEN** the edit applies and the zoom CLEARS, rather than staying active on a node the user
  never zoomed into. Such an edit cannot reach content outside the subtree, which is why it is not
  refused; what it can do is dissolve the root, and that is the automatic exit's business

#### Scenario: Deleting the cover's own trailing gap is allowed
- **WHEN** the caret sits on the blank line the zoom root's own subtree cover includes and the
  user presses Delete, consuming that gap and nothing else
- **THEN** the edit applies and the zoom stays active — the gap is inside the visible range, so
  removing it moves nothing out of the subtree, however close to the scope's edge it sits

#### Scenario: A paste that would splice outside the subtree is refused
- **WHEN** the user pastes a structural block with the caret on a CHILDLESS zoom root's own line,
  where the splice rule places it as a sibling of the root
- **THEN** nothing is inserted, the document is unchanged, and the cue is shown

#### Scenario: A paste at a root WITH children lands in its child scope
- **WHEN** the user pastes a structural block with the caret on a zoom root that HAS children
- **THEN** it is inserted as that root's first child — inside the scope, so the zoom rule has
  nothing to refuse — and the zoom stays active

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
