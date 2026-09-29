/**
 * Drives one running Obsidian over the DevTools protocol, for an agent that wants to look at the
 * real app between edits. The skill `.agents/skills/driving-obsidian/` says when to reach for it.
 *
 *   node scripts/drive.ts <command> [args]        (npm run drive -- <command>)
 *
 * The app runs on a copy of `test-vault` under `.obsidian-cache/drive/`, and each command is a
 * short-lived process that reconnects to it; what persists between commands is
 * `.obsidian-cache/drive/session.json`. The measurements behind the choices here are in
 * docs/research/driving-a-running-obsidian.md.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { binPath } from './bin-path.ts';
import { expandKeys, keyEvents, parseChord } from './drive-keys.ts';
import { isLauncherProfile } from './drive-profile.ts';
import { drawColumns, stateMarkup } from './drive-state.ts';
import { stampFromBundle } from './install-to-vault.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.obsidian-cache', 'drive');
const sessionFile = path.join(dir, 'session.json');
const vaultDir = path.join(dir, 'vault');
const shotsDir = path.join(dir, 'shots');
const logFile = path.join(dir, 'obsidian.log');
const pluginDir = path.join(vaultDir, '.obsidian', 'plugins', 'true-outliner');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---- Session ---------------------------------------------------------------

interface Session {
  port: number;
  /** The browser process, from `SystemInfo.getProcessInfo`. */
  pid: number;
  /** The launcher's sandboxed profile, removed on stop. */
  userDataDir: string | null;
  /** Set when we started an Xvfb, which is then ours to stop. */
  xvfb: { pid: number; display: string } | null;
}

function readSession(): Session | undefined {
  try {
    return JSON.parse(readFileSync(sessionFile, 'utf8')) as Session;
  } catch {
    return undefined;
  }
}

function requireSession(): Session {
  const session = readSession();
  if (!session) throw new Error('no session: run `npm run drive -- start` first');
  return session;
}

async function listTargets(port: number, timeoutMs = 1500): Promise<{ type: string; url: string; webSocketDebuggerUrl: string }[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(timeoutMs) });
  return (await res.json()) as { type: string; url: string; webSocketDebuggerUrl: string }[];
}

async function isUp(session: Session): Promise<boolean> {
  try {
    return (await listTargets(session.port)).some((t) => t.type === 'page');
  } catch {
    return false;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---- The protocol ----------------------------------------------------------

class Cdp {
  private id = 0;
  private pending = new Map<number, (message: { result?: any; error?: { message: string } }) => void>();
  private readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: any; error?: { message: string } };
      if (message.id !== undefined) this.pending.get(message.id)?.(message);
    };
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`cannot connect to ${url}`));
    });
    return new Cdp(ws);
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} did not answer in ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates `expression` in the page. `repl` allows top-level `await` and re-declaring a `const`. */
  async evaluate(expression: string, repl = false): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...(repl ? { replMode: true } : {}),
    });
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      throw new Error(String(d.exception?.description ?? d.exception?.value ?? d.text));
    }
    return result.result?.value;
  }

  /** Runs a function in the page with one JSON argument, and returns its value. */
  run<A, R>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R> {
    return this.evaluate(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`) as Promise<R>;
  }

  close(): void {
    this.ws.close();
  }
}

async function attach(session: Session = requireSession()): Promise<Cdp> {
  let targets;
  try {
    targets = await listTargets(session.port);
  } catch {
    throw new Error(`nothing answers on port ${session.port}: the app has stopped; run \`start\` again`);
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('the app has no page target yet');
  return Cdp.connect(page.webSocketDebuggerUrl);
}

// The functions below run inside Obsidian's page, not here. `app` is Obsidian's global.
declare const app: any;
declare const window: any;
declare const document: any;
declare function getSelection(): any;

const SETTLE = `new Promise((r) => { const t = setTimeout(r, 400); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(undefined); })); })`;

// ---- start, status, stop ---------------------------------------------------

