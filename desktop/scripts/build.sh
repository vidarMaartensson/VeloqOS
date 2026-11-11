#!/usr/bin/env bash
# Builds the Mac app. Signs with the first Apple Development certificate in the keychain when there is one,
# so every build keeps the same identity and macOS remembers the microphone grant. Without one it falls
# back to ad-hoc signing ("-" in tauri.conf.json), which macOS treats as a new app after every build.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  identity=$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/^ *[0-9]*) \([0-9A-F]\{40\}\) "Apple Development:.*/\1/p' | head -n 1)
  if [[ -n "$identity" ]]; then
    export APPLE_SIGNING_IDENTITY="$identity"
    echo "Signerar med Apple Development-certifikatet $identity"
  else
    echo "Hittade inget Apple Development-certifikat – signerar ad hoc, macOS frågar om mikrofonen efter varje bygge."
  fi
fi

exec npx tauri build "$@"
