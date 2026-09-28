// Launches Obsidian on a vault copy through obsidian-launcher and prints the time to the debugging
// port and to a loaded plugin. Run: node cold-start-probe.mjs <dir holding 'vault'>, with DISPLAY set in the script.
import { spawn } from 'node:child_process';
const S = process.argv[2];
const t0 = performance.now(); const lap = (l) => console.log(l.padEnd(22), ((performance.now() - t0) / 1000).toFixed(2), 's');
const child = spawn(process.execPath, ['node_modules/obsidian-launcher/dist/cli.js', 'launch', '-c', '/opt/obsidian-cache', `${S}/vault`, '--', '--remote-debugging-port=9333', '--no-sandbox'], { env: { ...process.env, DISPLAY: ':77' }, stdio: 'ignore', detached: true });
child.unref();
let target; for (;;) { try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((t) => t.type === 'page'); if (target) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
lap('debug port up');
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); pend.get(d.id)?.(d); };
const ev = (expression) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })); }).then((d) => d.result?.result?.value);
for (;;) { if (await ev(`!!(globalThis.app?.plugins?.plugins?.['true-outliner'] && app.workspace?.layoutReady)`)) break; await new Promise((r) => setTimeout(r, 50)); }
lap('plugin loaded, layout');
ws.close();
