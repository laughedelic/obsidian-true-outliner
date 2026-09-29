// Rebuilds, copies main.js and styles.css into a vault copy, and times how long the running app
// takes to report the new build stamp. Run: node hot-reload-probe.mjs <vault copy>
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync } from 'node:fs';
const [page] = (await (await fetch('http://127.0.0.1:9333/json')).json()).filter((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
const V = process.argv[2];
const stamp = () => ev(`app.plugins.plugins['true-outliner']?.buildStamp?.clock ?? null`);
console.log('before', await stamp());
const t0 = performance.now();
execFileSync('node', ['scripts/build.ts', 'production', '--dev'], { stdio: 'ignore' });
const t1 = performance.now();
for (const f of ['main.js', 'styles.css']) copyFileSync(f, `${V}/.obsidian/plugins/true-outliner/${f}`);
const want = /"clock": "([^"]+)"/.exec(readFileSync('main.js', 'utf8'))?.[1];
console.log('want', want);
let cur; while ((cur = await stamp()) !== want) { if (performance.now() - t1 > 15000) break; await new Promise((r) => setTimeout(r, 20)); }
const t2 = performance.now();
console.log('after', cur, `build ${(t1 - t0).toFixed(0)} ms, copy+reload ${(t2 - t1).toFixed(0)} ms`);
console.log(await ev(`app.workspace.activeEditor?.editor?.getValue()?.length`));
ws.close();
