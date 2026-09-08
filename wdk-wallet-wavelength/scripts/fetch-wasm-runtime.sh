#!/usr/bin/env bash
#
# Stages the Wavewalletdk WASM runtime asset set -- wavewalletdk.wasm plus
# the go-wasmsqlite bundle (wasm_exec.js, sqlite-bridge.js, sqlite-worker.js,
# sqlite-node-vfs.js, sqlite3.js, sqlite3.wasm, sqlite3-opfs-async-proxy.js,
# wavewalletdk.wasm.gz) -- into .wavelength-wasm-runtime/ at the repo root,
# for BareWasmWavelengthClient (wavelength-transport-bare-wasm.js) to load at
# runtime via its `runtimeDir` option. Mirrors the shape of
# wavelength-mobile/scripts/fetch-aar.sh and
# wavelength-sdk/apps/web-wallet-demo/scripts/{fetch-runtime-assets,wasm-local}.sh
# (dual-mode: build locally, or fetch a published release), adapted for what
# this transport actually needs.
#
# Usage:
#   ./scripts/fetch-wasm-runtime.sh                 build locally (default)
#   WAVELENGTH_DIR=/path/to/wavelength ./scripts/fetch-wasm-runtime.sh
#                                                     build from a specific checkout
#   ./scripts/fetch-wasm-runtime.sh --release        fetch the pinned release instead
#
# Configuration (env vars, all optional):
#   WAVELENGTH_DIR   path to a wavelength checkout to build from
#                    (default: ../../wavelength, a sibling of this repo)
#   WAVELENGTH_REPO  owner/name of the wavelength repo, release-fetch mode only
#                    (default: lightninglabs/wavelength)
set -euo pipefail

PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PKG/.." && pwd)"
DST="$REPO_ROOT/.wavelength-wasm-runtime"
MODE="${1:-local}"

case "$MODE" in
  local|--release) ;;
  *) echo "usage: $(basename "$0") [--release]" >&2; exit 1 ;;
esac

# The full go-wasmsqlite + wasm-blob set wavelength's `make wasm-wallet`
# produces -- see that Makefile target's own comment on why
# sqlite-node-vfs.js ships even though only a Node/Bare host loads it: "one
# asset set serves both hosts."
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

# Stage into a temp dir and swap it in only once the full set is present, so
# an aborted run never leaves .wavelength-wasm-runtime/ half-populated for a
# later `ready()` call to load -- same reasoning as fetch-bindings.sh /
# fetch-runtime-assets.sh's identical pattern.
mkdir -p "$REPO_ROOT"
TMP="$(mktemp -d "$REPO_ROOT/.fetch-wasm-runtime-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

if [[ "$MODE" == "--release" ]]; then
  VERSION="$(node "$PKG/scripts/wasm-runtime-version.mjs")"
  if [[ -z "$VERSION" ]]; then
    echo "error: no wavelength release is pinned yet (WASM_RUNTIME_VERSION is null)." >&2
    echo "       set a compatible release in scripts/wasm-runtime-version.mjs," >&2
    echo "       or build locally by omitting --release." >&2
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

  # Release assets are fetched over plain curl with no signature -- verify
  # each file against a checksum pinned at the same time as VERSION, so a
  # compromised or swapped release asset is caught before its content is
  # ever eval()'d/instantiated (see wasm-host-bootstrap.js).
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

# Every selected file is confirmed non-empty before anything is staged --
# a build/download that silently produced a truncated artifact should not
# replace a previously-working runtime.
for f in "${FILES[@]}"; do
  if [[ ! -s "$TMP/$f" ]]; then
    echo "error: $f is missing or empty after staging" >&2
    exit 1
  fi
done

# The vendored asset directory needs its own package.json declaring CommonJS
# -- without it, sqlite3.js inherits whatever `type` the nearest ancestor
# package.json declares (this repo's is "module"), gets silently sniffed as
# ESM, and its UMD `module.exports = sqlite3InitModule` assignment never
# connects to anything (require() on it just returns {}, no error). Written
# here so it survives every re-fetch, not just the first manual setup.
echo '{"type":"commonjs"}' > "$TMP/package.json"

rm -rf "$DST"
mv "$TMP" "$DST"

echo "==> staged $(du -sh "$DST" | cut -f1) into $DST"
