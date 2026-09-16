'use strict'

import WalletManager, { UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

import createWavelengthTransport from 'wavelength-bindings'

import {
  deriveWavelengthAccount,
  wavelengthAccountDataDir,
  wavelengthAccountDerivationPath
} from './external-seed-account.js'
import WalletAccountWavelength from './wallet-account-wavelength.js'

/** @typedef {import('@lightninglabs/wavelength-core').RuntimeConfig} RuntimeConfig */
/** @typedef {import('@lightninglabs/wavelength-core').WavelengthClient} WavelengthClient */

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */

/**
 * @typedef {Object} WavelengthWalletOptions
 * @property {boolean} [recoverState] - Run server-assisted state recovery for this account open. Defaults to false.
 * @property {number} [recoveryWindow] - Per-key-family recovery look-ahead. Only meaningful when `recoverState` is true.
 * @property {string} [wasmRuntimeDir] - Directory containing the Wavewalletdk WASM runtime assets (`wavewalletdk.wasm`, `wasm_exec.js`, `sqlite-bridge.js`, ...). Only used on desktop/server Bare platforms (`darwin`/`linux`/`win32`); ignored on iOS.
 */

/** @typedef {RuntimeConfig & WavelengthWalletOptions} WavelengthWalletConfig */

/**
 * @typedef {Object} ExternalSeedAccountOptions
 * @property {string} [expectedIdentityPubKey] - Optional persisted daemon identity to verify for this account index; pass it to getAccount(), not the manager config.
 * @property {boolean} [recoverState] - Run state recovery for this account open.
 * @property {number} [recoveryWindow] - Per-key-family recovery look-ahead.
 * @property {string} [signerName] - Unsupported base-WDK signer selector.
 */

/**
 * @typedef {Object} ExternalSeedLifecycle
 * @property {(config: RuntimeConfig, req: {seedEntropy: Uint8Array, expectedIdentityPubKey?: string, recoverState?: boolean, recoveryWindow?: number}) => Promise<{identityPubKey: string, imported: boolean}>} startExternalSeedWallet
 */

/**
 * Structural external-seed capability used until the low-level lifecycle is
 * available in the next published wavelength-core declarations.
 *
 * @typedef {WavelengthClient & ExternalSeedLifecycle} ExternalSeedWavelengthClient
 */

/**
 * A harmless nominal amount to quote a fee against in getFeeRates() -- see
 * that method for why an arbitrary amount/destination is needed at all.
 */
const FEE_RATE_QUOTE_AMOUNT_SAT = 10_000

function validateExternalSeedAccountOptions (options) {
  if (options.expectedIdentityPubKey !== undefined &&
      (typeof options.expectedIdentityPubKey !== 'string' || options.expectedIdentityPubKey === '')) {
    throw new ValueError('expectedIdentityPubKey must be a nonempty string')
  }
  if (options.recoverState !== undefined && typeof options.recoverState !== 'boolean') {
    throw new ValueError('recoverState must be a boolean')
  }
  if (options.recoveryWindow !== undefined &&
      (!Number.isSafeInteger(options.recoveryWindow) || options.recoveryWindow < 0 || options.recoveryWindow > 0xffffffff)) {
    throw new ValueError('recoveryWindow must be an integer that fits in uint32')
  }
}

function sameExternalSeedAccountOptions (a, b) {
  return a.expectedIdentityPubKey === b.expectedIdentityPubKey &&
    a.recoverState === b.recoverState &&
    a.recoveryWindow === b.recoveryWindow
}

/**
 * Manages a Wavelength (self-custodial Lightning/Ark) wallet.
 *
 * Every account is derived from a BIP-39 phrase or raw seed: each account
 * index selects a complete Wavelength daemon identity and isolated profile.
 * WDK derives 16 bytes of BIP-85 entropy and owns the versioned
 * network/root/index directory layout; Wavelength receives only that final
 * directory and already-derived entropy.
 */
export default class WalletManagerWavelength extends WalletManager {
  /**
   * Creates a new wallet manager for Wavelength.
   *
   * Owns a copy of the mutable seed input (rather than the caller's own
   * reference) so `close()` can wipe it without mutating memory that still
   * belongs to the caller.
   *
   * @param {string | Uint8Array} seedOrSigner - A BIP-39 phrase or raw seed. Every account is derived from it.
   * @param {WavelengthWalletConfig} config - Runtime and wallet configuration. Requires explicit `network` and base `dataDir`.
   */
  constructor (seedOrSigner, config = {}) {
    const seedSupplied = typeof seedOrSigner === 'string' || seedOrSigner instanceof Uint8Array
    if (!seedSupplied) {
      throw new ValueError('seedOrSigner is required: pass a BIP-39 phrase or raw seed. Wavelength has no daemon-owned, password-only wallet mode.')
    }

    const configExpectedIdentity = /** @type {{expectedIdentityPubKey?: unknown}} */ (
      config
    ).expectedIdentityPubKey
    if (configExpectedIdentity !== undefined) {
      throw new ValueError('expectedIdentityPubKey is account-specific; pass it to getAccount(index, options), not the manager config.')
    }

    const legacyOption = ['password', 'mnemonic', 'seedPassphrase'].find((key) => config[key] !== undefined)
    if (legacyOption !== undefined) {
      throw new ValueError(`config.${legacyOption} is not supported: Wavelength's daemon-owned, password-only wallet mode has been removed. Every account is derived from the seed passed to this constructor.`)
    }

    const ownedSeedOrSigner = seedOrSigner instanceof Uint8Array
      ? Uint8Array.from(seedOrSigner)
      : seedOrSigner
    const ownedConfig = { ...config }

    super(/** @type {any} */ (ownedSeedOrSigner), /** @type {any} */ (ownedConfig))

    if (typeof ownedConfig.dataDir !== 'string' || ownedConfig.dataDir.trim() === '') {
      throw new ValueError('config.dataDir is required as the external-seed account profile base.')
    }
    if (typeof ownedConfig.network !== 'string') {
      throw new ValueError('config.network is required for external-seed account derivation.')
    }

    /**
     * Same object as the base class's `this._config`, typed as the wider
     * Wavelength-specific shape instead of the base's narrower `WalletConfig`.
     *
     * @private
     * @type {WavelengthWalletConfig}
     */
    this._wavelengthConfig = ownedConfig

    /** @private @type {Map<number, Promise<WalletAccountWavelength>>} */
    this._accountPromises = new Map()

    /** @private @type {Map<number, WavelengthClient>} */
    this._clients = new Map()

    /** @private @type {Map<number, ExternalSeedAccountOptions>} */
    this._accountOptions = new Map()

    /** @private @type {Promise<void> | undefined} */
    this._closePromise = undefined

    /** @private */
    this._closed = false
  }

  /**
   * Starts one externally seeded daemon. The client is published to
   * `_clients` before the cancellable open runs, so `close()` can race a
   * hung start with `stop()` instead of losing the client; whichever side
   * claims it from `_clients` first owns stop+dispose on failure.
   *
   * @private
   * @param {number} index
   * @param {ExternalSeedAccountOptions} options
   * @returns {Promise<WalletAccountWavelength>}
   */
  async _bootExternalAccount (index, options) {
    const rootSeed = this.seed
    if (rootSeed === undefined) {
      throw new ValueError('An external BIP-39 seed is required for account derivation.')
    }

    const network = this._wavelengthConfig.network
    if (network === undefined) {
      throw new ValueError('config.network is required for external-seed account derivation.')
    }

    const derived = deriveWavelengthAccount(rootSeed, network, index)
    const dataDir = wavelengthAccountDataDir(
      this._wavelengthConfig.dataDir,
      derived.rootId,
      network,
      index
    )
    const derivationPath = wavelengthAccountDerivationPath(network, index)
    const accountConfig = { ...this._wavelengthConfig, dataDir }

    /** @type {ExternalSeedWavelengthClient | undefined} */
    let client
    try {
      client = /** @type {ExternalSeedWavelengthClient} */ (/** @type {unknown} */ (await createWavelengthTransport({
        wasmRuntimeDir: this._wavelengthConfig.wasmRuntimeDir
      })))
      await client.ready()

      if (this._closed) {
        throw new ValueError('WalletManagerWavelength is closed.')
      }

      this._clients.set(index, client)

      const result = await client.startExternalSeedWallet(accountConfig, {
        seedEntropy: derived.seedEntropy,
        expectedIdentityPubKey: options.expectedIdentityPubKey,
        recoverState: options.recoverState,
        recoveryWindow: options.recoveryWindow
      })

      if (this._closed) {
        throw new ValueError('WalletManagerWavelength is closed.')
      }

      const account = new WalletAccountWavelength(
        client,
        result.identityPubKey,
        accountConfig,
        index,
        derivationPath,
        result.imported
      )
      this._accounts[index] = account

      return account
    } catch (err) {
      const closeOwnsClient = client !== undefined && this._closed &&
        this._clients.get(index) === client
      if (client !== undefined && this._clients.get(index) === client) {
        this._clients.delete(index)
      }
      if (!closeOwnsClient) {
        await client?.dispose?.()
      }
      throw err
    } finally {
      derived.seedEntropy.fill(0)
    }
  }

  /**
   * Returns one complete Wavelength account/daemon instance. Every valid
   * index is derived independently from the manager's seed and cached.
   *
   * Wavelength has no named-signer registry, so `options.signerName` is
   * always rejected rather than silently ignored.
   *
   * `_accountPromises` is populated before the boot promise's first `await`,
   * so concurrent callers for one index share exactly one daemon boot.
   *
   * @param {number | string} [index] - The index of the account to get (default: 0).
   * @param {ExternalSeedAccountOptions} [options] - Account-open options. Named signers are not supported.
   * @returns {Promise<WalletAccountWavelength>} The account.
   */
  async getAccount (index = 0, options = {}) {
    if (this._closed) {
      throw new ValueError('WalletManagerWavelength is closed.')
    }

    if (options.signerName !== undefined) {
      throw new ValueError(`options.signerName is not supported on Wavelength (got ${JSON.stringify(options.signerName)}): there is no named-signer registry to resolve it against.`)
    }

    if (!Number.isSafeInteger(index) || Number(index) < 0 || Number(index) >= 0x80000000) {
      throw new ValueError('accountIndex must be an integer in 0..0x7fffffff')
    }
    const accountIndex = /** @type {number} */ (index)
    const recoverState = options.recoverState ?? this._wavelengthConfig.recoverState ?? false
    const accountOptions = {
      expectedIdentityPubKey: options.expectedIdentityPubKey,
      recoverState,
      recoveryWindow: recoverState
        ? options.recoveryWindow ?? this._wavelengthConfig.recoveryWindow
        : undefined
    }
    validateExternalSeedAccountOptions(accountOptions)

    const existingOptions = this._accountOptions.get(accountIndex)
    if (existingOptions !== undefined && !sameExternalSeedAccountOptions(existingOptions, accountOptions)) {
      throw new ValueError(`account ${accountIndex} is already opening or active with different external-seed options`)
    }

    if (!this._accountPromises.has(accountIndex)) {
      this._accountOptions.set(accountIndex, accountOptions)
      const promise = this._bootExternalAccount(
        accountIndex,
        accountOptions
      ).catch((err) => {
        this._accountPromises.delete(accountIndex)
        this._accountOptions.delete(accountIndex)
        throw err
      })
      this._accountPromises.set(accountIndex, promise)
    }

    return /** @type {Promise<WalletAccountWavelength>} */ (
      this._accountPromises.get(accountIndex)
    )
  }

  /**
   * Stops and disposes one account's daemon without closing the whole
   * manager or the other accounts it has open.
   *
   * Required before switching to (or adding) a different account on
   * iOS/Android, where only one embedded daemon can be active per process.
   * The desktop/WASM transport has no such limit -- each account gets its
   * own isolated instance.
   *
   * A no-op if the index was never opened (or was already closed). Waits for
   * an in-flight boot to settle first, so a late successful start doesn't
   * leave an orphaned daemon behind.
   *
   * @param {number} index
   * @returns {Promise<void>}
   */
  async closeAccount (index) {
    const promise = this._accountPromises.get(index)
    this._accountPromises.delete(index)
    this._accountOptions.delete(index)

    if (promise) {
      await promise.catch(() => {})
    }

    const client = this._clients.get(index)
    this._clients.delete(index)

    const account = this._accounts[index]
    if (account) {
      account.dispose()
      delete this._accounts[index]
    }

    if (client) {
      try {
        await client.stop()
      } finally {
        await client.dispose?.()
      }
    }
  }

  /**
   * Returns the wallet account at a specific derivation path.
   *
   * Not supported: no derivation-path concept exists anywhere in the mobile
   * facade (`RuntimeConfig`/`CreateWalletRequest`/`UnlockWalletRequest`).
   *
   * @param {string} path - The derivation path.
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - Not supported on Wavelength; unused, this method always throws regardless.
   * @returns {Promise<never>} Never resolves; always throws.
   */
  async getAccountByPath (path, options = {}) {
    const err = new UnsupportedOperationError('getAccountByPath(path, options?)')
    err.message = "Method 'getAccountByPath(path, options?)' not supported on Wavelength: no derivation-path parameter exists in the mobile facade."
    throw err
  }

  /**
   * Returns an estimate of the current fee rates.
   *
   * Wavelength has no fee-rate schedule -- only per-transaction quotes via
   * `prepareSend()`, which requires a concrete destination. This estimates by
   * quoting a nominal send to the wallet's own boarding address instead.
   * Callers needing an accurate quote for a real payment should use
   * `account.quoteSendTransaction` against the real destination instead.
   *
   * @returns {Promise<FeeRates>} The estimated fee rates (in satoshis).
   */
  async getFeeRates () {
    if (this._closed) {
      throw new ValueError('WalletManagerWavelength is closed.')
    }

    await this.getAccount(0)
    const client = this._clients.get(0)
    if (client === undefined) {
      throw new Error('Wavelength account 0 started without a client')
    }

    const { address } = await client.deposit()
    const { expectedFeeSat } = await client.prepareSend({ onchainAddress: address, amountSat: FEE_RATE_QUOTE_AMOUNT_SAT })

    const rate = BigInt(expectedFeeSat)
    return { normal: rate, fast: rate }
  }

  /**
   * Stops every daemon and then disposes its transport. Await this in hosts
   * that need database shutdown and worker termination to finish before exit.
   *
   * The seed is wiped immediately, before daemon shutdown (which can take a
   * while, or hang). Every already-published client starts stopping right
   * away too, racing any still-in-flight startup rather than waiting for it,
   * then any client that completed during that wait is caught in a second
   * pass. `super.dispose()`'s per-account cleanup is a no-op for us (raw
   * private keys never leave the daemons), so each account's `dispose()` is
   * called explicitly here instead.
   *
   * @returns {Promise<void>}
   */
  close () {
    if (this._closePromise !== undefined) return this._closePromise

    this._closed = true

    const ownedSeed = this.seed
    if (ownedSeed instanceof Uint8Array) ownedSeed.fill(0)

    /** @type {Promise<unknown>[]} */
    const starts = Array.from(this._accountPromises.values())

    this._closePromise = (async () => {
      const shutdowns = new Map()
      const beginShutdown = (client) => {
        if (shutdowns.has(client)) return

        const shutdown = (async () => {
          try {
            await client.stop()
          } finally {
            await client.dispose?.()
          }
        })()

        shutdown.catch(() => {})
        shutdowns.set(client, shutdown)
      }

      for (const client of this._clients.values()) beginShutdown(client)

      await Promise.allSettled(starts)

      for (const client of this._clients.values()) beginShutdown(client)

      this._accountPromises.clear()
      this._accountOptions.clear()
      this._clients.clear()

      const results = await Promise.allSettled(shutdowns.values())

      for (const account of Object.values(this._accounts)) {
        account.dispose()
      }

      super.dispose()

      ;(/** @type {any} */ (this))._seed = undefined
      this._config = {}
      this._wavelengthConfig = {}

      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') {
        throw failed.reason
      }
    })()

    return this._closePromise
  }

  /**
   * Begins asynchronous shutdown. Use {@link close} when the caller can await
   * the SQLite checkpoint and transport-worker termination.
   *
   * @returns {void}
   */
  dispose () {
    this.close().catch(() => {})
  }
}