function log(message: string): void {
  console.log(message);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** An Xvfb of our own on the first free display from :77, polled for its socket like
 * e2e-tests/docker/start-xvfb-and-run.sh (`xvfb-run`'s handshake hangs). */
async function startXvfb(): Promise<{ pid: number; display: string }> {
  let n = 77;
  while (existsSync(`/tmp/.X11-unix/X${n}`) || existsSync(`/tmp/.X${n}-lock`)) n++;
  const display = `:${n}`;
  let failure: Error | undefined;
  const child = spawn('Xvfb', [display, '-screen', '0', '1280x900x24', '-nolisten', 'tcp'], {
    detached: true,
    stdio: 'ignore',
  });
  child.once('error', (e) => (failure = e));
  child.unref();
  for (let tries = 0; tries < 100; tries++) {
    if (failure) {
      throw new Error(`cannot start Xvfb (${failure.message}); a cloud session needs the packages in docs/cloud-sessions.md`);
    }
    if (existsSync(`/tmp/.X11-unix/X${n}`)) return { pid: child.pid ?? 0, display };
    await sleep(100);
  }
  throw new Error('Xvfb did not create its socket in 10 s');
}

const READY = `!!(globalThis.app?.plugins?.plugins?.['true-outliner'] && app.workspace?.layoutReady)`;

/** The dev build. Its output goes to a file: with a pipe for stdout the same build takes about
 * 1.2 s instead of 0.25 s (docs/research/driving-a-running-obsidian, "The loop"). */
function runBuild(): { ok: boolean; output: string; ms: number } {
  const t = performance.now();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'build.log');
  const out = openSync(file, 'w');
  const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build.ts'), 'production', '--dev'], {
    cwd: root,
    stdio: ['ignore', out, out],
  });
  closeSync(out);
  // esbuild's own message comes first; what follows its `Error:` line is the tool's stack.
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  const stack = lines.findIndex((l) => l.startsWith('/'));
  return { ok: build.status === 0, output: (stack > 0 ? lines.slice(0, stack) : lines).join('\n').trim(), ms: performance.now() - t };
}

function tail(file: string, lines = 15): string {
  try {
    return readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}

/** Fills in the browser's process id and the launcher's profile directory, once the page answers. */
async function learnProcess(session: Session, page: Cdp): Promise<void> {
  const version = (await (await fetch(`http://127.0.0.1:${session.port}/json/version`)).json()) as {
    webSocketDebuggerUrl: string;
  };
  const browser = await Cdp.connect(version.webSocketDebuggerUrl);
  try {
    const processes = (await browser.send('SystemInfo.getProcessInfo')) as { processInfo: { type: string; id: number }[] };
    session.pid = processes.processInfo.find((p) => p.type === 'browser')?.id ?? 0;
  } finally {
    browser.close();
  }
  session.userDataDir =
    ((await page.evaluate(`process.argv.find((a) => a.startsWith('--user-data-dir='))?.slice(16) ?? null`)) as string | null) ??
    null;
}

/** Closes the app by the protocol, and kills its process group if it outlasts five seconds. */
async function closeApp(session: Session): Promise<string | undefined> {
  try {
    const version = (await (
      await fetch(`http://127.0.0.1:${session.port}/json/version`, { signal: AbortSignal.timeout(1500) })
    ).json()) as { webSocketDebuggerUrl: string };
    const browser = await Cdp.connect(version.webSocketDebuggerUrl);
    browser.send('Browser.close').catch(() => undefined); // the socket closes with the app
  } catch {
    /* already gone */
  }
  if (!session.pid) return undefined;
  for (let i = 0; i < 50 && pidAlive(session.pid); i++) await sleep(100);
  if (!pidAlive(session.pid)) return undefined;
  if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(session.pid), '/T', '/F']);
  else process.kill(-session.pid, 'SIGKILL');
  return `the app did not close in 5 s; killed process group ${session.pid}`;
}

