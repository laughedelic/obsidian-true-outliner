(() => {
  const cm = app.workspace.activeEditor.editor.cm;
  const sel = cm.state.selection.main; const line = cm.state.doc.lineAt(sel.head);
  const dom = document.getSelection().rangeCount ? document.getSelection().getRangeAt(0).getClientRects()[0] : null;
  const c = cm.coordsAtPos(sel.head);
  const xs = []; for (let i = 0; i <= Math.min(line.length, 6); i++) xs.push(+cm.coordsAtPos(line.from + i).left.toFixed(1));
  return JSON.stringify({ line: line.number - 1, ch: sel.head - line.from, text: line.text, caretX: +(dom ? dom.left : c.left).toFixed(1), colX: xs });
})()
