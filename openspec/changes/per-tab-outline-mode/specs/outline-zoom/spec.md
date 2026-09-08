# outline-zoom Delta

## MODIFIED Requirements

### Requirement: Zoom exits automatically when it can no longer be honest
The zoom SHALL clear itself, leaving the document fully visible, on any of exactly three
triggers:

1. The zoom root no longer resolves to a node — its lines were removed, or the document has no
   nodes left.
2. A change touches any position outside the visible range as that range stood before the change.
   This covers history transactions, which bypass enforcement entirely; writes from sync or
   another application; and edits dispatched from another pane onto the same file.
3. Outline mode is switched off in the view holding the zoom. Trigger 3 fires for that view and
   for no other: the mode is a per-tab state, so a second view on the same file keeps both its
   own mode and its own scope, which is the same per-view shape this capability's own scope model
   has.

Each trigger SHALL clear the STORED anchor, not merely suppress the scope it would otherwise
derive: leaving the anchor in place behind a gate that only currently reads false is what let a
disabled-then-re-enabled outline mode silently resurrect the zoom the user had already left.

An automatic exit SHALL NOT modify the document and SHALL NOT move the caret.

Ordinary edits inside the scope — including editing the zoom root's own text — SHALL NOT exit the
zoom.

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

#### Scenario: Turning outline mode off clears the zoom
- **WHEN** the user turns outline mode off in a zoomed tab
- **THEN** that tab renders as stock Obsidian, with no zoom and no breadcrumb trail

#### Scenario: Another view on the same file keeps its zoom
- **WHEN** two tabs show the same file, each zoomed, and the user turns outline mode off in one
- **THEN** the other tab keeps its own outline mode and its own zoom, unchanged

#### Scenario: Re-enabling outline mode does not revive a cleared zoom
- **WHEN** the user turns outline mode off in a zoomed tab, then turns it back on
- **THEN** that tab is unzoomed — trigger 3 clears the stored anchor itself, not only the
  scope it would otherwise still derive
