# Wavelength WDK Mobile App

Wavelength/WDK wallet demo running on React Native

<p align="center">
  <img src="./docs/screenshot.png" alt="wdk-mobile app screenshot" width="300" />
</p>

## Usage

```sh
npm install
```

Build the worklet bundle. It isn't committed, so do this before the first run
and again after changing `worklet/driver-wdk.mjs` or the wallet package:

```sh
npm run build:worklet-bundle
```

### iOS

The Wavelength addon's prebuilds aren't committed, so build them once on a
fresh checkout (macOS with Xcode), and again after changing the addon or
moving to a new daemon release. Then relink the app's addons:

```sh
npm run build:native -w @lightninglabs/wavelength-bare-addon
npm run postinstall
```

```sh
npm run ios
```

### Android

```sh
npm run android
```

On every `expo prebuild` the wallet's Expo plugin makes sure the iOS
xcframework and the Android `.aar` are staged, and adds the addon's pod.
`react-native.config.js` keeps `@lightninglabs/wavelength-react-native` off
iOS, where the addon already links the daemon.

## License

MIT
