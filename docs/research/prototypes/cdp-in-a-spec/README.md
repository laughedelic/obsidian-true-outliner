# The DevTools protocol from a spec

The probes behind "From inside a spec" in
[`../../rendered-ui-observability.md`](../../rendered-ui-observability.md), and the change they led
to. Each is a spec file kept as text. Copy it to `e2e-tests/specs/99-zz-cdp-probe.e2e.ts`, run it
narrow, once with `--mobile`, and delete the copy afterwards. Each writes its readings as JSON to
the system temporary directory, named for the run.

- `raw-socket-probe.e2e.ts.txt` lists the debugger address's targets, compares the window handle
  with the page target's id, then opens a WebSocket with Node's global `WebSocket` and times an
  evaluation, a key, a screenshot with and without a clip, an event subscription, and a close.
- `puppeteer-and-reload-probe.e2e.ts.txt` connects through `browser.getPuppeteer()`, which needs
  `npm install --no-save puppeteer-core@24` first (restore the tree with `npm ci`), and then reads
  the address and window handle before and after `browser.reloadObsidian()`.

```bash
sh e2e-tests/docker/start-xvfb-and-run.sh npm run test:e2e:narrow -- 99-zz-cdp [--mobile] > run.log 2>&1
```
