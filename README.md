# wavelength-wdk

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](#license)
[![GitHub](https://img.shields.io/badge/GitHub-lightninglabs%2Fwavelength--wdk-181717?logo=github)](https://github.com/lightninglabs/wavelength-wdk)

A Wavelength (self-custodial Lightning) wallet integration built on
WDK, using [Bare](https://github.com/holepunchto/react-native-bare-kit)
to embed the same wallet daemon across mobile and desktop. Maintained by
[Lightning Labs](https://lightning.engineering/).

## Layout

```
/
├── wavelength-bindings/    The unified Wavelength (Bare/gomobile) binding layer --
│                           iOS native addon, Android RN TurboModule, desktop WASM
│                           host, and the platform-dispatch transport layer.
├── wdk-wallet-wavelength/  The WDK WalletManager/WalletAccount classes for
│                           Wavelength, built on wavelength-bindings.
└── example/
    ├── wdk-mobile/         React Native (Expo) demo app -- iOS/Android.
    └── wdk-cli/            Interactive REPL demo -- runs directly under `bare`
                            on darwin/linux/win32, no Xcode/emulator needed.
```

Each package under `example/` has its own `package.json` and installs its
own dependencies independently (`npm install` inside that directory) --
`wavelength-bindings` and `wdk-wallet-wavelength` are consumed as `file:`
dependencies.

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

## wavelength-bindings

The low-level glue between `wdk-wallet-wavelength` and the embedded
Wavelength daemon (built via gomobile/Bare). Every platform-specific way of
talking to that daemon lives here as one package, selected automatically by
`createWavelengthTransport` at runtime instead of being spread across
several separate ones.

- iOS
- Android
- macOS
- Linux
- Windows

See [`wavelength-bindings/README.md`](./wavelength-bindings/README.md) for platform support details.

## Usage

See each example's own README for setup and usage:

| Example | Quick start |
| --- | --- |
| [`example/wdk-mobile`](./example/wdk-mobile/README.md) | `cd example/wdk-mobile && npm install && npm run ios` (or `npm run android`) |
| [`example/wdk-cli`](./example/wdk-cli/README.md) | See its README |

## License

Apache-2.0