/** What is removed when a session ends, or was left by one that died. */
async function cleanUp(session: Session | undefined, keepShots: boolean): Promise<string[]> {
  const removed: string[] = [];
  if (session?.userDataDir) {
    // Only what the launcher makes, and only where it makes it: a damaged session file cannot
    // point a delete elsewhere.
    if (isLauncherProfile(session.userDataDir)) {
      rmSync(session.userDataDir, { recursive: true, force: true });
      removed.push(session.userDataDir);
    } else if (existsSync(session.userDataDir)) {
      console.error(`left in place, not a launcher profile under ${os.tmpdir()}: ${session.userDataDir}`);
    }
  }
  if (session?.xvfb && pidAlive(session.xvfb.pid)) {
    process.kill(session.xvfb.pid);
    for (let i = 0; i < 20 && pidAlive(session.xvfb.pid); i++) await sleep(100);
    removed.push(`Xvfb ${session.xvfb.display}`);
  }
  for (const entry of existsSync(dir) ? readdirSync(dir) : []) {
    if (entry === 'shots' && keepShots) continue;
    rmSync(path.join(dir, entry), { recursive: true, force: true });
    removed.push(path.relative(root, path.join(dir, entry)));
  }
  return removed;
}

async function describeApp(cdp: Cdp): Promise<string[]> {
  const info = (await cdp.run(
    () => {
      let app_version: string | null = null;
      try {
        app_version = (window as any).require('electron').ipcRenderer.sendSync('version') as string;
      } catch {
        /* the version channel is Obsidian's own and may move */
      }
      const plugin = app.plugins.plugins['true-outliner'];
      return {
        app_version,
        ua: navigator.userAgent,
        plugin: plugin?.manifest?.version ?? null,
        stamp: plugin?.buildStamp ?? null,
        note: app.workspace.getActiveFile()?.path ?? null,
        outline: plugin?.activeTabOutlineMode?.() ?? null,
      };
    },
    null,
  )) as {
    app_version: string | null;
    ua: string;
    plugin: string | null;
    stamp: { dev: boolean; buildId?: string; clock?: string } | null;
    note: string | null;
    outline: boolean | null;
  };
  const installer = /obsidian\/([\d.]+)/.exec(info.ua)?.[1] ?? '?';
  const chrome = /Chrome\/([\d.]+)/.exec(info.ua)?.[1] ?? '?';
  const build = info.stamp?.dev ? `build ${info.stamp.buildId}, built ${info.stamp.clock}` : 'a release build';
  return [
    `Obsidian ${info.app_version ?? '(app version unread)'} on installer ${installer} (Chrome ${chrome})`,
    `plugin ${info.plugin}, ${build}`,
    `note: ${info.note ?? 'none open'}${info.outline === null ? '' : `, outline mode ${info.outline ? 'on' : 'off'}`}`,
  ];
}

