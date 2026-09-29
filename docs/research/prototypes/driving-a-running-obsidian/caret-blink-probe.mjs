// Screenshots a 120x30 clip around the caret, and compares each against a clip taken with the native
// caret hidden: 'C' is a shot that shows the caret. Run: node caret-blink-probe.mjs
import { createHash } from 'node:crypto';
const [page] = (await (await fetch('http://127.0.0.1:9333/json')).json()).filter((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rect = await ev(`(() => { const r = getSelection().getRangeAt(0).getClientRects()[0] ?? getSelection().getRangeAt(0).getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
console.log('caret rect', JSON.stringify(rect));
const clip = { x: Math.max(0, rect.x - 40), y: Math.max(0, rect.y - 6), width: 120, height: 30, scale: 2 };
const shot = async () => createHash('md5').update((await send('Page.captureScreenshot', { format: 'png', clip })).result.data).digest('hex').slice(0, 6);
await ev(`(() => { const s = document.createElement('style'); s.id='nocaret'; s.textContent='.cm-content{caret-color:transparent !important}'; document.head.append(s); })()`);
await sleep(100);
const bare = await shot();
await ev(`document.getElementById('nocaret').remove()`);
console.log('no-caret hash', bare);
// A: plain, 150ms apart
let a = []; for (let i = 0; i < 12; i++) { a.push((await shot()) === bare ? '.' : 'C'); await sleep(150); }
console.log('plain, 150ms apart      ', a.join(''));
// B: reset selection to same range then shoot immediately
const reset = `(() => { const s = getSelection(); const {anchorNode:an, anchorOffset:ao, focusNode:fn, focusOffset:fo} = s; s.setBaseAndExtent(an, ao, fn, fo); })()`;
let b = []; for (let i = 0; i < 12; i++) { await sleep(230 + i*37); await ev(reset); b.push((await shot()) === bare ? '.' : 'C'); }
console.log('setBaseAndExtent + shot ', b.join(''));
// C: cm.dispatch of the same selection
const dispatch = `(() => { const cm = app.workspace.activeEditor.editor.cm; cm.dispatch({ selection: cm.state.selection }); })()`;
let c = []; for (let i = 0; i < 12; i++) { await sleep(230 + i*37); await ev(dispatch); c.push((await shot()) === bare ? '.' : 'C'); }
console.log('cm.dispatch + shot      ', c.join(''));
// D: nudge caret by one and back
const nudge = `(() => { const e = app.workspace.activeEditor.editor; const c = e.getCursor(); e.setCursor({line:c.line, ch:c.ch}); })()`;
let d = []; for (let i = 0; i < 12; i++) { await sleep(230 + i*37); await ev(nudge); d.push((await shot()) === bare ? '.' : 'C'); }
console.log('editor.setCursor + shot ', d.join(''));
ws.close();
