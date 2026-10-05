#!/usr/bin/env bash
# Run a command in a network namespace that has only loopback (#640).
#
# Chromium aborts its in-flight requests with net::ERR_NETWORK_CHANGED whenever
# the host reports a network-interface change, and Docker starting or stopping
# a container causes one every time. A test run on a busy machine failed that
# way: a page's HTML rendered but its scripts never ran. Inside a namespace of
# its own the browser and the dev server see loopback and nothing else, so
# there is nothing to change. Looking at the page a few hundred times while
# Docker networks came and went, 116 of 120 loads failed on the host and none
# did in here. It also gives each run its own port 4321, so two checkouts
# running the suite no longer share a server.
#
# Runs the command as it is, on the host network, when there is nothing to fix
# or no way to do it: in CI (a runner has no Docker churn, and Ubuntu 24.04
# restricts unprivileged namespaces anyway), with E2E_HOST_NETWORK=1 (needed to
# reach an X server for a headed run, whose socket lives in the host
# namespace), and wherever `unshare -Urn` or `ip` isn't available.
#
# usage: in-private-network.sh <command> [args...]
set -euo pipefail

if [ -n "${CI:-}" ] || [ -n "${E2E_HOST_NETWORK:-}" ]; then
  exec "$@"
fi

if ! command -v ip >/dev/null 2>&1 || ! unshare -Urn true 2>/dev/null; then
  echo "in-private-network: no user namespaces here, running on the host network" >&2
  exec "$@"
fi

exec unshare -Urn -- bash -c 'ip link set lo up && exec "$@"' bash "$@"
