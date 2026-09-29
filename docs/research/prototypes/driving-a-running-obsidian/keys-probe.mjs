// Sends keys to a running Obsidian (debugging port 9333) with Input.dispatchKeyEvent and reads the
// buffer and caret back after each. Run: node keys-probe.mjs
const [page] = (await (await fetch('http://127.0.0.1:9333/json')).json()).filter((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
const key = async (o) => { await send('Input.dispatchKeyEvent', { type: o.text ? 'keyDown' : 'rawKeyDown', ...o }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: o.key, code: o.code, windowsVirtualKeyCode: o.windowsVirtualKeyCode, modifiers: o.modifiers }); };
const buf = () => ev(`(() => { const e = app.workspace.activeEditor.editor; const c = e.getCursor(); return JSON.stringify({ text: e.getValue(), c: [c.line, c.ch] }); })()`);
// scratch note
console.log(await ev(`(async () => { const p='Scratch.md'; const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f); await app.vault.create(p, '- alpha\\n  - beta\\n- gamma\\n'); await app.workspace.openLinkText(p, '', false); await new Promise(r=>setTimeout(r,400)); const e = app.workspace.activeEditor.editor; e.focus(); e.setCursor({line:1, ch:8}); return app.plugins.plugins['true-outliner'].activeTabOutlineMode(); })()`));
console.log('start', await buf());
await key({ key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }); console.log('down', await buf());
await key({ key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 }); console.log('up', await buf());
await key({ key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); console.log('tab', await buf());
await key({ key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 }); console.log('shift-tab', await buf());
await key({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); console.log('enter', await buf());
await key({ key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, text: 'x' }); console.log('x', await buf());
await key({ key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); console.log('bksp', await buf());
await key({ key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, modifiers: 8 }); console.log('shift-left', await buf(), await ev('getSelection().toString()'));
await key({ key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }); console.log('ctrl-a', await buf(), JSON.stringify(await ev('getSelection().toString()')));
await send('Input.insertText', { text: 'zz' }); console.log('insertText', await buf());
ws.close();
