# Desktop (Bare CLI)

An interactive REPL for driving a Wavelength wallet directly under Bare on
macOS, Linux, or Windows -- no UI. Paste a seed phrase to import (or generate
a new one), then drive the wallet from a `wavelength>` prompt: add/switch
accounts, check balances, send and receive. No Android SDK, Xcode, emulator,
or simulator needed.

## Prerequisites

1. **Install dependencies**: `npm install` at the repo root.
2. **Stage the WASM runtime assets.** The desktop transport needs
   `wavewalletdk.wasm` + its go-wasmsqlite bundle in `.wavelength-wasm-runtime/`
   in this directory -- not committed (it's ~130MB), and not fetched by
   `npm install`. Download the pinned public Wavelength release:

   ```sh
   cd ../../wdk-wallet-wavelength
   npm run fetch:wasm-runtime -- --release
   cp -r ../.wavelength-wasm-runtime ../example/wdk-cli/
   ```

   To test an unpublished Wavelength change instead, omit `--release`. The
   local-build mode expects a checkout at `../../wavelength` by default; pass
   `WAVELENGTH_DIR=/path/to/wavelength` to override it.

## Running it

From this directory:

```sh
npx bare index.mjs
```

Optionally pass a custom base directory as the first argument. The default is
`.wavelength-cli-demo-data` in this directory:

```sh
npx bare index.mjs /path/to/data-dir
```

On startup, paste an existing BIP-39 seed phrase to import it, or press Enter
to generate a new one (write it down -- it's shown once, never persisted).
Account 0 then boots automatically, syncing against signet, which can take
roughly 35-75 seconds the first time:

```
Paste a seed phrase to import, or press Enter to create a new wallet.
seed phrase (blank = create new)>
Generated a new seed phrase -- write it down:

  abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about

Booting account 0...

────────────────────────────────────────────────────────────
⚡ Wavelength WDK CLI Demo
────────────────────────────────────────────────────────────
  ...
────────────────────────────────────────────────────────────

wavelength> info
{
  index: 0,
  path: "m/83696968'/1463899717'/2'/0'/0'",
  walletState: 'ready',
  identityPubKey: '<hex>'
}
wavelength> add
Account 1 open and active.
wavelength> balance
0 sat
wavelength> exit

Stopping every open account...
```

Type `help` at the prompt for the full command list (`accounts`, `add`,
`use <index>`, `close <index>`, `info`, `balance`, `address`, `deposit`,
`activity`, `send`, `invoice`, `payinvoice`, `quote`, `mnemonic`, `exit`).

## Persistence and shutdown

`exit` stops every open account's daemon, waits for database shutdown, and
then terminates its worker. Re-running the CLI with the same seed and base
directory reopens the same profiles when you `add`/`use` the same indices
again.
