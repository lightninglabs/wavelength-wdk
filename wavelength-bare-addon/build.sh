#!/bin/bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Device
npx bare-make generate --platform ios --arch arm64 --build build/ios-arm64
npx bare-make build --build build/ios-arm64
npx bare-make install --build build/ios-arm64

# Simulator
npx bare-make generate --platform ios --arch arm64 --simulator --build build/ios-arm64-simulator
npx bare-make build --build build/ios-arm64-simulator
npx bare-make install --build build/ios-arm64-simulator
