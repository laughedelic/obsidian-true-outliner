#!/bin/sh
# Starts a virtual X server, exports DISPLAY, and runs the given command
# against it — e.g. `node scripts/run-e2e.ts desktop` or
# `node scripts/e2e-narrow.ts <spec>` — then stops the server and exits with
# the command's status.
#
# Not `xvfb-run`: its readiness handshake (wait for a SIGUSR1 from Xvfb) can
# hang indefinitely in a container, with Xvfb up but the wrapped command
# never launched. Polling for the X server's own socket file is a more
# reliable readiness check here. Exporting DISPLAY before the command also
# makes @wdio/xvfb's own auto-management (used by @wdio/local-runner) a
# no-op — it only acts when DISPLAY is unset.
#
# The command is not `exec`ed: the EXIT trap has to run to stop Xvfb, which
# otherwise outlives the command holding the wrapper's stdout, and a run piped
# into `tail` or `head` never sees end of input.
set -e

# Xvfb's output goes to a file rather than the wrapper's stdout, which is what
# keeps a pipe from outliving the command. The file is printed only when the
# server does not come up.
XVFB_LOG=$(mktemp)

# Running as non-root (see scripts/e2e-docker.ts's userArgs), Xvfb prints
# "_XSERVTransmkdir: ERROR: euid != 0, directory /tmp/.X11-unix will not be
# created" but still creates it and the socket below via a fallback path —
# harmless, not a real failure; the readiness poll below is what actually
# matters.
Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp >"$XVFB_LOG" 2>&1 &
XVFB_PID=$!
trap 'kill $XVFB_PID 2>/dev/null || true; rm -f "$XVFB_LOG"' EXIT

tries=50
while [ ! -e /tmp/.X11-unix/X99 ]; do
  tries=$((tries - 1))
  if [ $tries -le 0 ]; then
    echo "[start-xvfb-and-run] Xvfb did not come up in time; its output:" >&2
    cat "$XVFB_LOG" >&2
    exit 1
  fi
  sleep 0.2
done

export DISPLAY=:99
"$@"
