# Patches

## `fix-wavewalletdk-headers.sh`

Rewrites `@import Foundation;` -> `#import <Foundation/Foundation.h>` in
`Wavewalletdk.xcframework`'s gobind-generated headers (`Mobile.objc.h` and
`Universe.objc.h`, every slice).

```sh
# from the repo root -- auto-detection uses repo-root-relative paths
./wavelength-bindings/ios/patches/fix-wavewalletdk-headers.sh

# from anywhere, with an explicit path
./fix-wavewalletdk-headers.sh path/to/Wavewalletdk.xcframework
```

Idempotent -- only rewrites headers that still contain `@import`, and reports
how many it patched vs. left clean.

### Why

`binding.mm` is Objective-C++, and `@import` needs C++ modules, so the build
fails:

```
use of '@import' when C++ modules are disabled, consider using -fmodules and -fcxx-modules
```

Enabling `-fcxx-modules` instead trades this for a worse failure: importing
`ReactCommon/RCTTurboModule.h` as a Clang module drops its C++ declarations,
so the TurboModule symbols disappear. Rewriting the header is the fix that
works.

### Why it has to be re-run

The rewrite is applied to the xcframework on disk
(`wavelength-bindings/ios/Wavewalletdk.xcframework`, gitignored). Anything
that re-fetches or re-stages it reverts the headers, and the build fails with
the same error until this runs again.

Run it after every (re)stage of the xcframework, before building.

### Proper fix

This belongs upstream, in whatever produces the xcframework -- either fixing
`gobind`'s Objective-C header generation, or applying this rewrite in the
release pipeline so consumers get a pre-patched artifact.
