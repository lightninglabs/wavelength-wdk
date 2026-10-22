#!/bin/bash
# Builds the addon's iOS prebuilds into prebuilds/<host>/ against the
# Wavewalletdk.xcframework of the daemon release wavelength-core is paired
# with. Needs macOS with Xcode. The prebuilds are not committed: the release
# workflow builds them for every publish, and the example app needs them
# built locally before its addons are linked.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# The headers the binding compiles against come from the staged framework, so
# stage it first. Unlike the install script, this fails on a download or
# checksum error instead of warning.
node -e "require('./scripts/fetch-xcframework.cjs').fetchXcframework()"

# Start clean so a host dropped from this list can't linger in the package,
# and drop the record of the last build so a partial one leaves none.
STAMP=build/framework.sha256
rm -rf prebuilds "$STAMP"

# cmake-toolchains prefers a Homebrew LLVM over Xcode's clang when one is
# installed (GitHub's macOS runners have one), and that links against the
# macOS SDK instead of the iOS one. APPLE_CLANG makes it use Xcode's.
build () {
  local host="$1"
  shift
  npx bare-make generate --platform ios "$@" --define APPLE_CLANG=ON --build "build/$host"
  npx bare-make build --build "build/$host"
  npx bare-make install --build "build/$host"
}

build ios-arm64 --arch arm64
build ios-arm64-simulator --arch arm64 --simulator
build ios-x64-simulator --arch x64 --simulator

# Records which framework these prebuilds were built against, so the example
# app's addon linking can warn when they no longer match the staged one.
# build/ isn't packed, so this never ships.
cp Wavewalletdk.xcframework/.wavelength-sha256 "$STAMP"
