'use strict'

import { UnsupportedOperationError, NotImplementedError } from '@tetherto/wdk-wallet'

import WalletAccountReadOnlyWavelength from './wallet-account-read-only-wavelength.js'

/** @typedef {import('@lightninglabs/wavelength-core').WavelengthClient} WavelengthClient */
/** @typedef {import('@lightninglabs/wavelength-core').PrepareSendResult} PrepareSendResult */
/** @typedef {import('@lightninglabs/wavelength-core').SendResult} SendResult */
/** @typedef {import('@lightninglabs/wavelength-core').ReceiveResult} ReceiveResult */
/** @typedef {import('@lightninglabs/wavelength-core').Entry} Entry */
/** @typedef {import('@lightninglabs/wavelength-core').ExitRequest} ExitRequest */
/** @typedef {import('@lightninglabs/wavelength-core').ExitResult} ExitResult */
/** @typedef {import('@lightninglabs/wavelength-core').SweepWalletRequest} SweepWalletRequest */
/** @typedef {import('@lightninglabs/wavelength-core').SweepWalletResult} SweepWalletResult */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-manager-wavelength.js').WavelengthWalletConfig} WavelengthWalletConfig */

/**
 * @typedef {Object} WavelengthTransaction
 * @property {string} to - The recipient's on-chain address.
 * @property {number | bigint} value - The amount to send, in satoshis.
 * @property {string} [note] - An optional note recorded with the activity.
 * @property {number} [maxFeeSat] - An optional cap on the fee, in satoshis; enforced client-side against the prepareSend quote before sending (see `sendTransaction`).
 * @property {boolean} [sweepAll] - When true, sweeps the entire spendable balance to `to` (value is ignored).
 */

/**
 * @typedef {Object} LightningInvoiceOptions
 * @property {number} amountSat - The amount to request, in sats.
 * @property {string} [memo] - An optional memo attached to the invoice.
 */

/**
 * @typedef {Object} PayLightningInvoiceOptions
 * @property {string} invoice - The Lightning invoice to pay.
 * @property {string} [note] - An optional note recorded with the activity.
 * @property {number} [maxFeeSat] - An optional cap on the fee, in satoshis; enforced client-side against the prepareSend quote before sending.
 */

/**
 * @typedef {Object} QuotePayLightningInvoiceOptions
 * @property {string} invoice - The Lightning invoice to quote.
 */

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @implements {IWalletAccount} */
export default class WalletAccountWavelength extends WalletAccountReadOnlyWavelength {
  /**
   * Creates a new Wavelength wallet account.
   *
   * @param {WavelengthClient} client - The already-started, unlocked Wavelength client.
   * @param {string} identityPubKey - The daemon's identity public key (hex), from `getInfo()` at unlock time. `keyPair` is a synchronous getter, so this can't be fetched lazily inside it.
   * @param {WavelengthWalletConfig} [config] - The configuration object.
   * @param {number} [index=0] - The external-seed account/daemon index.
   * @param {string} [path] - The external-seed derivation path.
   * @param {boolean} [imported=false] - Whether this open created a new local profile, from `startExternalSeedWallet`'s result.
   */
  constructor (client, identityPubKey, config = {}, index = 0, path, imported = false) {
    super(client, config)

    /** @private */
    this._identityPubKey = identityPubKey

    /** @private */
    this._readOnlyAccount = undefined

    /** @private */
    this._index = index

    /** @private */
    this._path = path

    /** @private */
    this._imported = imported
  }

  /**
   * The derivation index selecting this complete daemon identity.
   *
   * @type {number}
   */
  get index () {
    return this._index
  }

  /**
   * The derivation path of this account -- WDK's versioned BIP-85 path.
   *
   * @type {string}
   */
  get path () {
    return this._path
  }

  /**
   * Whether this account's local profile was created for the first time by
   * this open, rather than reopening an existing one. Reflects the daemon's
   * own `startExternalSeedWallet` result at the time this account was
   * created -- fixed for the lifetime of this instance.
   *
   * @type {boolean}
   */
  get imported () {
    return this._imported
  }

  /**
   * The account's key pair. `privateKey` is `null`, not merely absent --
   * Wavelength never exposes raw key material, and base
   * `WalletManager.dispose()` checks `account.keyPair?.privateKey` to decide
   * whether to dispose a cached account, so `null` makes it skip us safely.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return { publicKey: this._identityPubKeyBytes, privateKey: null }
  }

  /** @private */
  get _identityPubKeyBytes () {
    const hex = this._identityPubKey ?? ''
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return bytes
  }

