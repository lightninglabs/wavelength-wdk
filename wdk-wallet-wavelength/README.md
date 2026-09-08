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

Delegates entirely to `wavelength-bindings`, which selects the right transport per runtime automatically. See [`wavelength-bindings/README.md`](../wavelength-bindings/README.md#platform-support) for details.

- macOS
- Linux
- Windows
- iOS
- Android

## ⬇️ Installation

```bash
// PACKAGE HERE
```

## 🚀 Quick Start

### Importing from `wdk-wallet-wavelength`

1. `WalletManagerWavelength` (default export): Main class for managing the wallet
2. `WalletAccountWavelength`: Use this for the full-access account
3. `WalletAccountReadOnlyWavelength`: Use this for a read-only view

### Checking Balances

```javascript
const balance = await account.getBalance()
console.log('Balance:', balance, 'satoshis')
```

### Depositing Bitcoin (On-Chain)

```javascript
// Allocates a FRESH boarding address every call — do not call this repeatedly
// expecting a stable address; cache the result instead
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
console.log('Entry id:', result.hash)
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
  maxFeeSat: 100 // optional cap, enforced client-side against the quote
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
// Derived from an unlocked account, shares the same daemon connection
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
// Disposes the account (drops its client reference)
account.dispose()

// Stops every daemon, checkpoints its databases, and terminates its worker.
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
  - `dataDir` (string, required): Base directory WDK appends each account's derived profile under
  - `walletType` (string, optional): `'lwwallet'` (default) or `'btcwallet'`; desktop WASM supports only `lwwallet`, while `btcwallet` requires the paired native artifacts
  - `walletEsploraUrl` (string, optional): HTTP Esplora endpoint used by `lwwallet`
  - `arkServerAddress` (string, optional): operator/mailbox endpoint (`host:port` gRPC address)
  - `swapServerAddress` (string, optional): Lightning swap endpoint (`host:port` gRPC address)
  - `recoverState` (boolean, optional): Run server-assisted recovery for this external account open
  - `recoveryWindow` (number, optional): Per-key-family look-ahead used during recovery

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAccount(index, options?)` | Derives/starts an indexed external-seed account | `Promise<WalletAccountWavelength>` |
| `getAccountByPath(path)` | **Not supported.** Always throws | `Promise<never>` |
| `getFeeRates()` | Returns an estimated fee rate (synthesized via a nominal self-quote) | `Promise<FeeRates>` |
| `close()` | Stops every daemon and awaits transport-worker exit | `Promise<void>` |
| `dispose()` | Stops the daemon and clears secret material from memory | `void` |

##### `getAccount(index, options?)`
Derives and boots one complete daemon identity, memoized per index.

**Parameters:**
- `index` (number, optional): Integer in `0..0x7fffffff` (default: `0`)
- `options.expectedIdentityPubKey` (string, optional): Persisted daemon identity to verify for this account index. Pass it per call; a manager-level value is rejected because one value cannot safely describe multiple indexed identities.
- `options.recoverState` (boolean, optional): Run server-assisted recovery for this account open
- `options.recoveryWindow` (number, optional): Per-key-family look-ahead used when recovery is enabled

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
Wavelength has no fee-rate schedule — this synthesizes an estimate by quoting a nominal send to the wallet's own boarding address. For a real payment, use `account.quoteSendTransaction()` against the actual destination instead.

**Returns:** `Promise<FeeRates>` — `{ normal: bigint, fast: bigint }` (both the same value — an estimate, not a rate table)

##### `dispose()`
Begins shutdown without waiting. Prefer `await wallet.close()` in CLI/server
hosts so SQLite checkpoints and worker termination finish before process exit.

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
| `getAddress()` | Allocates and returns a fresh boarding address | `Promise<string>` |
| `getBalance()` | Returns the bitcoin balance (confirmed + pending-out + available credit) | `Promise<bigint>` |
| `getTokenBalance(tokenAddress)` | **Not supported.** No token concept on Wavelength | `Promise<never>` |
| `verify(message, signature)` | Verifies a message's ECDSA signature against the account's identity public key | `Promise<boolean>` |
| `quoteSendTransaction(tx)` | Quotes the fee for an on-chain send | `Promise<{fee: bigint}>` |
| `quoteTransfer(options)` | **Not supported.** No token concept on Wavelength | `Promise<never>` |
| `getTransactionReceipt(hash)` | Gets an activity entry by id | `Promise<Entry \| null>` |
| `getInfo()` | Returns the daemon's current info (network, block height, wallet state, identity pubkey) | `Promise<WalletInfo>` |
| `status()` | Returns the daemon's current sync/connectivity status | `Promise<WalletStatus>` |
| `list(options)` | Lists wallet activity, VTXOs, or on-chain outputs | `Promise<ListResult>` |
| `getExitPlan(req)` | Previews unilateral-exit funding requirements for a set of VTXO outpoints | `Promise<GetExitPlanResult>` |
| `exitStatus(req)` | Queries the status of an in-progress exit for one outpoint | `Promise<ExitStatusResult>` |
| `exitSummary(req?)` | Summarizes every in-progress exit across the wallet | `Promise<ExitSummaryResult>` |

##### `getAddress()`
Returns a fresh on-chain boarding address, rotating on every call (no stable receive address exists). Equivalent to `getDepositAddress()` on the full-access account.

**Returns:** `Promise<string>` — A fresh boarding address

**Example:**
```javascript
const address = await account.getAddress()
console.log('Receive address:', address)

// Calling it again allocates another boarding address.
const next = await account.getAddress()
console.log(next === address) // false
```

##### `getBalance()`
Returns confirmed funds, plus anything currently committed to an outgoing send that hasn't finalized yet, plus unused credit-line capacity available to spend right now. Unconfirmed *incoming* funds and credit already reserved against an in-flight payment are **not** included.

**Returns:** `Promise<bigint>` — Balance in satoshis

##### `verify(message, signature)`
Verifies a message's signature against the account's identity public key. Runs entirely client-side via ECDSA/secp256k1 — no daemon RPC beyond the already-cached `identityPubKey` from `getInfo()`.

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

**Returns:** `Promise<{fee: bigint}>` — Estimated fee for the send

##### `getTransactionReceipt(hash)`
Interim implementation: lists recent activity and filters client-side (the daemon doesn't export a direct entry-by-id lookup yet).

**Parameters:**
- `hash` (string): The activity entry's id

**Returns:** `Promise<Entry | null>` — The matching entry, or `null` if not found in the listed page

##### `getInfo()`
**Returns:** `Promise<WalletInfo>` — Includes `network`, `walletState`, `walletReady`, `identityPubKey`, block height, and more

##### `status()`
**Returns:** `Promise<WalletStatus>` — The daemon's sync/connectivity status

##### `list(options)`
**Parameters:**
- `options` (object, optional):
  - `view` (string): e.g. `'activity'`
  - `kinds` (string[], optional): Filter by entry kind (e.g. `['deposit']`, `['receive']`, `['send']`)

**Returns:** `Promise<ListResult>` — `{ activity: { entries: Entry[] } }`

**Example:**
```javascript
const { activity } = await readOnly.list({ view: 'activity' })
console.log(activity.entries)
```

##### `getExitPlan(req)`
Previews unilateral-exit readiness for a set of VTXO outpoints (funding requirements, feasibility, recommended funding) before committing to `exit()`'s unilateral branch. See [Exiting](#exiting) above.

**Parameters:**
- `req` (object): `{ outpoints: string[], confTarget?: number }`

**Returns:** `Promise<GetExitPlanResult>` — `{ canStart: boolean, totalRecommendedFundingSat: number, plans: ExitPlanEntry[] }`. If `canStart` is `false`, check each entry's `infeasibilityReason`.

##### `exitStatus(req)`
**Parameters:**
- `req` (object): `{ outpoint: string, detailed?: boolean }` — `detailed: true` costs a live round-trip (recovery-tree progress, CSV maturity, fee breakdown); the default is a cheap, phase-only status.

**Returns:** `Promise<ExitStatusResult>` — `{ found: boolean, status: string, ... }`

##### `exitSummary(req?)`
**Parameters:**
- `req` (object, optional): No arguments; the daemon reports the wallet-wide portfolio.

**Returns:** `Promise<ExitSummaryResult>` — `{ totalExits: number, exits: ExitSummaryEntry[] }`

---

### WalletAccountWavelength

Represents an individual Wavelength wallet account with full write access. Implements `IWalletAccount` from `@tetherto/wdk-wallet`. Extends `WalletAccountReadOnlyWavelength`, inheriting all read-only methods.

**Note**: `WalletAccountWavelength` instances are created internally by `WalletManagerWavelength.getAccount()` and are not intended to be constructed directly.

#### Methods

All methods from [WalletAccountReadOnlyWavelength](#walletaccountreadonlywavelength) are inherited. The following additional methods are available:

| Method | Description | Returns |
|--------|-------------|---------|
| `sign(message)` | **Not available yet.** Always throws | `Promise<never>` |
| `signTransaction(tx)` | **Not supported.** No sign-without-broadcast primitive | `Promise<never>` |
| `sendTransaction(tx)` | Sends an on-chain transaction | `Promise<TransactionResult>` |
| `transfer(options)` | **Not supported.** No token concept on Wavelength | `Promise<never>` |
| `getDepositAddress(options?)` | Allocates a fresh on-chain boarding address | `Promise<DepositResult>` |
| `createLightningInvoice(options)` | Creates a Lightning invoice | `Promise<ReceiveResult>` |
| `payLightningInvoice(options)` | Pays a Lightning invoice | `Promise<SendResult>` |
| `quotePayLightningInvoice(options)` | Quotes the fee for paying a Lightning invoice | `Promise<bigint>` |
| `getLightningReceiveRequest(invoiceId)` | Gets a Lightning receive request (invoice) by id | `Promise<Entry \| null>` |
| `getLightningSendRequest(requestId)` | Gets a Lightning send request by id | `Promise<Entry \| null>` |
| `exit(req)` | Exits one VTXO via a cooperative leave or an acknowledged unilateral unroll | `Promise<ExitResult>` |
| `sweepWallet(req)` | Previews or broadcasts a sweep of the backing wallet to an on-chain address | `Promise<SweepWalletResult>` |
| `toReadOnlyAccount()` | Creates a read-only view sharing this account's client connection | `Promise<WalletAccountReadOnlyWavelength>` |
| `dispose()` | Disposes the account (drops its client reference) | `void` |

##### `sign(message)`
**Not available yet.** Wavelength has no `MobileSignMessage` export. See [`verify()`](#verifymessage-signature), which works today.

##### `signTransaction(tx)`
**Not supported.** There is no sign-without-broadcast primitive on Wavelength — the send flow is quote-then-execute (`prepareSend`/`sendPrepared`). Use `sendTransaction(tx)` instead.

##### `sendTransaction(tx)`
Implemented as an explicit `prepareSend()` + `sendPrepared()` pair (rather than a one-shot `send()`) so `maxFeeSat` can be enforced, and `feeKnown`/`warning` surfaced, before the payment is actually dispatched.

**Parameters:**
- `tx` (object):
  - `to` (string): Recipient's on-chain address
  - `value` (number | bigint): Amount in satoshis
  - `note` (string, optional): Note recorded with the activity
  - `maxFeeSat` (number, optional): Cap on the fee, enforced client-side against the quote
  - `sweepAll` (boolean, optional): When `true`, sweeps the entire spendable balance to `to` (`value` is ignored)

**Returns:** `Promise<TransactionResult>` — `{ hash: string, fee: bigint }`

##### `transfer(options)`
**Not supported.** Wavelength has no token concept.

##### `getDepositAddress(options?)`
Allocates a **fresh** on-chain boarding address every call. Cache the result if you need a stable address to display.

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
Implemented as an explicit `prepareSend()` + `sendPrepared()` pair for the same `maxFeeSat`-enforcement reason as `sendTransaction`.

**Parameters:**
- `options` (object):
  - `invoice` (string): The Lightning invoice to pay
  - `note` (string, optional): Note recorded with the activity
  - `maxFeeSat` (number, optional): Cap on the fee, enforced client-side against the quote

**Returns:** `Promise<SendResult>` — The payment's result

##### `quotePayLightningInvoice(options)`
**Parameters:**
- `options` (object): `{ invoice: string }`

**Returns:** `Promise<bigint>` — The expected fee, in satoshis

##### `getLightningReceiveRequest(invoiceId)` / `getLightningSendRequest(requestId)`
Interim implementation: lists recent `receive`/`send` activity and filters client-side (the daemon doesn't export a direct id-lookup yet).

**Returns:** `Promise<Entry | null>` — The matching activity entry, or `null` if not found in the listed page

##### `exit(req)`
Exits one VTXO through a cooperative leave (queued into the next round) or an acknowledged unilateral unroll. Pass `destination` for cooperative, or `forceUnrollAck` (the `FORCE_UNROLL_ACK` constant) for unilateral. Preview funding requirements first with [`getExitPlan(req)`](#getexitplanreq). See [Exiting](#exiting) above.

**Parameters:**
- `req` (object): `{ outpoint: string, destination?: string }` (cooperative) or `{ outpoint: string, forceUnrollAck: typeof FORCE_UNROLL_ACK }` (unilateral)

**Returns:** `Promise<ExitResult>` — `{ path: 'cooperative' | 'unilateral' | 'unilateral_fallback', ... }`; check `path` to discriminate which fields are populated

##### `sweepWallet(req)`
Previews (`broadcast: false`, the default) or broadcasts a sweep of claimable exit outputs to `destinationAddress`. Show the preview's `estimatedFeeSat`/`netAmountSat` before broadcasting.

**Parameters:**
- `req` (object): `{ destinationAddress: string, broadcast?: boolean, feeRateSatPerVByte?: number, confTarget?: number }`

**Returns:** `Promise<SweepWalletResult>` — `{ canBroadcast: boolean, estimatedFeeSat: number, netAmountSat: number, ... }`. If `canBroadcast` is `false`, check `failureReason` instead of attempting the broadcast call.

##### `toReadOnlyAccount()`
**Returns:** `Promise<WalletAccountReadOnlyWavelength>` — A read-only view sharing this account's client connection

##### `dispose()`
Drops the account's client reference. The daemon connection is owned by the
manager; `close()` stops and disposes every account client.

**Returns:** `void`

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `index` | `number` | The daemon/account index |
| `path` | `string` | The versioned WDK BIP-85 derivation path |
| `imported` | `boolean` | Whether this open created a new local profile, rather than reopening an existing one |
| `keyPair` | `KeyPair` | `{ publicKey: Uint8Array, privateKey: null }` — Wavelength never exposes raw key material; `privateKey` is always `null` |

## 🌐 Supported Networks

This package works with the Wavelength daemon via `wavelength-bindings`. The following networks are supported (via the `network` config field):

- **`signet`** — Public Signet test deployment (recommended for development)
- **`testnet`** / **`testnet4`** — Bitcoin testnet
- **`regtest`** — Local regression test network
- **`mainnet`** — Production network (requires `allowMainnet: true` in daemon config)

### Network Configuration

```javascript
import WalletManagerWavelength from 'wdk-wallet-wavelength'

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
- There is no default public endpoint preset for `mainnet` or `regtest` — build the `RuntimeConfig` by hand for those
- Native mobile bindings expose a process-wide daemon singleton. Desktop Bare uses an isolated worker/runtime per account client so indexed accounts can coexist.

## ⚠️ Known Limitations

- **No message signing** (`sign`) — no `MobileSignMessage` export exists yet. `verify()` still works today, since it only needs the public key.

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
