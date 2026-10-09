'use strict'

import { UnsupportedOperationError, NotImplementedError } from '@tetherto/wdk-wallet'

import WalletAccountReadOnlyWavelength from './wallet-account-read-only-wavelength.js'
import { assertQuotedFee } from './fee-quote.js'

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
 * @property {string} to - On-chain address.
 * @property {number | bigint} value - Amount in satoshis.
 * @property {string} [note] - Note recorded with the activity.
 * @property {number} [maxFeeSat] - Fee cap in satoshis, checked against the quote before sending.
 * @property {boolean} [sweepAll] - Sends the entire spendable balance; `value` is ignored.
 */

/**
 * @typedef {Object} LightningInvoiceOptions
 * @property {number} amountSat - Amount in sats.
 * @property {string} [memo] - Memo attached to the invoice.
 */

/**
 * @typedef {Object} PayLightningInvoiceOptions
 * @property {string} invoice - Invoice to pay.
 * @property {string} [note] - Note recorded with the activity.
 * @property {number} [maxFeeSat] - Fee cap in satoshis, checked against the quote before sending.
 */

/**
 * @typedef {Object} QuotePayLightningInvoiceOptions
 * @property {string} invoice - Invoice to quote.
 */

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @implements {IWalletAccount} */
export default class WalletAccountWavelength extends WalletAccountReadOnlyWavelength {
  /**
   * @param {WavelengthClient} client - The started, unlocked client.
   * @param {string} identityPubKey - Daemon identity pubkey (hex); `keyPair` is synchronous, so it can't be fetched lazily.
   * @param {WavelengthWalletConfig} [config] - The configuration object.
   * @param {number} [index=0] - Account index.
   * @param {string} [path] - Derivation path.
   * @param {boolean} [imported=false] - Whether this open created a new local profile.
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
   * @type {number}
   */
  get index () {
    return this._index
  }

  /**
   * @type {string}
   */
  get path () {
    return this._path
  }

  /**
   * @type {boolean}
   */
  get imported () {
    return this._imported
  }

  /**
   * `privateKey` is `null`, not absent: base `WalletManager.dispose()` skips
   * accounts whose `keyPair?.privateKey` is null.
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
   * Not available on Wavelength.
   *
   * @param {string} message - The message.
   * @returns {Promise<never>} Always throws.
   */
  async sign (message) {
    const err = new UnsupportedOperationError('sign(message)')
    err.message = "Method 'sign(message)' is not available on Wavelength yet: no MobileSignMessage export exists."
    throw err
  }

  /**
   * Not supported: there is no sign-without-broadcast primitive.
   *
   * @param {WavelengthTransaction} tx - The transaction.
   * @returns {Promise<never>} Always throws.
   */
  async signTransaction (tx) {
    const err = new UnsupportedOperationError('signTransaction(tx)')
    err.message = "Method 'signTransaction(tx)' not supported on Wavelength: there is no sign-without-broadcast primitive. Use sendTransaction(tx) instead."
    throw err
  }

  /**
   * Sends on-chain. The returned `hash` is the daemon's activity entry id, not
   * a txid: read `progress.txid` later via `getTransactionReceipt()`.
   *
   * With `sweepAll`, the amount sent (`actualAmountSat`) is not in the result;
   * call the client's `sendPrepared()` directly to read it.
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
   * An unknown fee is fatal only when `maxFeeSat` is set.
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
   * Allocates a fresh on-chain boarding address.
   *
   * @param {import('@lightninglabs/wavelength-core').DepositRequest} [options] - The deposit options.
   * @returns {Promise<import('@lightninglabs/wavelength-core').DepositResult>} The boarding address and its initial activity entry.
   */
  async getDepositAddress (options) {
    return await this._client.deposit(options)
  }

  /**
   * Not implemented: no token support.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<never>} Always throws.
   */
  async transfer (options) {
    const err = new NotImplementedError('transfer(options)')
    err.message = "Method 'transfer(options)' is not implemented yet on Wavelength: token support doesn't exist yet."
    throw err
  }

  /**
   * Creates a Lightning invoice.
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
   * @param {PayLightningInvoiceOptions} options - The payment options.
   * @returns {Promise<SendResult>} The payment's result.
   */
  async payLightningInvoice ({ invoice, note, maxFeeSat }) {
    const prepared = await this._client.prepareSend({ invoice, note, maxFeeSat })

    this._assertFeeWithinBudget(prepared, maxFeeSat)

    return await this._client.sendPrepared(prepared)
  }

  /**
   * Quotes the fee for paying an invoice.
   *
   * @param {QuotePayLightningInvoiceOptions} options - The invoice to quote.
   * @returns {Promise<bigint>} The expected fee, in satoshis.
   */
  async quotePayLightningInvoice ({ invoice }) {
    const prepared = await this._client.prepareSend({ invoice })
    return assertQuotedFee(prepared, 'quotePayLightningInvoice')
  }

  /**
   * Scans the paged `receive` feed; the daemon has no lookup by id.
   *
   * @param {string} invoiceId - The entry id.
   * @returns {Promise<Entry | null>} The matching activity entry, or null if not found in the listed page.
   */
  async getLightningReceiveRequest (invoiceId) {
    return await this._findActivityEntry((entry) => entry.id === invoiceId, { kinds: ['receive'] })
  }

  /**
   * Scans the paged `send` feed; the daemon has no lookup by id.
   *
   * @param {string} requestId - The entry id.
   * @returns {Promise<Entry | null>} The matching activity entry, or null if not found in the listed page.
   */
  async getLightningSendRequest (requestId) {
    return await this._findActivityEntry((entry) => entry.id === requestId, { kinds: ['send'] })
  }

  /**
   * @returns {Promise<WalletAccountReadOnlyWavelength>} The read-only account.
   */
  async toReadOnlyAccount () {
    if (!this._readOnlyAccount) {
      this._readOnlyAccount = new WalletAccountReadOnlyWavelength(this._client, this._config)
    }

    return this._readOnlyAccount
  }

  /**
   * Exits one VTXO: `destination` for a cooperative leave, or `forceUnrollAck`
   * for a forced on-chain unroll. The two are mutually exclusive.
   *
   * @param {ExitRequest} req - The outpoint to exit, and which branch to take.
   * @returns {Promise<ExitResult>} The exit's result; see `ExitResult.path` to discriminate the outcome.
   */
  async exit (req) {
    return await this._client.exit(req)
  }

  /**
   * Previews (default) or, with `broadcast: true`, broadcasts a sweep to
   * `destinationAddress`. Broadcasting moves funds: show the preview's
   * `estimatedFeeSat`/`netAmountSat` first.
   *
   * @param {SweepWalletRequest} req - The sweep destination and options.
   * @returns {Promise<SweepWalletResult>} The sweep's preview or broadcast result.
   */
  async sweepWallet (req) {
    return await this._client.sweepWallet(req)
  }

  /**
   * Drops references; the manager's `close()` owns daemon shutdown.
   *
   * @returns {void}
   */
  dispose () {
    this._unwatchActivity?.()
    this._readOnlyAccount?.dispose()
    this._readOnlyAccount = undefined
    this._client = null
    this._config = {}
  }
}
