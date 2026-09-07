#!/bin/sh
# Starts a virtual X server, exports DISPLAY, and execs the given command
# against it — e.g. `node scripts/run-e2e.mjs desktop` or
# `node scripts/e2e-narrow.mjs <spec>`.
#
# Not `xvfb-run`: its readiness handshake (wait for a SIGUSR1 from Xvfb) can
# hang indefinitely in a container, with Xvfb up but the wrapped command
# never launched. Polling for the X server's own socket file is a more
# reliable readiness check here. Exporting DISPLAY before the command also
# makes @wdio/xvfb's own auto-management (used by @wdio/local-runner) a
# no-op — it only acts when DISPLAY is unset.
set -e

# Running as non-root (see scripts/e2e-docker.mjs's userArgs), Xvfb prints
# "_XSERVTransmkdir: ERROR: euid != 0, directory /tmp/.X11-unix will not be
# created" but still creates it and the socket below via a fallback path —
# harmless, not a real failure; the readiness poll below is what actually
# matters.
Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp &
XVFB_PID=$!
trap 'kill $XVFB_PID 2>/dev/null' EXIT

tries=50
while [ ! -e /tmp/.X11-unix/X99 ]; do
  tries=$((tries - 1))
  if [ $tries -le 0 ]; then
    echo "[start-xvfb-and-run] Xvfb did not come up in time" >&2
    exit 1
  fi
  sleep 0.2
done

export DISPLAY=:99
exec "$@"
