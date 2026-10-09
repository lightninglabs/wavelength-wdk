# wdk-wallet-wavelength

A package to manage Wavelength (self-custodial Lightning) wallets. This package provides a clean API for creating, unlocking, and interacting with an embedded Wavelength daemon, supporting on-chain Bitcoin and Lightning transfers.

This module is part of [**WDK (Wallet Development Kit)**](https://wallet.tether.io/).

## 🌟 Features

- **Self-Custodial Lightning Wallet**: Wraps an embedded Wavelength daemon that owns its own on-disk keystore
- **On-Chain Bitcoin**: Boarding deposit addresses, sends, and fee quotes
- **Lightning Network**: Create invoices, pay invoices, and quote payment fees
- **Read-Only Views**: Query balances, activity, and daemon status without a signing-capable client
- **Bare/Pear Runtime Support**: Runs the embedded daemon natively via a Bare native addon, for use inside `react-native-bare-kit` or the Pear runtime

## 🖥️ Platform Support

The right transport is selected per runtime automatically: the in-process Bare addon on iOS, `@lightninglabs/wavelength-react-native` on Android, and the WASM runtime on desktop.

- macOS
- Linux
- Windows
- iOS
- Android

## ⬇️ Installation

```bash
npm install @lightninglabs/wdk-wallet-wavelength
```

The gomobile binaries (the iOS xcframework and the Android `.aar`) are fetched and checksum-verified on install.

For Android in a React Native app, also install `@lightninglabs/wavelength-react-native` at the same version as `@lightninglabs/wavelength-core`, add the Expo plugin `"plugins": ["@lightninglabs/wdk-wallet-wavelength/app.plugin.cjs"]` to your app.json, and keep the package off iOS in your app's react-native.config.js:

```javascript
module.exports = {
  dependencies: {
    '@lightninglabs/wavelength-react-native': { platforms: { ios: null } }
  }
}
```

On Android the wallet uses that package's exported `NativeWavelength` module and its `wavelengthActivity` events.

## 🚀 Quick Start

### Importing from `@lightninglabs/wdk-wallet-wavelength`

1. `WalletManagerWavelength` (default export): Main class for managing the wallet
2. `WalletAccountWavelength`: Use this for the full-access account
3. `WalletAccountReadOnlyWavelength`: Use this for a read-only view
4. `WAVELENGTH_ACCOUNT_NAMESPACE`, `WAVELENGTH_ACCOUNT_NETWORK_IDS`, `wavelengthAccountDataDir()`, `wavelengthAccountDerivationPath()`: Account derivation helpers

### Checking Balances

```javascript
// Confirmed, self-custodied funds only; see getBalanceBreakdown() for the rest
const balance = await account.getBalance()
console.log('Balance:', balance, 'satoshis')
```

### Depositing Bitcoin (On-Chain)

```javascript
// Stable boarding address: allocated on the first call, reused after
const address = await account.getAddress()

// Allocates a fresh boarding address on every call; cache the result
const deposit = await account.getDepositAddress()
console.log('Send BTC to:', deposit.address)
```

### Sending On-Chain Transactions

```javascript
const result = await account.sendTransaction({
  to: 'tb1q...',      // recipient's on-chain address
  value: 100000,      // amount in satoshis
  note: 'optional note',
  maxFeeSat: 500       // optional: throws if the quoted fee exceeds this
})
console.log('Entry id:', result.hash) // an activity entry id, not a txid
console.log('Fee paid:', result.fee, 'satoshis')

// Fee estimate without sending
const quote = await account.quoteSendTransaction({ to: 'tb1q...', value: 100000 })
console.log('Estimated fee:', quote.fee)

// Sweep the entire spendable balance to one address
await account.sendTransaction({ to: 'tb1q...', sweepAll: true })
```

### Lightning

```javascript
// Create an invoice to receive payment
const invoice = await account.createLightningInvoice({
  amountSat: 5000,
  memo: 'Coffee'
})
console.log('Invoice:', invoice.invoice)

// Quote the fee for paying an invoice
const feeSat = await account.quotePayLightningInvoice({ invoice: 'lnbc...' })
console.log('Estimated fee:', feeSat, 'satoshis')

// Pay an invoice
const payment = await account.payLightningInvoice({
  invoice: 'lnbc...',
  maxFeeSat: 100 // optional cap, checked against the quote before sending
})
```

### Activity History

```javascript
// List activity entries (deposits, sends, Lightning payments, ...)
const { activity } = await account.list({ view: 'activity' })
for (const entry of activity.entries) {
  console.log(entry.kind, entry.status, entry.amountSat, entry.progress?.phase)
}
```

### Read-Only Accounts

```javascript
// Shares the account's daemon connection
const readOnly = await account.toReadOnlyAccount()
const balance = await readOnly.getBalance()
```

### Exiting

Every VTXO exits either through a cooperative leave (queued into the
next round) or a unilateral exit (a forced, on-chain unroll you start
yourself). Try cooperative first; reach for unilateral only when the
operator is unreachable or a cooperative attempt already failed. See
[Unilateral exit & status](https://wavelength.lightning.engineering/guides/unilateral-exit/)
for the full decision writeup.

```javascript
import { FORCE_UNROLL_ACK } from '@lightninglabs/wavelength-core'

// Cooperative leave (the default -- omit forceUnrollAck)
await account.exit({ outpoint: 'txid:0' })

// Unilateral exit requires the exact FORCE_UNROLL_ACK acknowledgement --
// preview funding requirements first with getExitPlan().
const plan = await account.getExitPlan({ outpoints: ['txid:0'] })
if (plan.canStart) {
  await account.exit({ outpoint: 'txid:0', forceUnrollAck: FORCE_UNROLL_ACK })
}

// Track it, then sweep once claimable
const status = await account.exitStatus({ outpoint: 'txid:0', detailed: true })
const preview = await account.sweepWallet({ destinationAddress: 'bc1q...', broadcast: false })
if (preview.canBroadcast) {
  await account.sweepWallet({ destinationAddress: 'bc1q...', broadcast: true })
}
```

### Memory Management

```javascript
// Drops the account's client reference
account.dispose()

// Stops and disposes one account's daemon (needed before opening another on iOS/Android)
await wallet.closeAccount(0)

// Stops every daemon and waits for the transport workers to exit
await wallet.close()
```

## 📚 API Reference

### Table of Contents

| Class | Description | Methods |
|-------|-------------|---------|
| [WalletManagerWavelength](#walletmanagerwavelength) | Main class for managing a Wavelength wallet. Extends `WalletManager` from `@tetherto/wdk-wallet`. | [Constructor](#constructor), [Methods](#methods) |
| [WalletAccountReadOnlyWavelength](#walletaccountreadonlywavelength) | Read-only view over an already-unlocked daemon connection. | [Constructor](#constructor-1), [Methods](#methods-1) |
| [WalletAccountWavelength](#walletaccountwavelength) | Full-access Wavelength wallet account. Implements `IWalletAccount`. Extends `WalletAccountReadOnlyWavelength`. | [Constructor](#constructor-2), [Methods](#methods-2), [Properties](#properties) |

### WalletManagerWavelength

The main class for managing a Wavelength wallet.
Extends `WalletManager` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletManagerWavelength(seedOrSigner, config)
```

**Parameters:**
- `seedOrSigner` (string | Uint8Array): A BIP-39 phrase or already-derived raw BIP-39 seed. Required -- there is no daemon-owned, password-only wallet mode. If the BIP-39 root uses a passphrase, derive the raw seed outside this package and pass those bytes.
- `config` (object): Configuration object (daemon `RuntimeConfig` fields, plus account-open options)
  - `network` (string, required): `'mainnet'`, `'testnet'`, `'testnet4'`, `'signet'`, or `'regtest'`
  - `dataDir` (string, required, nonempty): Base directory WDK appends each account's derived profile under
  - `allowMainnet` (boolean, optional): Must be `true` for `network: 'mainnet'`
  - `walletType` (string, optional): `'lwwallet'` (default) or `'btcwallet'`
  - `walletEsploraUrl` (string, optional): HTTP Esplora endpoint used by `lwwallet`
  - `arkServerAddress` (string, optional): operator/mailbox endpoint (`host:port` gRPC address)
  - `swapServerAddress` (string, optional): Lightning swap endpoint (`host:port` gRPC address)
  - `recoverState` (boolean, optional): Run server-assisted recovery for this external account open
  - `recoveryWindow` (number, optional): Per-key-family look-ahead used during recovery
  - `wasmRuntimeDir` (string, optional): Directory of the WASM runtime assets; used on desktop Bare, ignored on iOS
  - Other `RuntimeConfig` fields pass through to the daemon

Throws if `config.expectedIdentityPubKey` is set (pass it to `getAccount()`), or if `config.password`, `config.mnemonic` or `config.seedPassphrase` is set.

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAccount(index, options?)` | Derives/starts an indexed external-seed account | `Promise<WalletAccountWavelength>` |
| `getAccountByPath(path)` | **Not supported.** Always throws | `Promise<never>` |
| `getFeeRates()` | Returns an estimated fee rate (synthesized via a nominal quote) | `Promise<FeeRates>` |
| `closeAccount(index)` | Stops and disposes one account's daemon | `Promise<void>` |
| `close()` | Wipes the seed, stops every daemon and awaits transport-worker exit | `Promise<void>` |
| `dispose()` | Starts `close()` without waiting | `void` |

##### `getAccount(index, options?)`
Derives and boots one complete daemon identity, memoized per index. Concurrent calls for one index share one boot.

**Parameters:**
- `index` (number, optional): Integer in `0..0x7fffffff` (default: `0`)
- `options.expectedIdentityPubKey` (string, optional): Persisted daemon identity to verify for this account index. Pass it per call; a manager-level value is rejected because one value cannot safely describe multiple indexed identities.
- `options.recoverState` (boolean, optional): Run server-assisted recovery for this account open
- `options.recoveryWindow` (number, optional): Per-key-family look-ahead; ignored unless recovery is enabled

Options default to the manager config's `recoverState` and `recoveryWindow`. Throws if `index` is out of range, if `options.signerName` is set, or after `close()`.

**Returns:** `Promise<WalletAccountWavelength>` — The wallet account

**Example:**
```javascript
const account = await wallet.getAccount(0, {
  expectedIdentityPubKey: persistedAccount0Identity
})
```

Every account is a full daemon identity and database, not an on-chain
address subaccount. Repeating an active index with conflicting options throws.

##### `getAccountByPath(path)`
**Not supported on Wavelength.** Select accounts by index with
`getAccount(index)`; arbitrary caller-provided paths are rejected so the
versioned WDK scheme stays interoperable.

##### `getFeeRates()`
Wavelength has no fee-rate schedule. This quotes a nominal 10,000 sat send to a fixed, unspendable address (BIP-341's NUMS point), so it allocates no address of the wallet's own. It boots account 0 if that isn't open. For a real payment, use `account.quoteSendTransaction()` against the actual destination.

**Returns:** `Promise<FeeRates>` — `{ normal: bigint, fast: bigint }`, both the same value

Throws if the daemon can't determine the fee, or if the manager is closed.

##### `closeAccount(index)`
Waits for an in-flight boot, then stops the daemon and disposes the account. Call it before opening another account on iOS/Android, where only one daemon runs per process.

**Returns:** `Promise<void>`

##### `close()`
Wipes the seed, stops every daemon, and disposes every account. Prefer it over `dispose()` in CLI/server hosts so database shutdown finishes before the process exits. Repeat calls return the same promise.

**Returns:** `Promise<void>`

##### `dispose()`
Calls `close()` without waiting and ignores its errors.

**Returns:** `void`

**Returns:** `void`

---

### WalletAccountReadOnlyWavelength

A restricted, read-only view over an already-unlocked Wavelength daemon connection. Wavelength has no keyless query mode, so this always wraps the *same* client connection an unlocked `WalletAccountWavelength` uses.

#### Constructor

```javascript
new WalletAccountReadOnlyWavelength(client, config)
```

**Parameters:**
- `client` (WavelengthClient): The already-started, unlocked Wavelength client this view shares
- `config` (object, optional): Configuration object

**Note:** Instances are normally obtained via `account.toReadOnlyAccount()`, not constructed directly.

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAddress()` | Returns the account's boarding address, allocated on first call and reused after | `Promise<string>` |
| `getBalance()` | Returns the confirmed, self-custodied balance | `Promise<bigint>` |
| `getBalanceBreakdown()` | Returns every balance component, including server credit | `Promise<BalanceBreakdown>` |
| `getTokenBalance(tokenAddress)` | **Not implemented.** No tokens on Wavelength | `Promise<never>` |
| `verify(message, signature)` | Verifies a message's ECDSA signature against the account's identity public key | `Promise<boolean>` |
| `quoteSendTransaction(tx)` | Quotes the fee for an on-chain send | `Promise<{fee: bigint}>` |
| `quoteTransfer(options)` | **Not implemented.** No tokens on Wavelength | `Promise<never>` |
| `getTransactionReceipt(hash)` | Gets an activity entry by id | `Promise<Entry \| null>` |
| `getTransaction(hash)` | Gets a normalized WDK receipt by activity entry id | `Promise<TransactionReceipt>` |
| `watchActivity(listener, options?)` | Streams activity changes as they happen | `Promise<() => void>` |
| `getInfo()` | Returns the daemon's current info (network, block height, wallet state, identity pubkey) | `Promise<WalletInfo>` |
| `status()` | Returns the daemon's current sync/connectivity status | `Promise<WalletStatus>` |
| `list(options?)` | Lists wallet activity, VTXOs, or on-chain outputs | `Promise<ListResult>` |
| `dispose()` | Drops the view's client reference and stops its activity watch | `void` |
| `getExitPlan(req)` | Previews unilateral-exit funding requirements for a set of VTXO outpoints | `Promise<GetExitPlanResult>` |
| `exitStatus(req)` | Queries the status of an in-progress exit for one outpoint | `Promise<ExitStatusResult>` |
| `exitSummary(req?)` | Summarizes every in-progress exit across the wallet | `Promise<ExitSummaryResult>` |

##### `getAddress()`
The first call allocates a boarding address; later calls return the same one. Use `getDepositAddress()` on the full-access account for a fresh one.

**Returns:** `Promise<string>` — The account's boarding address

**Example:**
```javascript
const address = await account.getAddress()
console.log('Receive address:', address)

// Later calls return the same address.
const again = await account.getAddress()
console.log(again === address) // true
```

##### `getBalance()`
Server credit, unconfirmed incoming funds and funds committed to unfinished outgoing payments are **not** included; use `getBalanceBreakdown()` for those.

**Returns:** `Promise<bigint>` — Balance in satoshis

##### `getBalanceBreakdown()`
**Returns:** `Promise<{ confirmed, pendingIn, pendingOut, creditAvailable, creditReserved }>` — each a `bigint` in satoshis

##### `verify(message, signature)`
Checks the signature over the SHA-256 of the UTF-8 message against the daemon's identity public key (fetched with `getInfo()`).

**Parameters:**
- `message` (string): The original message
- `signature` (string): The signature to verify (hex-encoded, compact `(r, s)` or DER)

**Returns:** `Promise<boolean>` — `true` if the signature is valid

**Example:**
```javascript
const isValid = await account.verify('Hello, Wavelength!', signatureHex)
console.log('Signature valid:', isValid)
```

##### `quoteSendTransaction(tx)`
**Parameters:**
- `tx` (object): `{ to: string, value: number | bigint }`

**Returns:** `Promise<{fee: bigint}>` — Estimated fee for the send. Throws if the daemon can't determine the fee.

##### `getTransactionReceipt(hash)`
The daemon has no lookup by id, so this pages through activity: the first page at the daemon default, then 500 per page, up to 10 pages (about 4,600 entries).

**Parameters:**
- `hash` (string): The activity entry's id

**Returns:** `Promise<Entry | null>` — The matching entry, or `null` if it isn't within the scanned entries

##### `getTransaction(hash)`
Same lookup as `getTransactionReceipt()`, normalized to WDK's receipt: `{ hash, finality, success, block, fee }`. `hash` is the entry id. `failed` entries map to finality `'dropped'`.

**Returns:** `Promise<TransactionReceipt>` — Throws `NoSuchElementError` if no entry is found

##### `watchActivity(listener, options?)`
Calls `listener` with an `'activity'` event for each changed entry, and an `'activityStream'` event if the stream ends or fails on its own. One watch per account; starting another replaces it.

**Parameters:**
- `listener` (function): Receives each event
- `options` (object, optional): `ActivityStreamOptions` for the stream

**Returns:** `Promise<() => void>` — Stops the watch

##### `getInfo()`
**Returns:** `Promise<WalletInfo>` — Includes `network`, `walletState`, `identityPubKey`, block height, and more

##### `status()`
**Returns:** `Promise<WalletStatus>` — The daemon's sync/connectivity status

##### `list(options?)`
**Parameters:**
- `options` (object, optional): `ListRequest`
  - `view` (string): e.g. `'activity'`
  - `kinds` (string[], optional): Filter by entry kind (e.g. `['deposit']`, `['receive']`, `['send']`)

**Returns:** `Promise<ListResult>` — For `view: 'activity'`, `{ activity: { entries: Entry[], hasMore, nextCursor } }`

**Example:**
```javascript
const { activity } = await readOnly.list({ view: 'activity' })
console.log(activity.entries)
```

##### `getExitPlan(req)`
Previews funding requirements and feasibility before `exit()`'s unilateral branch. See [Exiting](#exiting) above.

**Parameters:**
- `req` (object): `{ outpoints: string[], confTarget?: number }`

**Returns:** `Promise<GetExitPlanResult>` — `{ canStart: boolean, totalRecommendedFundingSat: number, plans: ExitPlanEntry[] }`. If `canStart` is `false`, check each entry's `infeasibilityReason`.

##### `exitStatus(req)`
**Parameters:**
- `req` (object): `{ outpoint: string, detailed?: boolean }` — `detailed: true` costs a live round-trip (recovery-tree progress, CSV maturity, fee breakdown); the default is a cheap, phase-only status.

**Returns:** `Promise<ExitStatusResult>` — `{ found: boolean, status: string, ... }`

##### `exitSummary(req?)`
**Parameters:**
- `req` (object, optional): Unused; the summary is wallet-wide

**Returns:** `Promise<ExitSummaryResult>` — `{ totalExits: number, exits: ExitSummaryEntry[] }`

##### `dispose()`
Stops the activity watch and drops the client reference. The manager owns daemon shutdown.

**Returns:** `void`

---

### WalletAccountWavelength

Represents an individual Wavelength wallet account with full write access. Implements `IWalletAccount` from `@tetherto/wdk-wallet`. Extends `WalletAccountReadOnlyWavelength`, inheriting all read-only methods.

**Note**: `WalletAccountWavelength` instances are created internally by `WalletManagerWavelength.getAccount()` and are not intended to be constructed directly.

#### Methods

All methods from [WalletAccountReadOnlyWavelength](#walletaccountreadonlywavelength) are inherited. The following additional methods are available:

| Method | Description | Returns |
|--------|-------------|---------|
| `sign(message)` | **Not available.** Always throws | `Promise<never>` |
| `signTransaction(tx)` | **Not supported.** No sign-without-broadcast primitive | `Promise<never>` |
| `sendTransaction(tx)` | Sends an on-chain transaction | `Promise<TransactionResult>` |
| `transfer(options)` | **Not implemented.** No tokens on Wavelength | `Promise<never>` |
| `getDepositAddress(options?)` | Allocates a fresh on-chain boarding address on every call | `Promise<DepositResult>` |
| `createLightningInvoice(options)` | Creates a Lightning invoice | `Promise<ReceiveResult>` |
| `payLightningInvoice(options)` | Pays a Lightning invoice | `Promise<SendResult>` |
| `quotePayLightningInvoice(options)` | Quotes the fee for paying a Lightning invoice | `Promise<bigint>` |
| `getLightningReceiveRequest(invoiceId)` | Gets a Lightning receive entry by id | `Promise<Entry \| null>` |
| `getLightningSendRequest(requestId)` | Gets a Lightning send entry by id | `Promise<Entry \| null>` |
| `exit(req)` | Exits one VTXO via a cooperative leave or an acknowledged unilateral unroll | `Promise<ExitResult>` |
| `sweepWallet(req)` | Previews or broadcasts a sweep to an on-chain address | `Promise<SweepWalletResult>` |
| `toReadOnlyAccount()` | Returns a read-only view sharing this account's client connection | `Promise<WalletAccountReadOnlyWavelength>` |
| `dispose()` | Drops the account's client reference and stops its activity watch | `void` |

##### `sign(message)`
**Not available.** Wavelength has no `MobileSignMessage` export. [`verify()`](#verifymessage-signature) still works.

##### `signTransaction(tx)`
**Not supported.** There is no sign-without-broadcast primitive. Use `sendTransaction(tx)`.

##### `sendTransaction(tx)`
Quotes with `prepareSend()`, checks `maxFeeSat`, then dispatches with `sendPrepared()`.

**Parameters:**
- `tx` (object):
  - `to` (string): Recipient's on-chain address
  - `value` (number | bigint): Amount in satoshis
  - `note` (string, optional): Note recorded with the activity
  - `maxFeeSat` (number, optional): Cap on the fee, checked against the quote. Throws if the quote exceeds it, or if the daemon can't determine the fee.
  - `sweepAll` (boolean, optional): When `true`, sweeps the entire spendable balance to `to` (`value` is ignored). The amount sent is not in the result.

**Returns:** `Promise<TransactionResult>` — `{ hash: string, fee: bigint }`. `hash` is the activity entry id, not an on-chain txid. Read `progress.txid` later from `getTransactionReceipt(hash)`.

##### `transfer(options)`
**Not implemented.** Wavelength has no tokens.

##### `getDepositAddress(options?)`
Allocates a **fresh** boarding address every call. Use `getAddress()` for a stable one.

**Parameters:**
- `options` (object, optional): `{ amountSatHint?: number }`

**Returns:** `Promise<DepositResult>` — `{ address: string, entry: Entry }`

##### `createLightningInvoice(options)`
**Parameters:**
- `options` (object):
  - `amountSat` (number): Amount to request, in satoshis
  - `memo` (string, optional): Memo attached to the invoice

**Returns:** `Promise<ReceiveResult>` — Includes `invoice` (BOLT-11 string) and its initial activity entry

##### `payLightningInvoice(options)`
Quotes, checks `maxFeeSat`, then pays, as in `sendTransaction`.

**Parameters:**
- `options` (object):
  - `invoice` (string): The Lightning invoice to pay
  - `note` (string, optional): Note recorded with the activity
  - `maxFeeSat` (number, optional): Cap on the fee, checked against the quote. Throws if the quote exceeds it, or if the daemon can't determine the fee.

**Returns:** `Promise<SendResult>` — The payment's result

##### `quotePayLightningInvoice(options)`
**Parameters:**
- `options` (object): `{ invoice: string }`

**Returns:** `Promise<bigint>` — The expected fee, in satoshis. Throws if the daemon can't determine the fee.

##### `getLightningReceiveRequest(invoiceId)` / `getLightningSendRequest(requestId)`
Pages through `receive` or `send` activity with the same limits as `getTransactionReceipt()`.

**Returns:** `Promise<Entry | null>` — The matching activity entry, or `null` if not found

##### `exit(req)`
Pass `destination` (optional) for a cooperative leave, or `forceUnrollAck` (the `FORCE_UNROLL_ACK` constant from `@lightninglabs/wavelength-core`) for a unilateral unroll; the two are mutually exclusive. Preview funding first with [`getExitPlan(req)`](#getexitplanreq). See [Exiting](#exiting) above.

**Parameters:**
- `req` (object): `{ outpoint: string, destination?: string }` (cooperative) or `{ outpoint: string, forceUnrollAck: typeof FORCE_UNROLL_ACK }` (unilateral)

**Returns:** `Promise<ExitResult>` — `{ path: 'cooperative' | 'unilateral' | 'unilateral_fallback', ... }`; check `path` to discriminate which fields are populated

##### `sweepWallet(req)`
Previews (`broadcast: false`, the default) or broadcasts a sweep to `destinationAddress`. Broadcasting moves funds, so show the preview's `estimatedFeeSat`/`netAmountSat` first.

**Parameters:**
- `req` (object): `{ destinationAddress: string, broadcast?: boolean, feeRateSatPerVByte?: number, confTarget?: number }`

**Returns:** `Promise<SweepWalletResult>` — `{ canBroadcast: boolean, estimatedFeeSat: number, netAmountSat: number, ... }`. If `canBroadcast` is `false`, check `failureReason` instead of attempting the broadcast call.

##### `toReadOnlyAccount()`
**Returns:** `Promise<WalletAccountReadOnlyWavelength>` — The same view instance on every call

##### `dispose()`
Stops the activity watch and drops the client reference. The manager's `close()` or `closeAccount()` owns daemon shutdown.

**Returns:** `void`

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `index` | `number` | The daemon/account index |
| `path` | `string` | The versioned WDK BIP-85 derivation path |
| `imported` | `boolean` | Whether this open created a new local profile, rather than reopening an existing one |
| `keyPair` | `KeyPair` | `{ publicKey: Uint8Array, privateKey: null }` — Wavelength never exposes raw key material; `privateKey` is always `null` |

## 🌐 Supported Networks

The following networks are supported (via the `network` config field):

- **`signet`** — Public Signet test deployment (recommended for development)
- **`testnet`** / **`testnet4`** — Bitcoin testnet
- **`regtest`** — Local regression test network
- **`mainnet`** — Production network (requires `allowMainnet: true`)

### Network Configuration

```javascript
import WalletManagerWavelength from '@lightninglabs/wdk-wallet-wavelength'

const wallet = new WalletManagerWavelength(seedPhrase, {
  network: 'signet',
  dataDir: '/path/to/data',
  walletType: 'lwwallet',
  walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
  arkServerAddress: 'signet.wavelength.lightning.finance:443',
  swapServerAddress: 'swap.signet.wavelength.lightning.finance:443'
})
```

**Important Notes:**
- Account profiles automatically separate the root, network, and account index beneath the configured base `dataDir`
- iOS and Android run one daemon per process; call `closeAccount()` before opening another index. Desktop Bare uses an isolated worker per account, so indexed accounts can coexist.

## ⚠️ Known Limitations

- **No message signing** (`sign`): no `MobileSignMessage` export exists. `verify()` still works, since it only needs the public key.
- **No tokens**: `getTokenBalance`, `quoteTransfer` and `transfer` throw.

## 🛠️ Development

### Building

```bash
# Install dependencies
npm install

# Build TypeScript definitions
npm run build:types

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Testing

```bash
# Run unit tests (mocked client, no daemon required)
npm test

# Run integration tests (requires a DOM-capable environment; self-skip under plain Node/Jest)
npm run test:integration

# Run everything
npm run test:all

# Run tests with coverage
npm run test:coverage
```
