#!/usr/bin/env bash
#
# Bygger API:t som en fristående fil som Mac-appen startar själv (Tauri "sidecar").
#   bash scripts/build-api.sh              # bygg alltid
#   bash scripts/build-api.sh --if-missing # bara om filen saknas (för `npm run dev`)

set -euo pipefail

DESKTOP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$DESKTOP/.." && pwd)"
TRIPLE="$(rustc -vV | awk '/^host:/ {print $2}')"
case "$TRIPLE" in
    aarch64-apple-darwin) RID=osx-arm64 ;;
    x86_64-apple-darwin)  RID=osx-x64 ;;
    *) echo "Mac-appen byggs bara på macOS (fick $TRIPLE)" >&2; exit 1 ;;
esac

TARGET="$DESKTOP/src-tauri/binaries/veloq-api-$TRIPLE"
if [[ "${1:-}" == "--if-missing" && -x "$TARGET" ]]; then
    exit 0
fi

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

echo "Bygger API:t ($RID)…"
dotnet publish "$ROOT/api/src/VeloqOS.Api" -c Release -r "$RID" --self-contained \
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
    -o "$OUT" --nologo -v quiet
cp "$OUT/VeloqOS.Api" "$TARGET"
chmod +x "$TARGET"
echo "API:t ligger i ${TARGET#$ROOT/}"