  /**
   * Signs a message.
   *
   * Not available: Wavelength has no `MobileSignMessage` export.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<never>} Never resolves; always throws.
   */
  async sign (message) {
    const err = new UnsupportedOperationError('sign(message)')
    err.message = "Method 'sign(message)' is not available on Wavelength yet: no MobileSignMessage export exists. See notes.md's \"Concrete asks for Lightning Labs\"."
    throw err
  }

  /**
   * Signs a transaction.
   *
   * Not supported: there is no sign-without-broadcast primitive on
   * Wavelength. The send flow is quote-then-execute (`prepareSend` /
   * `sendPrepared`); use `sendTransaction` instead.
   *
   * @param {WavelengthTransaction} tx - The transaction.
   * @returns {Promise<never>} Never resolves; always throws.
   */
  async signTransaction (tx) {
    const err = new UnsupportedOperationError('signTransaction(tx)')
    err.message = "Method 'signTransaction(tx)' not supported on Wavelength: there is no sign-without-broadcast primitive. Use sendTransaction(tx) instead."
    throw err
  }

  /**
   * Sends an on-chain transaction.
   *
   * Implemented as an explicit `prepareSend()` + `sendPrepared()` pair
   * (rather than the one-shot `send()`) so `maxFeeSat` can be enforced, and
   * `feeKnown`/`warning` surfaced, before the payment is actually dispatched.
   *
   * @param {WavelengthTransaction} tx - The transaction.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction ({ to, value, note, maxFeeSat, sweepAll }) {
    const prepared = await this._client.prepareSend({
      onchainAddress: to,
      amountSat: sweepAll ? undefined : Number(value),
      sweepAll,
      note,
      maxFeeSat
    })

    this._assertFeeWithinBudget(prepared, maxFeeSat)

    const result = await this._client.sendPrepared(prepared)
    return { hash: result.entry?.id ?? prepared.sendIntentId, fee: BigInt(result.entry?.feeSat ?? prepared.expectedFeeSat ?? 0) }
  }

  /**
   * Throws unless a prepared send's quoted fee is known and within budget.
   *
   * @private
   * @param {PrepareSendResult} prepared - The prepareSend quote.
   * @param {number} [maxFeeSat] - The caller's fee cap, if any.
   */
  _assertFeeWithinBudget (prepared, maxFeeSat) {
    if (maxFeeSat === undefined) return

    if (!prepared.feeKnown) {
      throw new Error(`Cannot enforce maxFeeSat=${maxFeeSat}: the daemon could not determine the fee up front (prepareSend returned feeKnown=false).${prepared.warning ? ` ${prepared.warning}` : ''}`)
    }

    if (prepared.expectedFeeSat > maxFeeSat) {
      throw new Error(`Quoted fee ${prepared.expectedFeeSat} sat exceeds maxFeeSat ${maxFeeSat} sat.`)
    }
  }

  /**
   * Allocates a fresh on-chain boarding address for depositing bitcoin into
   * the wallet. Wavelength-specific addition, not part of base `IWalletAccount`.
   *
   * @param {import('@lightninglabs/wavelength-core').DepositRequest} [options] - The deposit options.
   * @returns {Promise<import('@lightninglabs/wavelength-core').DepositResult>} The boarding address and its initial activity entry.
   */
  async getDepositAddress (options) {
    return await this._client.deposit(options)
  }

  /**
   * Transfers a token to another address.
   *
   * Not implemented yet: Wavelength has no token support yet.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<never>} Never resolves; always throws.
   */
  async transfer (options) {
    const err = new NotImplementedError('transfer(options)')
    err.message = "Method 'transfer(options)' is not implemented yet on Wavelength: token support doesn't exist yet."
    throw err
  }

  /**
   * Creates a Lightning invoice for receiving payments.
   *
   * @param {LightningInvoiceOptions} options - The invoice options.
   * @returns {Promise<ReceiveResult>} The invoice and its initial wallet entry.
   */
  async createLightningInvoice (options) {
    return await this._client.receive(options)
  }

