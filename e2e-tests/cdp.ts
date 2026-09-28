/**
 * The DevTools protocol from a spec: what WebDriver cannot reach (input through Chromium's own
 * path, painted frames, profiles, clipped screenshots) is one command away on the page it is
 * already driving.
 *
 * Its own module rather than a part of `helpers.ts`, imported by name like `folding.ts`: the
 * specs that need it are the follow-ups of #287, and nothing else reaches for it.
 *
 * What it connects to. The session's `goog:chromeOptions.debuggerAddress` lists the page targets
 * at `/json`; the one whose `id` is WebDriver's current window handle is the page under test. A
 * handle that names no target throws, naming the handle and the ids found, instead of taking the
 * first page: the session has one window today, and a second would otherwise be driven silently.
 *
 * Nothing is kept between connections. `browser.reloadObsidian()` changes both the address and
 * the handle, so each `connectCdp` reads them again, and a connection opened before a reload
 * ends with it. Measurements: `docs/research/rendered-ui-observability.md`, "From inside a spec".
 *
 * No dependency: Node's global `WebSocket` and the protocol's JSON framing. The connection is to
 * the page target itself, so events arrive without a session id.
 *
 * What `send` rejects on, always with the method's name: no reply within the command's limit
 * (`waitBudget(10_000)` unless the call gives its own; a late reply is dropped), a protocol
 * error reply, a socket that closes with the command in flight, and a send on a closed
 * connection. Without these a hung command would surface as the case's bare `Timeout`.
 *
 * Enabling an event's domain is the caller's, since enabling has costs this module cannot
 * judge: send `Runtime.enable` or `Page.startScreencast` before `on`.
 */

import { browser } from '@wdio/globals';
import { waitBudget } from './helpers.js';

export interface Cdp {
  /** Sends one command and resolves with its `result`. */
  send<T = unknown>(method: string, params?: object, opts?: { timeoutMs?: number }): Promise<T>;
  /** Calls `handler` with the `params` of every `event` from now on; returns its remover. */
  on<T = unknown>(event: string, handler: (params: T) => void): () => void;
  /** Ends the connection. Commands still in flight reject. */
  close(): Promise<void>;
}

export interface CdpOptions {
  /** Replaces the window handle read from WebDriver. For checking the lookup itself. */
  handle?: string;
}

interface Target {
  id: string;
  type: string;
  webSocketDebuggerUrl: string;
}

interface Pending {
  method: string;
  resolve: (result: never) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Chromedriver has prefixed its window handles with this; the target id is what follows. */
const HANDLE_PREFIX = 'CDwindow-';

/** The page target WebDriver is driving, from the session's own capabilities. */
async function findPageTarget(handleOverride: string | undefined): Promise<Target> {
  const options = browser.capabilities['goog:chromeOptions'] as { debuggerAddress?: string } | undefined;
  const address = options?.debuggerAddress;
  if (!address) throw new Error('CDP: the session\'s capabilities carry no goog:chromeOptions.debuggerAddress');

  const handle = (handleOverride ?? (await browser.getWindowHandle())).replace(HANDLE_PREFIX, '');
  const targets = (await (await fetch(`http://${address}/json`)).json()) as Target[];
  const page = targets.find((t) => t.type === 'page' && t.id === handle);
  if (!page) {
    const found = targets.map((t) => `${t.type} ${t.id}`).join(', ') || 'none';
    throw new Error(`CDP: no page target has the window handle ${handle} at ${address}; found ${found}`);
  }
  return page;
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error(`CDP: could not open ${url}`));
  });
}

/** Connects to the page WebDriver is driving. The caller closes it. */
export async function connectCdp(opts: CdpOptions = {}): Promise<Cdp> {
  const target = await findPageTarget(opts.handle);
  const ws = await openSocket(target.webSocketDebuggerUrl);

  let nextId = 0;
  let closed = false;
  const pending = new Map<number, Pending>();
  const listeners = new Map<string, Set<(params: never) => void>>();

  const closedEvent = new Promise<void>((resolve) => {
    ws.onclose = () => {
      closed = true;
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        pending.delete(id);
        p.reject(new Error(`CDP: the connection closed while ${p.method} was in flight`));
      }
      resolve();
    };
  });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data)) as {
      id?: number;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: { code: number; message: string };
    };
    if (msg.id !== undefined) {
      // A reply whose command already timed out is not in the map, and is dropped.
      const p = pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`CDP: ${p.method} failed: ${msg.error.message} (${msg.error.code})`));
      else p.resolve(msg.result as never);
    } else if (msg.method) {
      for (const handler of listeners.get(msg.method) ?? []) handler(msg.params as never);
    }
  };

  return {
    send<T>(method: string, params: object = {}, sendOpts: { timeoutMs?: number } = {}): Promise<T> {
      if (closed) return Promise.reject(new Error(`CDP: ${method} was sent on a closed connection`));
      const limit = sendOpts.timeoutMs ?? waitBudget(10_000);
      return new Promise<T>((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP: ${method} timed out after ${limit} ms`));
        }, limit);
        pending.set(id, { method, resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },

    on<T>(event: string, handler: (params: T) => void): () => void {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      set.add(handler as (params: never) => void);
      return () => void set.delete(handler as (params: never) => void);
    },

    async close(): Promise<void> {
      if (!closed) ws.close();
      await closedEvent;
    },
  };
}

/** Runs `fn` on a connection and closes it however `fn` ends. */
export async function withCdp<T>(fn: (cdp: Cdp) => Promise<T>, opts: CdpOptions = {}): Promise<T> {
  const cdp = await connectCdp(opts);
  try {
    return await fn(cdp);
  } finally {
    await cdp.close();
  }
}
