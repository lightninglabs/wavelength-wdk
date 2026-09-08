#!/bin/bash
# Reapplies every fix discovered while getting Wavelength + WDK + Bare
# building on iOS that does NOT live in a stable, version-controlled place --
# each one silently regresses on its own trigger (see README.md in this
# directory for the full story on each). Safe to re-run any time; every step
# is idempotent.
#
# Run this after:
#   - `npx expo prebuild` (regenerates ios/Podfile from scratch, wiping the
#     pod line step 2 re-adds -- this is exactly what caused the SIGSEGV +
#     missing-libresolv build failures fixed earlier)
#   - any change to wdk-wallet-wavelength's source (step 3's bundle goes
#     stale otherwise -- the app keeps silently running old code)
#   - any re-fetch/re-stage of Wavewalletdk.xcframework from scratch (step 1
#     reverts otherwise -- the `@import Foundation` build error comes back)
#
# Does NOT touch: node_modules, ios/Pods, or run `pod install`/`xcodebuild`
# itself -- run those yourself afterward as needed.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> [1/3] Patching Wavewalletdk.xcframework headers (@import Foundation -> #import)"
bash ../../wavelength-bindings/ios/patches/fix-wavewalletdk-headers.sh ../../wavelength-bindings/ios/Wavewalletdk.xcframework

echo ""
echo "==> [2/3] Ensuring ios/Podfile vendors wavelength-bare-addon"
if [ ! -f ios/Podfile ]; then
  echo "    ios/Podfile doesn't exist yet -- run 'npx expo prebuild --platform ios' first, then re-run this script."
  exit 1
fi

node "$(dirname "$0")/lib/patch-podfile.js"

echo ""
echo "==> [3/3] Rebuilding worklet/driver-wdk.bundle.js from driver-wdk.mjs"
npx bare-pack --host ios --linked -o worklet/driver-wdk.bundle.js worklet/driver-wdk.mjs
echo "    done"

echo ""
echo "All durability fixes applied."
echo "If step 2 just inserted the pod line for the first time, run: cd ios && pod install"
