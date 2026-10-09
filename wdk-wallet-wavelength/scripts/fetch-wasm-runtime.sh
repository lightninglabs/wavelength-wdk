#!/usr/bin/env bash
#
# Stages the Wavewalletdk WASM runtime into .wavelength-wasm-runtime/ for
# BareWasmWavelengthClient's `runtimeDir` option.
#
# Usage:
#   ./scripts/fetch-wasm-runtime.sh            build from a local checkout
#   ./scripts/fetch-wasm-runtime.sh --release  fetch the pinned release
#
# Env: WAVELENGTH_DIR (default ../../wavelength), WAVELENGTH_REPO
# (default lightninglabs/wavelength, --release only).
set -euo pipefail

PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PKG/.." && pwd)"
DST="$REPO_ROOT/.wavelength-wasm-runtime"
MODE="${1:-local}"

case "$MODE" in
  local|--release) ;;
  *) echo "usage: $(basename "$0") [--release]" >&2; exit 1 ;;
esac

# The full `make wasm-wallet` set; browser-only files ship too.
FILES=(
  wavewalletdk.wasm
  wavewalletdk.wasm.gz
  wasm_exec.js
  sqlite-bridge.js
  sqlite-worker.js
  sqlite-node-vfs.js
  sqlite3.js
  sqlite3.wasm
  sqlite3-opfs-async-proxy.js
)

# Stage into a temp dir and swap in only once the full set is present, so an
# aborted run never leaves a half-populated runtime for `ready()` to load.
mkdir -p "$REPO_ROOT"
TMP="$(mktemp -d "$REPO_ROOT/.fetch-wasm-runtime-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

if [[ "$MODE" == "--release" ]]; then
  VERSION="$(node "$PKG/scripts/wasm-runtime-version.mjs")"
  if [[ -z "$VERSION" ]]; then
    echo "error: could not read the paired release from @lightninglabs/wavelength-core;" >&2
    echo "       run npm install, or build locally by omitting --release." >&2
    exit 1
  fi

  WAVELENGTH_REPO="${WAVELENGTH_REPO:-lightninglabs/wavelength}"
  ARCHIVE="Wavewalletdk.wasm.tar.gz"
  URL="https://github.com/$WAVELENGTH_REPO/releases/download/$VERSION/$ARCHIVE"

  echo "==> fetching $URL"
  if ! curl -fsSL --retry 3 --retry-delay 2 "$URL" -o "$TMP/$ARCHIVE"; then
    echo "error: could not download $URL" >&2
    echo "       check that the wavelength release tagged $VERSION exists and is" >&2
    echo "       published (draft releases serve no public assets)." >&2
    exit 1
  fi

  tar -xzf "$TMP/$ARCHIVE" -C "$TMP" "${FILES[@]}"
  rm -f "$TMP/$ARCHIVE"

  # Release assets carry no signature, and their content is later eval()'d
  # with full trust, so pinned checksums are the only integrity check.
  node "$PKG/scripts/verify-wasm-runtime-checksums.mjs" "$TMP" "$VERSION"
else
  WAVELENGTH_DIR="${WAVELENGTH_DIR:-$REPO_ROOT/../wavelength}"
  if [[ ! -d "$WAVELENGTH_DIR/cmd/wavewalletdk-wasm" ]]; then
    echo "error: wavelength checkout not found at $WAVELENGTH_DIR" >&2
    echo "       set WAVELENGTH_DIR to a wavelength checkout that includes PR #1064" >&2
    echo "       (internal/wasmhost, commit c7e3497f or later)." >&2
    exit 1
  fi

  echo "==> building wavewalletdk wasm blob + runtime assets from $WAVELENGTH_DIR"
  make -C "$WAVELENGTH_DIR" wasm-wallet

  for f in "${FILES[@]}"; do
    cp "$WAVELENGTH_DIR/bin/wasm/$f" "$TMP/"
  done
fi

# A build that silently truncated an artifact must not replace a working
# runtime.
for f in "${FILES[@]}"; do
  if [[ ! -s "$TMP/$f" ]]; then
    echo "error: $f is missing or empty after staging" >&2
    exit 1
  fi
done

# Without this, sqlite3.js inherits this repo's "module" type, gets sniffed
# as ESM, and its UMD `module.exports` assignment silently connects to
# nothing -- require() returns {} with no error.
echo '{"type":"commonjs"}' > "$TMP/package.json"

rm -rf "$DST"
mv "$TMP" "$DST"

echo "==> staged $(du -sh "$DST" | cut -f1) into $DST"
