---
name: syncing-daemon-release
description: Use when wavelength-sdk publishes a new release (and with it a new wavelength daemon release) and this repo must be updated to pair with it, when the wavelength-core or wavelength-react-native pins are stale, when the version-pins test fails, or when a binary checksum is missing for the paired release.
metadata:
  internal: true
---

# Syncing to a New Daemon Release

## Overview

This repo pairs with one wavelength daemon release through
`@lightninglabs/wavelength-core`: its `RUNTIME_MANIFEST_VERSION` names the
release every daemon binary is downloaded from. wavelength-sdk versions core
and `@lightninglabs/wavelength-react-native` in lockstep with the daemon, and
this repo's two packages follow the same version. A sync to `X` (daemon `vX`)
moves the pins, the per-release binary checksums, both package versions, and
any code the upstream API changes require. It is complete when
`wdk-wallet-wavelength/tests/version-pins.test.js` passes (it fails until all
of those agree) and the verification ladder is green.

Nothing here is generated from the daemon's source, so no wavelength or
wavelength-sdk checkout is needed. First confirm both upstream releases are
published:

```sh
npm view @lightninglabs/wavelength-core@X version
npm view @lightninglabs/wavelength-react-native@X version
gh release view vX --repo lightninglabs/wavelength --json isDraft,assets \
  --jq '{isDraft, assets: [.assets[].name]}'
```

It must be `isDraft: false` with `Wavewalletdk.aar`,
`Wavewalletdk.xcframework.tar.gz` and `Wavewalletdk.wasm.tar.gz` attached;
draft assets aren't public, so every install-time fetch would 404.

## What changed upstream -> what to touch here

Diff the published packages (`<prev>` is the version currently pinned):

```sh
npm diff --diff=@lightninglabs/wavelength-core@<prev> --diff=@lightninglabs/wavelength-core@X
npm diff --diff=@lightninglabs/wavelength-react-native@<prev> --diff=@lightninglabs/wavelength-react-native@X
```

For the iOS daemon functions, diff the framework header: stage the old
framework (`npm run fetch-xcframework -w wavelength-bare-addon`, macOS only),
copy
`wavelength-bare-addon/Wavewalletdk.xcframework/ios-arm64/Wavewalletdk.framework/Headers/Mobile.objc.h`
aside, bump the pins, fetch again, and diff the `FOUNDATION_EXPORT Mobile*`
lines.

| Upstream change | Touch here |
|---|---|
| Any release | The pins, the three checksum files, both package versions, the internal pins, `package-lock.json` (procedure steps 1 to 4) |
| `Mobile*` function added, removed, or its signature changed in `Mobile.objc.h` | The `WAVELENGTH_JSON_METHOD` / `WAVELENGTH_GETTER_METHOD` lists in `wavelength-bare-addon/binding.mm`; the method list in `wavelength-bare-addon/index.d.ts`; `GETTER_METHODS` / `SCALAR_METHODS` in `wdk-wallet-wavelength/src/transports/wavelength-transport-bare-native.js`; then rebuild the prebuilds (step 6). Nothing at build or install time catches a stale prebuild: it resolves `Mobile*` when the app loads |
| `WavelengthClient` methods, request or result types in core's `.d.ts` | The wrappers in `wdk-wallet-wavelength/src/wallet-account-*.js` and `wallet-manager-wavelength.js`, their JSDoc typedefs (and `index.js`'s), the API section of `wdk-wallet-wavelength/README.md`, then `npm run build:types -w wdk-wallet-wavelength` (the `types/` folder is committed) |
| React Native package exports or the `NativeWavelength` module | `wdk-wallet-wavelength/src/transports/wavelength-native-module.js`, `src/transports/global.d.ts`, and `example/wdk-mobile/lib/ipc-relay.js`. A new daemon method needs no Android code here: the relay sends every method through one generic `call(method, paramsJson)` |
| Files in the WASM runtime archive | `FILES` in `wdk-wallet-wavelength/scripts/fetch-wasm-runtime.sh` and the keys in `wdk-wallet-wavelength/scripts/wasm-runtime-checksums.json` |

## Ordered procedure

1. **Pins**: set `@lightninglabs/wavelength-core` to `X` in
   `wdk-wallet-wavelength`, `wavelength-bare-addon` and `example/wdk-cli`, and
   `@lightninglabs/wavelength-react-native` to `X` in `example/wdk-mobile`.
   Exact versions only; the pin test rejects ranges.
