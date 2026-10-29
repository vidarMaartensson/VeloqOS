#!/usr/bin/env bash
#
# Runs the Maestro UI flows against the connected device (or $ANDROID_SERIAL).
#
# The flows start from a cleared app and need the API running on the computer:
#   cd api && dotnet run --project src/VeloqOS.Api   (the emulator reaches it on 10.0.2.2)
#
#
#   ./.maestro/run.sh            # all flows
#   ./.maestro/run.sh 05         # flows whose file name starts with 05

set -euo pipefail

PACKAGE="com.vidarmartensson.veloqos"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
command -v adb >/dev/null 2>&1 && ADB="$(command -v adb)"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
command -v maestro >/dev/null 2>&1 && MAESTRO="$(command -v maestro)"

"$ADB" shell pm clear "$PACKAGE" >/dev/null

if [[ $# -gt 0 ]]; then
    for flow in "$DIR"/"$1"*.yaml; do "$MAESTRO" test "$flow"; done
else
    "$MAESTRO" test "$DIR"
fi
