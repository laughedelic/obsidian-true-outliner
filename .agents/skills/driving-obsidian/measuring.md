# Measuring what a screenshot cannot settle

Page scripts for `npm run drive -- eval`. `eval` runs in Obsidian's page with its `app`, keeps
`const` declarations from one call to the next, and prints the value. The editor is
`app.workspace.activeEditor.editor`, its CodeMirror view `.cm`.

## The painted caret against the state's

Obsidian draws the browser's native caret, so the DOM selection's rect is the painted caret. Equal
to `coordsAtPos` means the caret is where the state says, to the hundredth of a pixel.

```bash
npm run drive -- eval '
const cm = app.workspace.activeEditor.editor.cm;
const painted = getSelection().getRangeAt(0).getClientRects()[0];
const logical = cm.coordsAtPos(cm.state.selection.main.head);
({ painted: painted.x, logical: logical.left, top: painted.y, height: painted.height })'
```

## Whether the caret can be seen

`coordsAtPos` says nothing about a caret clipped by an `overflow: hidden` box (#128).
`elementFromPoint` at the caret's centre names what is painted there, and the caret's rect against
the scroller's says whether it is inside.

```bash
npm run drive -- eval '
const cm = app.workspace.activeEditor.editor.cm;
const c = getSelection().getRangeAt(0).getClientRects()[0];
const at = document.elementFromPoint(c.x, c.y + c.height / 2);
({ hit: at?.className, insideEditor: !!at?.closest(".cm-content"),
   insideScroller: cm.scrollDOM.getBoundingClientRect().left <= c.x })'
```

## Scroll, frame by frame

A jump that lasts one frame needs a sampler; two reads of `scrollTop` miss it. Start it, press the
keys, then read it back.

```bash
npm run drive -- eval 'window.__frames = []; (function t() { if (window.__frames) {
  __frames.push(app.workspace.activeEditor.editor.cm.scrollDOM.scrollTop); requestAnimationFrame(t); } })()'
npm run drive -- key ArrowDown ArrowDown
npm run drive -- eval 'const f = window.__frames; window.__frames = null; f'
```

Constant values mean the keys left the scroll alone. A step in the list is a jump, and its index is
the frame it landed in.