  /**
   * Pays a Lightning invoice.
   *
   * Implemented as an explicit `prepareSend()` + `sendPrepared()` pair for
   * the same `maxFeeSat`-enforcement reason as `sendTransaction`.
   *
   * @param {PayLightningInvoiceOptions} options - The payment options.
   * @returns {Promise<SendResult>} The payment's result.
   */
  async payLightningInvoice ({ invoice, note, maxFeeSat }) {
    const prepared = await this._client.prepareSend({ invoice, note, maxFeeSat })

    this._assertFeeWithinBudget(prepared, maxFeeSat)

    return await this._client.sendPrepared(prepared)
  }

  /**
   * Quotes the fee for paying a Lightning invoice.
   *
   * @param {QuotePayLightningInvoiceOptions} options - The invoice to quote.
   * @returns {Promise<bigint>} The expected fee, in satoshis.
   */
  async quotePayLightningInvoice ({ invoice }) {
    const { expectedFeeSat } = await this._client.prepareSend({ invoice })
    return BigInt(expectedFeeSat)
  }

  /**
   * Gets a Lightning receive request (invoice) by id.
   *
   * Interim implementation: the mobile facade doesn't export
   * `InspectActivity` yet, so this lists recent `receive` activity and
   * filters client-side. Switch to `InspectActivity` once it's exported.
   *
   * @param {string} invoiceId - The id of the Lightning receive request.
   * @returns {Promise<Entry | null>} The matching activity entry, or null if not found in the listed page.
   */
  async getLightningReceiveRequest (invoiceId) {
    const { activity } = await this._client.list({ view: 'activity', kinds: ['receive'] })
    return activity?.entries.find((entry) => entry.id === invoiceId) ?? null
  }

  /**
   * Gets a Lightning send request by id. See `getLightningReceiveRequest`'s
   * interim-implementation note; the same caveat applies here.
   *
   * @param {string} requestId - The id of the Lightning send request.
   * @returns {Promise<Entry | null>} The matching activity entry, or null if not found in the listed page.
   */
  async getLightningSendRequest (requestId) {
    const { activity } = await this._client.list({ view: 'activity', kinds: ['send'] })
    return activity?.entries.find((entry) => entry.id === requestId) ?? null
  }

  /**
   * Returns a read-only copy of the account, sharing this account's client
   * connection.
   *
   * @returns {Promise<WalletAccountReadOnlyWavelength>} The read-only account.
   */
  async toReadOnlyAccount () {
    if (!this._readOnlyAccount) {
      this._readOnlyAccount = new WalletAccountReadOnlyWavelength(this._client, this._config)
    }

    return this._readOnlyAccount
  }

  /**
   * Exits one VTXO through a cooperative leave (queued into the next round)
   * or an acknowledged unilateral unroll (forced, on-chain). Pass
   * `destination` for a cooperative leave, or `forceUnrollAck` (the
   * `FORCE_UNROLL_ACK` constant from `@lightninglabs/wavelength-core`) for a
   * unilateral one -- the two are mutually exclusive on `req`. Preview a
   * unilateral exit's funding requirements first with `getExitPlan()`.
   *
   * @param {ExitRequest} req - The outpoint to exit, and which branch to take.
   * @returns {Promise<ExitResult>} The exit's result; see `ExitResult.path` to discriminate the outcome.
   */
  async exit (req) {
    return await this._client.exit(req)
  }

  /**
   * Previews (`broadcast: false`, the default) or broadcasts
   * (`broadcast: true`) a sweep of the backing wallet to
   * `destinationAddress`, once claimable exit outputs are ready. Show the
   * preview's `estimatedFeeSat`/`netAmountSat` to the user before
   * broadcasting -- this moves funds when `broadcast` is true.
   *
   * @param {SweepWalletRequest} req - The sweep destination and options.
   * @returns {Promise<SweepWalletResult>} The sweep's preview or broadcast result.
   */
  async sweepWallet (req) {
    return await this._client.sweepWallet(req)
  }

  /**
   * Disposes the wallet account. The daemon connection itself is owned and
   * stopped by `WalletManagerWavelength.close()`, so there's nothing
   * account-scoped to tear down beyond dropping the reference.
   *
   * @returns {void}
   */
  dispose () {
    this._readOnlyAccount?.dispose()
    this._readOnlyAccount = undefined
    this._client = null
    this._config = {}
  }
}
