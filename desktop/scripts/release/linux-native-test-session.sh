#!/usr/bin/env bash
set -euo pipefail

# CI-only, disposable secret storage; never use the runner's existing keyring.
: "${DBUS_SESSION_BUS_ADDRESS:?Run inside dbus-run-session}"
: "${DISPLAY:?Run inside xvfb-run}"
session_root=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/zyra-native-session.XXXXXX")
export XDG_RUNTIME_DIR="$session_root/runtime"
export XDG_DATA_HOME="$session_root/data"
export XDG_CONFIG_HOME="$session_root/config"
export XDG_CURRENT_DESKTOP=GNOME
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME"
chmod 700 "$XDG_RUNTIME_DIR"

# This password protects only synthetic fixture keys in the temporary session.
printf '%s' 'zyra-synthetic-ci-keyring' | gnome-keyring-daemon \
  --foreground --unlock --components=secrets --control-directory="$session_root/keyring" &
keyring_pid=$!
cleanup() {
  kill "$keyring_pid" 2>/dev/null || true
  wait "$keyring_pid" 2>/dev/null || true
  rm -rf -- "$session_root"
}
trap cleanup EXIT
gdbus wait --session --timeout 15 org.freedesktop.secrets

export ZYRA_NATIVE_TEST_STORAGE_PROFILE="$session_root/electron-profile"
env -u ELECTRON_RUN_AS_NODE timeout 20 desktop/node_modules/.bin/electron \
  desktop/scripts/fixtures/native-storage-backend-electron.cjs
"$@"