async function start(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { 'no-build': { type: 'boolean' } } });
  const existing = readSession();
  if (existing && (await isUp(existing))) {
    log('already running:');
    await status();
    return;
  }
  if (existing) log(`clearing a stale session: ${(await cleanUp(existing, true)).join(', ') || 'nothing left'}`);

  const t0 = performance.now();
  if (!values['no-build']) {
    const build = runBuild();
    if (!build.ok) throw new Error(`the build failed:\n${build.output}`);
  } else if (!existsSync(path.join(root, 'main.js'))) {
    throw new Error('--no-build, and there is no main.js to install: build first');
  }
  // The dev build also installs into test-vault's plugin folder, which the copy below carries.
  mkdirSync(dir, { recursive: true });
  const copyStart = performance.now();
  cpSync(path.join(root, 'test-vault'), vaultDir, { recursive: true });
  log(`copied test-vault in ${Math.round(performance.now() - copyStart)} ms`);

  let xvfb: Session['xvfb'] = null;
  let display = process.env.DISPLAY;
  if (process.platform === 'linux' && !display) {
    xvfb = await startXvfb();
    display = xvfb.display;
  }

  const cache = process.env.OBSIDIAN_CACHE
    ? path.resolve(process.env.OBSIDIAN_CACHE)
    : path.join(root, '.obsidian-cache');
  const port = await freePort();
  const version = process.env.OBSIDIAN_VERSION?.trim();
  const launchArgs = [
    'launch',
    '-c',
    cache,
    ...(version ? ['-v', version] : []),
    vaultDir,
    '--',
    `--remote-debugging-port=${port}`,
    '--no-sandbox',
    // The flags wdio.conf.mts gives its windows, so an occluded window keeps painting.
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
  ];
  const out = openSync(logFile, 'w');
  const launcher = spawn(binPath('obsidian-launcher'), launchArgs, {
    cwd: root,
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, ...(display ? { DISPLAY: display } : {}) },
  });
  closeSync(out);
  let launcherFailed: string | undefined;
  launcher.once('error', (e) => (launcherFailed = e.message));
  launcher.once('exit', (code) => {
    if (code) launcherFailed = `the launcher exited with ${code}`;
  });
  launcher.unref();

  const session: Session = { port, pid: 0, userDataDir: null, xvfb };
  let cdp: Cdp | undefined;
  const fail = async (message: string): Promise<never> => {
    // Whatever was launched is closed, so a failed start leaves nothing running.
    try {
      if (cdp) await learnProcess(session, cdp);
    } catch {
      /* the page never answered */
    }
    await closeApp(session);
    await cleanUp(session, true);
    throw new Error(message);
  };
  const deadline = performance.now() + 90_000;
  for (;;) {
    if (launcherFailed) await fail(`${launcherFailed}:\n${tail(logFile)}`);
    if (performance.now() > deadline) await fail(`Obsidian was not ready in 90 s:\n${tail(logFile)}`);
    try {
      cdp ??= await attach(session);
      if (await cdp.evaluate(READY)) break;
    } catch {
      cdp = undefined;
    }
    await sleep(100);
  }
  if (!cdp) throw new Error('unreachable: the readiness loop ends with a page');
  await learnProcess(session, cdp);
  writeFileSync(sessionFile, JSON.stringify(session, null, 2) + '\n');

  log(`ready in ${((performance.now() - t0) / 1000).toFixed(1)} s, port ${port}${display ? `, display ${display}` : ''}`);
  for (const line of await describeApp(cdp)) log(line);
  cdp.close();
}

async function status(): Promise<void> {
  const session = readSession();
  if (!session || !(await isUp(session))) {
    log(session ? 'a session exists but the app is not answering: run `stop`, then `start`' : 'not running');
    process.exitCode = 1;
    return;
  }
  const cdp = await attach(session);
  log(`running, port ${session.port}, pid ${session.pid}`);
  for (const line of await describeApp(cdp)) log(line);
  cdp.close();
}

async function stop(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { shots: { type: 'boolean' } } });
  const session = readSession();
  if (session) {
    const killed = await closeApp(session);
    if (killed) log(killed);
  }
  const removed = await cleanUp(session, !values.shots);
  log(removed.length ? `stopped; removed ${removed.join(', ')}` : 'nothing to stop');
}

// ---- open, key, type, eval -------------------------------------------------

