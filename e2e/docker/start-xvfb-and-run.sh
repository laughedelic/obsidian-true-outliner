#!/bin/sh
# Starts a virtual X server and runs the e2e suite against it.
#
# Not `xvfb-run`: its SIGUSR1-based readiness wait hung indefinitely in this
# container — Xvfb came up (confirmed via `ps`/`docker exec`), but the
# wrapped command never launched, because the `wait` in xvfb-run's own
# script never returned. Polling for the X server's own socket file is a
# more reliable readiness check in a container than that signal handshake —
# verified by running the suite end to end with this script.
#
# `@wdio/local-runner` (used by wdio-obsidian-service) would otherwise try
# to manage its own Xvfb per worker via `@wdio/xvfb`, which shells out to
# `xvfb-run` under the hood — the same mechanism that hung. Exporting
# DISPLAY here makes it skip that entirely: `XvfbManager.shouldRun()` treats
# an already-set DISPLAY as "not a headless environment" and does nothing.
set -e

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
exec node scripts/run-e2e.mjs "$@"