2. **Checksums**: replace the entry in each file with a `vX` one (only the
   paired release is ever looked up).
   - `wdk-wallet-wavelength/scripts/aar-checksums.json` and
     `wavelength-bare-addon/scripts/checksums.json`: GitHub records each
     asset's SHA-256 (drop the `sha256:` prefix), so read it rather than
     downloading 320 MB:

     ```sh
     gh release view vX --repo lightninglabs/wavelength --json assets \
       --jq '.assets[] | select(.name == "Wavewalletdk.aar" or .name == "Wavewalletdk.xcframework.tar.gz") | "\(.name) \(.digest)"'
     ```

   - `wdk-wallet-wavelength/scripts/wasm-runtime-checksums.json` pins each file
     inside `Wavewalletdk.wasm.tar.gz`, not the archive. wavelength-sdk pins
     the same files as base64 SRI digests in `RUNTIME_ASSET_DIGESTS`
     (`packages/web/src/runtime-manifest.ts` at its `vX` tag); convert each
     with `node -p 'Buffer.from("<base64>", "base64").toString("hex")'`.
     The ladder's `fetch:wasm-runtime -- --release` verifies the result.
3. **Versions**: set `version` in `wavelength-bare-addon/package.json` and
   `wdk-wallet-wavelength/package.json` to `X` (no `v`), the wallet's
   dependency on the addon to `X`, and both examples' dependency on
   `@lightninglabs/wdk-wallet-wavelength` to `X`. The podspec reads its
   version from `package.json`.
4. **Lockfile**: `npm install` at the repo root. If it also rewrites
   unrelated fields (such as `libc` entries), your npm differs from the one
   that last wrote the file; edit only the changed versions instead.
5. **API changes**: work through the table rows that apply.
6. **iOS prebuilds** (only when `binding.mm` changed or a bound `Mobile*`
   signature changed): on macOS, with the new framework staged, run
   `wavelength-bare-addon/build.sh` and commit `wavelength-bare-addon/prebuilds`.
7. **Verify** with the ladder below, then **commit** with the repo's area
   prefixes (`wdk:`, `addon:`, `example:`, `docs:`), one logical change
   each. The pins, checksums and versions are one change.

## Verification ladder (run in this order)

```sh
cd wdk-wallet-wavelength
npm run lint && npm run typecheck && npm test   # includes version-pins.test.js
cd ../example/wdk-mobile
npm run build:worklet-bundle && npm test        # catches export-condition and addon packing breaks
cd ../../wdk-wallet-wavelength
npm run fetch:wasm-runtime -- --release         # downloads vX and verifies the WASM checksums
cp -r ../.wavelength-wasm-runtime ../example/wdk-cli/
cd ../example/wdk-cli && npx bare index.mjs     # boot account 0 on signet, check balance
```

The integration tests (`npm run test:integration`) self-skip under Jest, so
they prove nothing here. iOS and Android device builds of `example/wdk-mobile`
(`npm run ios`, `npm run android`) are the only check that the prebuilds, the
staged framework and the `.aar` load. They need a simulator or device, so ask
the user to run them rather than skipping them.

## Release

Cutting the release is in `RELEASE.md`: create the GitHub release `vX` after
the sync PR merges, with the pre-release box checked for a hyphenated
version.

Release notes: a first line linking the paired
[wavelength](https://github.com/lightninglabs/wavelength/releases) and
[wavelength-sdk](https://github.com/lightninglabs/wavelength-sdk/releases)
`vX` releases; for a prerelease, an
`npm install @lightninglabs/wdk-wallet-wavelength@next` snippet; then the
auto-generated PR list and **Full Changelog** link:

```sh
gh api repos/lightninglabs/wavelength-wdk/releases/generate-notes \
  -f tag_name=vX -f previous_tag_name=<base>
```

For a stable release, `<base>` is the previous stable tag, so the notes cover
the whole cycle including its RCs. For an RC, it's the tag just before it.

## Common mistakes

- Pinning core or the React Native package with `^` or `~`. The binaries are
  keyed by the exact daemon release, so a range lets a consumer resolve a
  core whose release has no pinned checksums.
- Taking the WASM checksums from `Wavewalletdk.wasm.tar.gz`'s asset digest.
  The checksum file pins the extracted files, not the archive.
- Treating a green `npm test` as proof the iOS addon works. The prebuilds are
  only exercised on a device or simulator.

## After the sync: improve this skill

Every release differs, so propose concrete edits to THIS file before
finishing, and apply them on approval. The test for a candidate edit: would it
help on a typical sync, or only on the exact change this release happened to
carry? Durable environment facts and recurring change CLASSES belong here; a
lesson tied to one field, file, or command quirk is a one-off that is easy to
rediscover, so leave it out. Correct stale instructions rather than noting
them, prune what the run proved obsolete, keep additions terse (name the file,
the symptom, the fix), and propose the diff rather than committing it.
