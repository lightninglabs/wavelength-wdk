# @lightninglabs/wavelength-bare-addon

The [Bare](https://github.com/holepunchto/bare) native addon that calls the
Wavelength daemon in-process on iOS. It binds the gomobile framework
(`Wavewalletdk.xcframework`) directly, so a Bare worklet inside
`react-native-bare-kit` talks to the daemon without going through WebAssembly.

You normally don't install this package yourself.
`@lightninglabs/wdk-wallet-wavelength` depends on it and selects it
automatically on iOS. Android reaches the daemon through
`@lightninglabs/wavelength-react-native` instead, and desktop through the WASM
runtime.

## Binaries

The package ships prebuilt addons for `ios-arm64` (devices) and
`ios-arm64-simulator`. The daemon framework itself is not in the package: on
macOS, the install script downloads it from the wavelength release that
`@lightninglabs/wavelength-core` is paired with and checks it against the
checksum pinned in `scripts/checksums.json`. The download is best effort during
`npm install`. The Expo config plugin in `wdk-wallet-wavelength` retries it
during `expo prebuild` and fails the build if it still can't stage the
framework.

The addon doesn't embed the framework, so the CocoaPods spec
(`wavelength-bare-addon.podspec`) vendors it into the app.

## Versioning

The version matches the daemon release it is built against, the same as
`@lightninglabs/wavelength-core` and `@lightninglabs/wdk-wallet-wavelength`.
Install all three at the same version.

## License

MIT
