'use strict'

import WalletManager, { UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

import createWavelengthTransport from '#transport'

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
 * @property {boolean} [recoverState] - Run server-assisted state recovery on open. Defaults to false.
 * @property {number} [recoveryWindow] - Per-key-family recovery look-ahead; only used when `recoverState` is true.
 * @property {string} [wasmRuntimeDir] - Directory of the WASM runtime assets. Only used on desktop/server Bare (`darwin`/`linux`/`win32`); ignored on iOS.
 */

/** @typedef {RuntimeConfig & WavelengthWalletOptions} WavelengthWalletConfig */

/**
 * @typedef {Object} ExternalSeedAccountOptions
 * @property {string} [expectedIdentityPubKey] - Daemon identity to verify; pass to getAccount(), not the manager config.
 * @property {boolean} [recoverState] - Run state recovery on open.
 * @property {number} [recoveryWindow] - Per-key-family recovery look-ahead.
 * @property {string} [signerName] - Always rejected.
 */

/**
 * @typedef {Object} ExternalSeedLifecycle
 * @property {(config: RuntimeConfig, req: {seedEntropy: Uint8Array, expectedIdentityPubKey?: string, recoverState?: boolean, recoveryWindow?: number}) => Promise<{identityPubKey: string, imported: boolean}>} startExternalSeedWallet
 */

/**
 * @typedef {WavelengthClient & ExternalSeedLifecycle} ExternalSeedWavelengthClient
 */

const FEE_RATE_QUOTE_AMOUNT_SAT = 10_000

// Taproot address of BIP-341's NUMS point: unspendable, so the quote never
// names a real address.
const FEE_RATE_QUOTE_DESTINATIONS = {
  mainnet: 'bc1p2zffkaxp5py4fdutfdsrt6t6tcrc5ks09rkfd428hlhf4n5q8tqqwv7ahk',
  testnet: 'tb1p2zffkaxp5py4fdutfdsrt6t6tcrc5ks09rkfd428hlhf4n5q8tqqeygjde',
  testnet4: 'tb1p2zffkaxp5py4fdutfdsrt6t6tcrc5ks09rkfd428hlhf4n5q8tqqeygjde',
  signet: 'tb1p2zffkaxp5py4fdutfdsrt6t6tcrc5ks09rkfd428hlhf4n5q8tqqeygjde',
  regtest: 'bcrt1p2zffkaxp5py4fdutfdsrt6t6tcrc5ks09rkfd428hlhf4n5q8tqq5az5cr'
}

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
 * Each account index selects a separate daemon identity and profile directory.
 * The daemon receives only that directory and 16 derived bytes of entropy.
 */
export default class WalletManagerWavelength extends WalletManager {
  /**
   * Copies the seed so `close()` can wipe it without touching the caller's
   * memory.
   *
   * @param {string | Uint8Array} seedOrSigner - A BIP-39 phrase or raw seed.
   * @param {WavelengthWalletConfig} config - Requires explicit `network` and base `dataDir`.
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
   * The client is published to `_clients` before the open so `close()` can stop
   * a hung start; whoever claims it from `_clients` first owns stop+dispose.
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
   * `_accountPromises` is populated before the boot's first `await`, so
   * concurrent callers for one index share one daemon boot.
   *
   * @param {number | string} [index] - The account index (default: 0).
   * @param {ExternalSeedAccountOptions} [options] - Account-open options.
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
   * Required before opening another account on iOS/Android, where only one
   * embedded daemon can run per process.
   *
   * Waits for an in-flight boot first, so a late start can't orphan a daemon.
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
   * Not supported.
   *
   * @param {string} path - The derivation path.
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - Unused.
   * @returns {Promise<never>} Always throws.
   */
  async getAccountByPath (path, options = {}) {
    const err = new UnsupportedOperationError('getAccountByPath(path, options?)')
    err.message = "Method 'getAccountByPath(path, options?)' not supported on Wavelength: no derivation-path parameter exists in the mobile facade."
    throw err
  }

  /**
   * There is no fee-rate schedule, so this quotes a nominal 10,000 sat send to
   * an unspendable address; `normal` and `fast` are equal. For a real payment
   * use `account.quoteSendTransaction`. Boots account 0 if it isn't open.
   *
   * @returns {Promise<FeeRates>} The estimated fee rates, in satoshis.
   * @throws {Error} If the daemon could not determine the fee up front.
   */
  async getFeeRates () {
    if (this._closed) {
      throw new ValueError('WalletManagerWavelength is closed.')
    }

    const to = FEE_RATE_QUOTE_DESTINATIONS[this._wavelengthConfig.network]
    if (to === undefined) {
      throw new ValueError(`getFeeRates: no quote destination for network ${this._wavelengthConfig.network}.`)
    }

    const account = await this.getAccount(0)
    const { fee } = await account.quoteSendTransaction({ to, value: FEE_RATE_QUOTE_AMOUNT_SAT })

    return { normal: fee, fast: fee }
  }

  /**
   * Await this in hosts that need database shutdown to finish before exit.
   *
   * The seed is wiped first, since shutdown can hang. A second pass stops
   * clients that finished starting meanwhile. `super.dispose()` skips our
   * accounts (null `privateKey`), so each is disposed explicitly.
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
   * Fire-and-forget; use {@link close} to await shutdown.
   *
   * @returns {void}
   */
  dispose () {
    this.close().catch(() => {})
  }
}