async function open(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { stdin: { type: 'boolean' }, outline: { type: 'string' }, at: { type: 'string' } },
  });
  const [notePath] = positionals;
  if (!notePath) throw new Error('usage: open <note path> [--stdin] [--outline on|off] [--at line:ch]');
  if (values.outline && values.outline !== 'on' && values.outline !== 'off') throw new Error('--outline takes on or off');
  const at = values.at ? /^(\d+):(\d+)$/.exec(values.at) : null;
  if (values.at && !at) throw new Error('--at takes line:ch, both counted from 0');
  const content = values.stdin ? readFileSync(0, 'utf8') : null;

  const cdp = await attach();
  const result = await cdp.run(
    async (a: { path: string; content: string | null; outline: boolean | null; at: [number, number] | null }) => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const plugin = app.plugins.plugins['true-outliner'];
      if (a.content !== null) {
        const existing = app.vault.getAbstractFileByPath(a.path);
        if (existing) await app.vault.delete(existing);
        const folder = a.path.split('/').slice(0, -1).join('/');
        if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
        await app.vault.create(a.path, a.content);
      } else if (!app.vault.getAbstractFileByPath(a.path)) {
        throw new Error(`no note ${a.path} in the vault`);
      }
      await app.workspace.openLinkText(a.path, '', false);
      for (let i = 0; i < 60 && app.workspace.activeEditor?.file?.path !== a.path; i++) await wait(50);
      if (app.workspace.activeEditor?.file?.path !== a.path) throw new Error(`${a.path} did not become the active note`);
      if (a.outline !== null && plugin.activeTabOutlineMode() !== a.outline) {
        app.commands.executeCommandById('true-outliner:toggle-outline-mode');
        for (let i = 0; i < 60 && plugin.activeTabOutlineMode() !== a.outline; i++) await wait(50);
        if (plugin.activeTabOutlineMode() !== a.outline) throw new Error('outline mode did not reach the requested state');
      }
      const editor = app.workspace.activeEditor.editor;
      editor.focus();
      if (a.at) {
        // A widget's mount can move the caret after it is set (docs/research/open-questions Q25), so
        // the position is set again until it holds.
        editor.setCursor({ line: a.at[0], ch: a.at[1] });
        const target = editor.getCursor();
        for (let i = 0; i < 6; i++) {
          await wait(60);
          const c = editor.getCursor();
          if (c.line === target.line && c.ch === target.ch) break;
          editor.setCursor(target);
        }
      }
      const c = editor.getCursor();
      return { outline: plugin.activeTabOutlineMode() as boolean | undefined, line: c.line as number, ch: c.ch as number };
    },
    {
      path: notePath,
      content,
      outline: values.outline ? values.outline === 'on' : null,
      at: at ? [Number(at[1]), Number(at[2])] : null,
    },
  );
  cdp.close();
  log(`${notePath}: outline mode ${result.outline ? 'on' : 'off'}, caret ${result.line}:${result.ch}`);
}

async function key(args: string[]): Promise<void> {
  if (args.length === 0) throw new Error('usage: key <chord>... (shift+Tab, mod+a, ArrowDown*3)');
  const chords = expandKeys(args);
  // Parsed before any is sent, so a typo in the last chord does not leave the first half applied.
  const events = chords.map((c) => keyEvents(parseChord(c)));
  const cdp = await attach();
  for (const [press, release] of events) {
    await cdp.send('Input.dispatchKeyEvent', press);
    await cdp.send('Input.dispatchKeyEvent', release);
  }
  cdp.close();
  log(`sent ${args.join(" ")}`);
}

async function type(args: string[]): Promise<void> {
  const text = args.length === 1 && args[0] === '-' ? readFileSync(0, 'utf8') : args.join(' ');
  if (!text) throw new Error('usage: type <text> (or - for stdin)');
  const cdp = await attach();
  await cdp.send('Input.insertText', { text });
  cdp.close();
  log(`inserted ${[...text].length} characters`);
}

async function evalCommand(args: string[]): Promise<void> {
  const expression = args.length === 1 && args[0] === '-' ? readFileSync(0, 'utf8') : args.join(' ');
  if (!expression.trim()) throw new Error('usage: eval <expression> (or - for stdin)');
  const cdp = await attach();
  try {
    const value = await cdp.evaluate(expression, true);
    if (typeof value === 'string') log(value);
    else if (value !== undefined) log(JSON.stringify(value, null, 2));
  } finally {
    cdp.close();
  }
}

// ---- state and shot --------------------------------------------------------

async function state(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { raw: { type: 'boolean' }, header: { type: 'string' } } });
  const cdp = await attach();
  await cdp.evaluate(SETTLE);
  const s = await cdp.run(
    () => {
      const active = app.workspace.activeEditor;
      if (!active?.editor?.cm) throw new Error('no active editor');
      const cm = active.editor.cm;
      const plugin = app.plugins.plugins['true-outliner'];
      return {
        path: (active.file?.path ?? null) as string | null,
        doc: cm.state.doc.toString() as string,
        ranges: cm.state.selection.ranges.map((r: { anchor: number; head: number }) => ({ anchor: r.anchor, head: r.head })) as {
          anchor: number;
          head: number;
        }[],
        blockLines: [...cm.contentDOM.querySelectorAll('.to-decor-node-selected')].map(
          (el) => cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1,
        ) as number[],
        focused: cm.hasFocus as boolean,
        outline: (plugin?.activeTabOutlineMode?.() ?? null) as boolean | null,
      };
    },
    null,
  );
  cdp.close();
  const markup = stateMarkup(s.doc, s.ranges, new Set(s.blockLines));
  if (values.raw) {
    log(markup);
    return;
  }
  log(drawColumns([{ header: values.header ?? s.path ?? 'state', text: markup }]));
  const mode = s.outline === null ? '' : `outline mode ${s.outline ? 'on' : 'off'}, `;
  const selection = s.blockLines.length ? 'block selection' : s.focused ? 'editor focused' : 'editor not focused';
  log(`(${mode}${selection}, ${s.ranges.length} range${s.ranges.length === 1 ? '' : 's'})`);
}

interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

async function shot(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      out: { type: 'string' },
      clip: { type: 'string' },
      selector: { type: 'string' },
      caret: { type: 'boolean' },
      pad: { type: 'string' },
      scale: { type: 'string' },
    },
  });
  const scale = values.scale ? Number(values.scale) : values.caret ? 3 : 1;
  if (!(scale > 0)) throw new Error('--scale takes a positive number');
  const cdp = await attach();
  try {
    await cdp.evaluate(SETTLE);
    const view = (await cdp.evaluate(`({ w: innerWidth, h: innerHeight })`)) as { w: number; h: number };
    const box = { x: 0, y: 0, width: view.w, height: view.h };
    let region = box;
    if (values.clip) {
      const [x, y, width, height] = values.clip.split(',').map(Number);
      if ([x, y, width, height].some((n) => n === undefined || !Number.isFinite(n))) throw new Error('--clip takes x,y,w,h');
      region = { x: x!, y: y!, width: width!, height: height! };
    } else if (values.selector) {
      const rect = await cdp.run((sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, values.selector);
      if (!rect) throw new Error(`no element matches ${values.selector}`);
      region = rect;
    } else if (values.caret) {
      const rect = await cdp.run(() => {
        const cm = app.workspace.activeEditor?.editor?.cm;
        if (!cm) return null;
        const range = getSelection()?.rangeCount ? getSelection()!.getRangeAt(0) : null;
        const r = range?.getClientRects()[0] ?? null;
        if (r && (r.width > 0 || r.height > 0)) return { x: r.x, y: r.y, width: r.width, height: r.height };
        const c = cm.coordsAtPos(cm.state.selection.main.head);
        return c ? { x: c.left, y: c.top, width: 0, height: c.bottom - c.top } : null;
      }, null);
      if (!rect) throw new Error('no editor with a caret to find');
      const pad = values.pad ? Number(values.pad) : 60;
      const width = pad * 2;
      const height = rect.height + pad / 2;
      region = { x: rect.x - pad, y: rect.y + rect.height / 2 - height / 2, width, height };
    }
    // The screenshot's clip must lie inside the page.
    const x = Math.max(0, region.x);
    const y = Math.max(0, region.y);
    const clip: Clip = {
      x,
      y,
      width: Math.min(region.width - (x - region.x), box.width - x),
      height: Math.min(region.height - (y - region.y), box.height - y),
      scale,
    };
    const capture = async (): Promise<string> =>
      ((await cdp.send('Page.captureScreenshot', { format: 'png', clip })) as { data: string }).data;

    let data: string;
    let caretNote = '';
    if (values.caret) {
      // The native caret blinks, so a clip is retaken until it differs from one taken with the
      // caret hidden (docs/research/driving-a-running-obsidian, "The caret's blink").
      let reference: string;
      await cdp.evaluate(
        `(() => { const s = document.createElement('style'); s.id = 'drive-no-caret'; s.textContent = '.cm-content { caret-color: transparent !important }'; document.head.append(s); })()`,
      );
      try {
        await cdp.evaluate(SETTLE);
        reference = await capture();
      } finally {
        await cdp.evaluate(`document.getElementById('drive-no-caret')?.remove()`);
      }
      await cdp.evaluate(SETTLE);
      let seen = false;
      data = reference;
      for (let attempt = 0; attempt < 8 && !seen; attempt++) {
        if (attempt) await sleep(80);
        data = await capture();
        seen = data !== reference;
      }
      caretNote = seen ? '' : 'no caret showed in 8 tries: the editor may be unfocused, or holding a block selection';
    } else {
      data = await capture();
    }

    const png = Buffer.from(data, 'base64');
    mkdirSync(shotsDir, { recursive: true });
    const file =
      values.out ??
      path.join(shotsDir, `${String(readdirSync(shotsDir).length + 1).padStart(3, '0')}-${new Date().toTimeString().slice(0, 8).replaceAll(':', '')}.png`);
    mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    writeFileSync(file, png);
    log(`${path.resolve(file)} ${png.readUInt32BE(16)}×${png.readUInt32BE(20)} px`);
    if (caretNote) console.error(caretNote);
  } finally {
    cdp.close();
  }
}

