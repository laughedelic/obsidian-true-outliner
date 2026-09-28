## Context

See proposal.md, "Why". The readings this design rests on are in
[`docs/research/rendered-ui-observability.md`](../../../docs/research/rendered-ui-observability.md),
"From inside a spec": the window handle equals the page target's id, mobile emulation reaches a
second client, and a reload changes both the address and the handle. The probes are in
`docs/research/prototypes/cdp-in-a-spec/`.

Specs run in a wdio worker under Node 22 or later, where `WebSocket` is global. Each worker has
its own Obsidian, and so its own debugger address, read from the session's capabilities.

## Goals / Non-Goals

**Goals:**

- A spec reaches the protocol in three lines, and a failed case cannot leave a connection open.
- A wrong target or a stale address fails loudly rather than driving another page.
- The module is separable: a later change adds command wrappers to it, or beside it, and no
  wdio hook has to change.

**Non-Goals:**

- Multiplexing several targets or popout windows. The module attaches to one page target; a
  spec that needs a second one asks for a change here.
- Keeping a connection across cases. A connection costs a few milliseconds to open (note), so
  each case that wants one opens its own.

## Decisions

**A raw WebSocket, not `puppeteer-core`.** Node's global `WebSocket` and the protocol's JSON
framing are about eighty lines. `browser.getPuppeteer()` needs `puppeteer-core` installed, which
adds a package with seven dependencies of its own, changed eleven packages already installed in
the measurement, and opened its connection roughly twenty times slower (note). It buys typed
domains and page helpers, which the modules built on this one do not need: each sends a handful of
commands with known payloads. If a later change wants puppeteer's page model, the dependency can
come with that change.

**The target is the one WebDriver's window handle names.** The handle equals the page target's
`id` in the measurement, on both runs, so the module lists `/json` and takes that target. The
module accepts a `CDwindow-` prefix on the handle, since chromedriver has used one, and throws if
no target matches, naming the handle and the ids it found. The alternative, the first page target,
is right today because the session has one window and wrong silently the day it has two.

**The address and the handle are read at every connection.** A reload changes both (note), so
neither is kept in a module variable. This is why the module holds no state between connections.

**One connection to the page target, not a browser-level connection with attached sessions.** The
page's own endpoint carries every domain the follow-ups name (`Input`, `Page`, `Runtime`,
`Profiler`), and its events arrive without a session id, so `on` needs no routing. A
browser-level connection would be the route to several targets, which is a non-goal.

**Two forms over one implementation.** `connectCdp()` returns `{ send, on, close }`;
`withCdp(fn)` calls it, runs `fn`, and closes in `finally`. Both take an optional `handle` that
replaces the one read from WebDriver, so a case can check the lookup's failure by asking for a
target that does not exist. The scoped form is what a case uses.
The two-call form exists for a monitor that opens in `beforeEach` and closes in `afterEach`, which
the flicker work will do, and it leaves closing to the caller. The smoke case uses both.

**`send` rejects instead of hanging.** Every command carries a limit, `waitBudget(10_000)` unless
the call gives its own, and rejects with an error naming the method when it passes. A protocol
error reply rejects with the method and the protocol's message. A socket that closes with commands
in flight rejects each of them. The wdio wrapper gives a case 60 s (`docs/research/e2e-ci-budgets.md`),
and a hung screenshot would otherwise show as a bare `Timeout` with no method named. A late
reply for a command already rejected is dropped.

**`on(event, handler)` returns its own remover.** Events are not enabled by the module; the
caller sends `Runtime.enable` or `Page.startScreencast` itself, since enabling has costs the
module cannot judge.

**The smoke spec is its own file, `01-devtools-protocol.e2e.ts`.** Prefix `0` maps to the `smoke`
group in `scripts/spec-groups.ts`, so CI runs it on both platforms with no workflow edit. It does
not join `00-smoke`, which #288 and later changes may touch, and one file keeps a narrow run of
it to a single Obsidian launch.

**One case per run, as #287 asks, with the failure modes inside it.** The case walks the
requirement's scenarios in order. It is one case because each step needs the state the one before
left, and because the reload step is the slow one and should run once.

## Risks / Trade-offs

- [Chrome 150, the newest installer's, may differ from 120's `/json` or handle format] → The
  helper's lookup fails by name if the handle finds no target; #291's newest-installer run is
  where it would show. The measurement here is of the installer the harness pins.
- [Two clients on one page: chromedriver's and ours] → Measured to coexist in both runs (note).
  A command that mutates state chromedriver also tracks, such as the emulation override, is the
  case to be careful with; the follow-ups that send `Emulation.*` should say so in their own
  design.
- [`Input.dispatchKeyEvent` needs the window to have focus] → `document.hasFocus()` was true in
  the measurement under Xvfb with no window manager. The smoke case reads the key's effect back,
  so a run where focus is lost fails there, naming the key.
- [A connection left open by a case that throws] → The scoped form closes in `finally`. The
  two-call form leaves that to its caller, which is the reason the smoke case's use of it closes
  in `finally` as well.
- [The 10 s limit is wrong for a slow command such as a CPU profile's stop] → A call passes its
  own limit. No command in this change needs one.
