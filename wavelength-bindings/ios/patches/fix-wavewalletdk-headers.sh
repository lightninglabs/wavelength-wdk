#!/bin/bash
# Patches Wavewalletdk.xcframework's gobind-generated Objective-C headers.
#
# Why this exists:
#   gobind (`gobind -lang=objc ...`) emits `@import Foundation;` at the top of
#   Mobile.objc.h and Universe.objc.h. Compiling this addon's binding.mm
#   (Objective-C++) fails with:
#
#     use of '@import' when C++ modules are disabled, consider using
#     -fmodules and -fcxx-modules
#
#   CLANG_ENABLE_MODULES is on at the Pods project level (so -fmodules is
#   active), but Xcode never passes -fcxx-modules, which Clang requires
#   separately for @import in an Objective-C++ translation unit. Passing
#   -fcxx-modules via a Podfile post_install instead trades this error for a
#   worse one (TurboModule/RCTTurboModule symbols go missing, since importing
#   ReactCommon/RCTTurboModule.h as a Clang module loses its C++
#   declarations) -- rewriting the two headers directly is the fix that
#   actually works, confirmed against Lightning Labs' own React Native
#   Installation doc, which stages binaries this same way.
#
# When to re-run this:
#   Every time Wavewalletdk.xcframework is freshly fetched/staged -- the
#   rewrite is applied to the file on disk, so anything that re-copies or
#   re-downloads the xcframework (a fresh `npm install` of whatever package
#   vendors it, a re-run of a fetch/stage script, `pod install` re-vendoring
#   from node_modules) silently reverts it. There is no way to make this
#   survive a refetch short of patching it at the source (ask Lightning Labs)
#   or building that rewrite into whatever script stages the xcframework --
#   until then, re-run this script after every (re)stage.
#
# Usage:
#   ./fix-wavewalletdk-headers.sh [path/to/Wavewalletdk.xcframework]
#
# Defaults to the xcframework wherever it's currently vendored for this repo.

set -euo pipefail

XCFRAMEWORK="${1:-}"

if [ -z "$XCFRAMEWORK" ]; then
  # Known locations this project has vendored the xcframework at, in order
  # of preference. Update this list if the staging location changes again.
  # The addon-local copy is canonical now: it's vendored directly by
  # wavelength-bare-addon.podspec (s.vendored_frameworks), decoupled from
  # @lightninglabs/wavelength-react-native, which is no longer a dependency
  # at all. The node_modules paths are kept as fallbacks in case an older
  # checkout or a different package still stages it there.
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
