## ADDED Requirements

### Requirement: Enforcement is bounded by an active zoom scope
While a zoom scope is active (`outline-zoom`), enforcement SHALL take the scope as an input and
SHALL veto — with no document change and with the zoom rejection cue — any edit whose enforced
result would place content outside the zoom root's subtree. Every enforced shape is subject to
it: a merge, a single-range deletion, a multi-range deletion, a type-over and a structural paste.
With no zoom active, nothing here changes: the scope is absent and every verdict is exactly what
it was.

The judgement SHALL be `outline-zoom`'s, applied to the change enforcement would DISPATCH rather
than to the keystroke's own range. A structural paste is rewritten to splice at a node boundary,
so a caret inside the subtree can still produce an insertion outside it; judging the raw range
would pass exactly that case. Enforcement SHALL NOT state a scope rule of its own — one
judgement, two callers.

The zoom veto SHALL be evaluated only where a verdict is already being computed, and SHALL NOT
change which transactions are classified as boundary-crossing. An edit that is never enforced
today — within-node authoring, gap editing, a deletion at a programmatic gap-line caret — is not
enforced while zoomed either. This is a deliberate limit rather than a claim that such an edit
cannot reach the scope: changing a descendant heading's marker is within-node authoring and DOES
change which nodes the root's subtree contains. What it cannot do is alter content the user
cannot see, so the visible range narrows honestly rather than the document changing behind it.

Where the existing rules ALREADY veto an edit, their reason SHALL be preserved rather than
replaced by the zoom's: a zoom root that is the document's first node still reports the first-node
veto, and a merge that markdown cannot express still reports the inexpressible-merge veto. The
zoom reason is for edits that would otherwise have succeeded.

#### Scenario: A merge into hidden content is vetoed
- **WHEN** the caret sits at the zoom root's first content character, the node above it is hidden
  by the zoom, and the user presses Backspace
- **THEN** the edit is vetoed with the zoom cue, the buffer is byte-identical, and history records
  nothing — the same invisibility every other veto has

#### Scenario: A forward merge that would pull in hidden content is vetoed
- **WHEN** the caret sits at the last content character of the zoom root's last visible node and
  the user presses Delete
- **THEN** the edit is vetoed with the zoom cue and the hidden successor is untouched

#### Scenario: A merge strictly inside the subtree is unaffected
- **WHEN** the caret sits at a direct child's content start and the user presses Backspace,
  merging it into the zoom root
- **THEN** the merge is rewritten and applied exactly as it is with no zoom

#### Scenario: A structural paste is judged by where it splices, not where the caret is
- **WHEN** the same block is pasted at the zoom root's content start and again at the end of the
  root's last visible content line
- **THEN** the first is vetoed with the zoom cue, because the splice rule places it beside the
  root, and the second is applied, because the splice rule places it inside the subtree

#### Scenario: A deletion that absorbs a hidden node is vetoed even though it removes one character
- **WHEN** the caret sits at the end of the zoom root's last visible content line, the hidden
  next node would be merged into it, and the only text removed is the line break between them
- **THEN** the edit is vetoed — the size of the removal is not the question, the disappearance of
  a node from outside the subtree is

#### Scenario: A multi-range deletion with one escaping range is vetoed as a whole
- **WHEN** several ranges each exactly cover whole subtrees and one of them reaches outside the
  zoom root's subtree
- **THEN** no range is applied, matching how a multi-root structural operand is refused as a whole

#### Scenario: An existing veto keeps its own reason
- **WHEN** the zoom root is the document's first node and the user presses Backspace at its
  content start
- **THEN** the first-node veto fires with its own cue, not the zoom cue

#### Scenario: Within-node authoring is still never enforced
- **WHEN** the user types, or edits a gap line, anywhere inside the zoom scope
- **THEN** the transaction is classified and passes exactly as it does with no zoom, with no
  verdict computed for it
