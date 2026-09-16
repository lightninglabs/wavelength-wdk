# Wavelength WDK Mobile App

Wavelength/WDK wallet demo running on React Native

<p align="center">
  <img src="./docs/screenshot.png" alt="wdk-mobile app screenshot" width="300" />
</p>

## Usage

```sh
npm install
```

### iOS

```sh
npm run ios
```

iOS native setup (xcframework headers, Podfile) is applied automatically by
`wavelength-bindings`'s Expo config plugin on every `expo prebuild`. If
`worklet/driver-wdk.mjs` changed, rebuild the bundle it ships:
[`scripts/README.md`](./scripts/README.md).

### Android

```sh
npm run android
```

## License

Apache-2.0
