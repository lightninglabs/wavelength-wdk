#!/bin/bash
# Rebuilds worklet/driver-wdk.bundle.js from driver-wdk.mjs -- nothing else
# regenerates it, so a wdk-wallet-wavelength source change otherwise leaves
# the app running stale code.
#
# xcframework header and Podfile fixes now apply automatically on every
# `expo prebuild` via wavelength-bindings/app.plugin.cjs.

set -euo pipefail
cd "$(dirname "$0")/.."

npx bare-pack --host ios --linked -o worklet/driver-wdk.bundle.js worklet/driver-wdk.mjs
echo "done"
