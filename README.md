# wavelength-wdk

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![GitHub](https://img.shields.io/badge/GitHub-lightninglabs%2Fwavelength--wdk-181717?logo=github)](https://github.com/lightninglabs/wavelength-wdk)

A Wavelength (self-custodial Lightning) wallet integration built on
WDK, using [Bare](https://github.com/holepunchto/react-native-bare-kit)
to embed the same wallet daemon across mobile and desktop. Maintained by
[Lightning Labs](https://lightning.engineering/).

## Layout

```
/
├── wdk-wallet-wavelength/  The WDK WalletManager/WalletAccount classes for
│                           Wavelength, and the per-platform transports to the
│                           daemon (iOS addon, Android React Native module,
│                           desktop WASM host).
├── wavelength-bare-addon/  The Bare native addon that calls the daemon in-process
│                           on iOS.
└── example/
    ├── wdk-mobile/         React Native (Expo) demo app -- iOS/Android.
    └── wdk-cli/            Interactive REPL demo -- runs directly under `bare`
                            on darwin/linux/win32, no Xcode/emulator needed.
```

## Installing

```bash
npm install @lightninglabs/wdk-wallet-wavelength
```

The gomobile binaries (the iOS xcframework and the Android `.aar`) are fetched
and checksum-verified on install, from the wavelength release that
`@lightninglabs/wavelength-core` is paired with.

### Working in this repo

The packages and examples are npm workspaces: run `npm install` once at the
repo root.

## wdk-wallet-wavelength

Implements WDK's standard `WalletManager`/`WalletAccount` interfaces for
Wavelength, so a Wavelength wallet behaves like any other WDK wallet:
`WalletManagerWavelength` derives accounts, and each account is a
`WalletAccountWavelength` (full access) or `WalletAccountReadOnlyWavelength`
(read-only, no signing).

- **Self-custodial Lightning wallet** -- wraps an embedded Wavelength daemon that owns its own on-disk keystore
- **On-chain Bitcoin** -- boarding deposit addresses, sends, and fee quotes
- **Lightning Network** -- create invoices, pay invoices, and quote payment fees
- **Exits** -- cooperative leave and unilateral exit, exit status/summary, and wallet sweep
- **Read-only views** -- query balance, activity, and daemon status without a signing-capable client

See [`wdk-wallet-wavelength/README.md`](./wdk-wallet-wavelength/README.md) for the full API.

## wavelength-bare-addon

The iOS native addon: calls the gomobile daemon (`Wavewalletdk.xcframework`)
directly from the Bare worklet. Its install fetches and checksum-verifies the
xcframework. Android reaches the daemon through
`@lightninglabs/wavelength-react-native` instead, and desktop through the WASM
runtime.

## Usage

See each example's own README for setup and usage:

| Example | Quick start |
| --- | --- |
| [`example/wdk-mobile`](./example/wdk-mobile/README.md) | `npm run build:worklet-bundle && npm run ios` (or `android`) |
| [`example/wdk-cli`](./example/wdk-cli/README.md) | See its README for the WASM runtime |

## License

MIT
