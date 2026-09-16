# scripts/

## `fix-ios-durability.sh`

Rebuilds `worklet/driver-wdk.bundle.js` from `driver-wdk.mjs`. Run after any
`wdk-wallet-wavelength` source change -- nothing else regenerates the bundle.

```sh
./scripts/fix-ios-durability.sh
```

iOS native fixes (xcframework headers, `ios/Podfile`'s `wavelength-bare-addon`
pod) are applied automatically on every `expo prebuild` by
`wavelength-bindings/app.plugin.cjs` -- no manual step for those.
