// Reads the browser process id (SystemInfo.getProcessInfo), then closes the app (Browser.close).
const v = await (await fetch('http://127.0.0.1:9333/json/version')).json();
console.log(v.Browser, Object.keys(v).join(','));
const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => console.log('msg', String(m.data).slice(0, 200));
ws.send(JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' }));
await new Promise((r) => setTimeout(r, 300));
ws.send(JSON.stringify({ id: 2, method: 'Browser.close' }));
await new Promise((r) => setTimeout(r, 1500));