// ---- rebuild ---------------------------------------------------------------

async function rebuild(): Promise<void> {
  const session = requireSession();
  const build = runBuild();
  if (!build.ok) {
    console.error(build.output);
    throw new Error('the build failed; the running app is unchanged');
  }
  const stamp = stampFromBundle();
  if (!stamp?.dev) throw new Error('the bundle carries no dev build stamp to wait for');
  const t = performance.now();
  // main.js last: hot-reload acts 300 ms after the last write it saw, and should find a set that
  // belongs together.
  for (const name of ['styles.css', 'manifest.json', 'main.js']) copyFileSync(path.join(root, name), path.join(pluginDir, name));
  const cdp = await attach(session);
  try {
    let seen: unknown;
    while (performance.now() - t < 15_000) {
      seen = await cdp.evaluate(`app.plugins.plugins['true-outliner']?.buildStamp?.clock ?? null`);
      if (seen === stamp.clock) {
        log(`reloaded ${stamp.buildId}, built ${stamp.clock}: build ${Math.round(build.ms)} ms, reload ${Math.round(performance.now() - t)} ms`);
        return;
      }
      await sleep(25);
    }
    throw new Error(
      `the app still runs build ${String(seen)} after 15 s, not ${stamp.clock}: is the hot-reload plugin enabled and \`.hotreload\` present in ${path.relative(root, vaultDir)}?`,
    );
  } finally {
    cdp.close();
  }
}

// ---- entry -----------------------------------------------------------------

const USAGE = `Usage: npm run drive -- <command>

  start [--no-build]       build, copy test-vault, launch Obsidian, wait until the plugin is loaded
  status                   is it running, which versions, which note
  stop [--shots]           close the app; remove the vault copy, its profile and any Xvfb we started
                           (--shots also removes saved screenshots)
  open <note> [--stdin] [--outline on|off] [--at line:ch]
                           open a note; with --stdin create or overwrite it from stdin first
  key <chord>...           shift+Tab  mod+a  ArrowDown*3  Enter  (mod is ⌘ on macOS)
  type <text|->            insert text, as a paste would
  eval <js|->              evaluate in the page (\`app\` is Obsidian's); prints the value
  state [--raw] [--header h]
                           the document as a drawn column; --raw prints layout.ts input
  shot [--out f] [--clip x,y,w,h | --selector css | --caret [--pad px]] [--scale n]
                           a PNG of the window, a clip, an element, or around the caret
                           (--caret retakes the shot until the blinking caret shows; 3x by default)
  rebuild                  build, copy into the vault copy, wait for the running app to reload

Files live under .obsidian-cache/drive/.`;

const commands: Record<string, (args: string[]) => Promise<void>> = {
  start,
  status: () => status(),
  stop,
  open,
  key,
  type,
  eval: evalCommand,
  state,
  shot,
  rebuild: () => rebuild(),
};

const [command, ...rest] = process.argv.slice(2);
const handler = command ? commands[command] : undefined;
if (!handler) {
  console.error(USAGE);
  process.exit(command && command !== '--help' && command !== '-h' ? 1 : 0);
}
try {
  await handler(rest);
} catch (error) {
  console.error(`drive: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
