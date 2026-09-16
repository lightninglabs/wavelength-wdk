#!/bin/bash
# Rewrites gobind's `@import Foundation;` to `#import <Foundation/Foundation.h>`
# in Mobile.objc.h/Universe.objc.h -- @import fails to compile in this addon's
# Objective-C++ translation unit without -fcxx-modules, which enabling breaks
# TurboModule symbols instead. Applied to the file on disk, so it reverts on
# every re-fetch/re-stage of the xcframework -- re-run this after each one.
#
# Usage:
#   ./fix-wavewalletdk-headers.sh [path/to/Wavewalletdk.xcframework]

set -euo pipefail

XCFRAMEWORK="${1:-}"

if [ -z "$XCFRAMEWORK" ]; then
  # First match wins; the others are fallbacks for older checkouts.
  CANDIDATES=(
    "wavelength-bindings/ios/Wavewalletdk.xcframework"
    "node_modules/@lightninglabs/wavelength-react-native/ios/Wavewalletdk.xcframework"
    "wdk-wallet-wavelength/node_modules/@lightninglabs/wavelength-react-native/ios/Wavewalletdk.xcframework"
  )
  for candidate in "${CANDIDATES[@]}"; do
    if [ -d "$candidate" ]; then
      XCFRAMEWORK="$candidate"
      break
    fi
  done
fi

if [ -z "$XCFRAMEWORK" ] || [ ! -d "$XCFRAMEWORK" ]; then
  echo "error: could not find Wavewalletdk.xcframework." >&2
  echo "Pass its path explicitly: $0 path/to/Wavewalletdk.xcframework" >&2
  exit 1
fi

echo "patching headers under: $XCFRAMEWORK"

patched=0
skipped=0

while IFS= read -r -d '' header; do
  case "$(basename "$header")" in
    Mobile.objc.h|Universe.objc.h) ;;
    *) continue ;;
  esac

  if grep -q '@import Foundation;' "$header"; then
    /usr/bin/sed -i '' 's|@import Foundation;|#import <Foundation/Foundation.h>|' "$header"
    echo "  patched: $header"
    patched=$((patched + 1))
  else
    echo "  already clean: $header"
    skipped=$((skipped + 1))
  fi
done < <(find "$XCFRAMEWORK" -type f \( -name "Mobile.objc.h" -o -name "Universe.objc.h" \) -print0)

echo "done: $patched patched, $skipped already clean"

if [ "$patched" -eq 0 ] && [ "$skipped" -eq 0 ]; then
  echo "warning: found no Mobile.objc.h/Universe.objc.h under $XCFRAMEWORK -- check the path" >&2
  exit 1
fi
