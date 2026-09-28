# Driving a running Obsidian

What one long-lived Obsidian, driven over the DevTools protocol, costs and where it misleads. It
extends `docs/research/rendered-ui-observability`, whose figures for a key, a screenshot and a
hot reload it repeats on a fresh build, and adds what a driver skill (#290) has to handle: how
the app starts and stops, which keys reach the plugin, and the caret's blink. Measured on
2026-09-28 in a Claude cloud session on `main` at `2c9dba2`: Obsidian 1.13.7 on installer 1.5.8
(Chrome 120), under Xvfb `1280x900x24`, 4 vCPUs. The probes are in
`docs/research/prototypes/driving-a-running-obsidian/`.

## Starting

`obsidian-launcher launch -c /opt/obsidian-cache <vault copy> -- --remote-debugging-port=<port>
--no-sandbox`, with `DISPLAY` set, returns at once and leaves Obsidian running detached, in its own
process group, with `--user-data-dir=/tmp/obsidian-launcher-config-<random>`.

| Step | Time |
| --- | --- |
| first launch of the session, through `npx obsidian-launcher` | 20.0 s until the debugging port answered |
| the binary directly (`node_modules/obsidian-launcher/dist/cli.js`), twice | 0.82 s and 0.72 s to the port, 1.70 s and 1.58 s until the plugin was loaded and the layout ready |
| `npx obsidian-launcher`, after those | 1.07 s to the port, 2.03 s until the plugin was loaded |

The 20 s was paid once and not repeated on the next three launches; we did not find what it was.
The window opens at 1024×800, device pixel ratio 1, whatever the Xvfb screen's size. The vault copy
carries `.hotreload` (the vendored `hot-reload` plugin acts only in a vault holding that marker),
and `cp -r test-vault` keeps it.

## Stopping

`Browser.close` on the browser-level endpoint (`/json/version`, `webSocketDebuggerUrl`) ended the
app: no `obsidian` process remained after about 3 s. It does not remove the user-data directory, which
is why `/tmp/obsidian-launcher-config-*` accumulates. `SystemInfo.getProcessInfo` names the browser
process, and the renderer's own `process.argv` carries `--user-data-dir=`, so a session can record
both when it starts. Xvfb, when we start it, is ours to stop.

## Keys

`Input.dispatchKeyEvent` on a note in outline mode, from `- alpha`, `  - beta`, `- gamma` with the
caret in `beta`:

| Sent | Result |
| --- | --- |
| ArrowDown, ArrowUp | caret to (2, 7), then back to (1, 8) |
| Tab | unchanged: `beta` is already `alpha`'s child |
| Shift+Tab | `beta` outdented, caret (1, 6) |
| Enter (`text: "\r"`) | a new item below, caret (2, 2) |
| `x` (`text: "x"`) | `x` inserted |
| Backspace | `x` removed |
| Shift+ArrowLeft | caret (2, 1), no selection text: the plugin's caret policy moved it |
| Ctrl+A | selection `- ` |
| `Input.insertText` `zz` | `zz` inserted, no `keydown` |

A key with text goes in as `keyDown` carrying `text`, a key without as `rawKeyDown`, and both are
followed by `keyUp`. `require('obsidian')` does not resolve in the page; the editor is
`app.workspace.activeEditor.editor`. Not measured: macOS, where Chromium routes some editing
shortcuts (⌘←, ⌥←) through the application menu and a dispatched key may not reach them.

## The caret's blink

The native caret is drawn on a blink. Twelve screenshots of a 120×30 clip around the caret, each
compared with a clip taken with `caret-color: transparent`; `C` shows the caret:

| Before each shot | Caret shown |
| --- | --- |
| nothing, 150 ms apart | `..CCCC...CCC`, 7 of 12 |
| `setBaseAndExtent` with the same range | `..CC.C..C.CC`, 6 of 12 |
| `cm.dispatch({ selection })` with the same selection | `C..CC.C.C.C.`, 6 of 12 |
| `editor.setCursor` at the current position | `CC..C.C..CC.`, 6 of 12 |

Resetting the selection does not restart the blink phase in a way a screenshot sees. What works
is to read the result: a clip with the caret differs from one without it, so a screenshot is
taken again until it does.

## The loop

`node scripts/build.ts production --dev`, then `main.js` and `styles.css` copied into the vault
copy's plugin folder, then a poll of `app.plugins.plugins['true-outliner'].buildStamp.clock` until
it equals the clock baked into the new `main.js`. Three runs: 249, 244 and 235 ms to build, and
554, 504 and 913 ms from the copy until the running app reported the new stamp. The open note
stayed open through the reload.

## What this settles for the skill

- Start the binary directly rather than through `npx`, record the browser pid and user-data
  directory, and close with `Browser.close`.
- A screenshot that must show the caret is retaken until it differs from a caret-free clip.
- A build is confirmed by its stamp, not by elapsed time.
