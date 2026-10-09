'use strict'

import { WalletAccountReadOnly, NotImplementedError, NoSuchElementError } from '@tetherto/wdk-wallet'

import { secp256k1 } from '@noble/curves/secp256k1'
import { hexToBytes } from '@noble/curves/utils'
import { sha256 } from '@noble/hashes/sha2.js'

import { assertQuotedFee } from './fee-quote.js'

/** @typedef {import('@lightninglabs/wavelength-core').WavelengthClient} WavelengthClient */
/** @typedef {import('@lightninglabs/wavelength-core').WalletInfo} WalletInfo */
/** @typedef {import('@lightninglabs/wavelength-core').WalletStatus} WalletStatus */
/** @typedef {import('@lightninglabs/wavelength-core').ListRequest} ListRequest */
/** @typedef {import('@lightninglabs/wavelength-core').ListResult} ListResult */

/**
 * @typedef {Object} BalanceBreakdown
 * @property {bigint} confirmed - Self-custodied funds.
 * @property {bigint} pendingIn - Unconfirmed incoming funds.
 * @property {bigint} pendingOut - Committed to unfinalized outgoing payments.
 * @property {bigint} creditAvailable - Spendable server credit.
 * @property {bigint} creditReserved - Server credit held for in-flight payments.
 */
/** @typedef {import('@lightninglabs/wavelength-core').GetExitPlanRequest} GetExitPlanRequest */
/** @typedef {import('@lightninglabs/wavelength-core').GetExitPlanResult} GetExitPlanResult */
/** @typedef {import('@lightninglabs/wavelength-core').ExitStatusRequest} ExitStatusRequest */
/** @typedef {import('@lightninglabs/wavelength-core').ExitStatusResult} ExitStatusResult */
/** @typedef {import('@lightninglabs/wavelength-core').ExitSummaryRequest} ExitSummaryRequest */
/** @typedef {import('@lightninglabs/wavelength-core').ExitSummaryResult} ExitSummaryResult */
/** @typedef {import('@lightninglabs/wavelength-core').ActivityStreamOptions} ActivityStreamOptions */
/** @typedef {Extract<import('@lightninglabs/wavelength-core').WavelengthEvent, { type: 'activity' | 'activityStream' }>} ActivityEvent */

/** @typedef {import('@tetherto/wdk-wallet').TransactionReceipt} TransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet').Finality} Finality */

/**
 * 'failed' maps to 'dropped' because Finality has no 'reverted' value.
 *
 * @type {Record<import('@lightninglabs/wavelength-core').EntryStatus, Finality>}
 */
const ENTRY_STATUS_TO_FINALITY = {
  pending: 'pending',
  complete: 'final',
  failed: 'dropped'
}

/**
 * `hash` is the entry id, not a txid (see `entry.progress.txid`).
 *
 * @param {import('@lightninglabs/wavelength-core').Entry} entry
 * @returns {TransactionReceipt}
 */
function toTransactionReceipt (entry) {
  const finality = ENTRY_STATUS_TO_FINALITY[entry.status]

  return {
    hash: entry.id,
    finality,
    success: finality === 'pending' ? undefined : entry.status === 'complete',
    block: entry.progress?.confirmationHeight || undefined,
    fee: entry.feeSat === undefined ? undefined : BigInt(entry.feeSat)
  }
}

/** @typedef {import('./wallet-manager-wavelength.js').WavelengthWalletConfig} WavelengthWalletConfig */

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */

// Larger than the first page: most lookups are for recent entries.
const LOOKUP_PAGE_LIMIT = 500

/**
 * Shares the owning account's client; there is no keyless query mode.
 *
 * @implements {IWalletAccountReadOnly}
 */
export default class WalletAccountReadOnlyWavelength extends WalletAccountReadOnly {
  /**
   * @param {WavelengthClient} client - The started, unlocked client this view shares.
   * @param {WavelengthWalletConfig} [config] - The configuration object.
   */
  constructor (client, config = {}) {
    super(undefined)

    /**
     * @protected
     * @type {WavelengthClient}
     */
    this._client = client

    /**
     * @protected
     * @type {WavelengthWalletConfig}
     */
    this._config = config

    /**
     * @private
     * @type {Promise<string> | undefined}
     */
    this._addressPromise = undefined

    /**
     * @protected
     * @type {(() => void) | undefined}
     */
    this._unwatchActivity = undefined
  }

  /**
   * Returns the boarding address, allocated once and reused: each `deposit()`
   * creates daemon state, so use `getDepositAddress()` for a fresh one.
   *
   * @returns {Promise<string>} The account's boarding address.
   */
  async getAddress () {
    // Cache the promise so concurrent first calls don't both allocate.
    if (this._addressPromise === undefined) {
      this._addressPromise = this._client.deposit()
        .then(({ address }) => address)
        .catch((err) => {
          this._addressPromise = undefined
          throw err
        })
    }

    return await this._addressPromise
  }

  /**
   * Excludes server credit and in-flight funds; see {@link getBalanceBreakdown}.
   *
   * @returns {Promise<bigint>} The confirmed balance, in satoshis.
   */
  async getBalance () {
    const balance = await this._client.balance()
    return BigInt(balance.confirmedSat)
  }

  /**
   * @returns {Promise<BalanceBreakdown>} The balance components, in satoshis.
   */
  async getBalanceBreakdown () {
    const balance = await this._client.balance()
    return {
      confirmed: BigInt(balance.confirmedSat),
      pendingIn: BigInt(balance.pendingInSat),
      pendingOut: BigInt(balance.pendingOutSat),
      creditAvailable: BigInt(balance.creditAvailableSat),
      creditReserved: BigInt(balance.creditReservedSat)
    }
  }

  /**
   * Verifies against the daemon's identity public key.
   *
   * @param {string} message - The original message.
   * @param {string} signature - Hex, DER or compact.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    const info = await this._client.getInfo()

    const hash = sha256(Buffer.from(message, 'utf8'))
    const sigBytes = hexToBytes(signature)
    const pubKeyBytes = hexToBytes(info.identityPubKey)

    return secp256k1.verify(sigBytes, hash, pubKeyBytes)
  }

  /**
   * Not implemented: there is no token support.
   *
   * @param {string} tokenAddress - The token address.
   * @returns {Promise<never>} Always throws.
   */
  async getTokenBalance (tokenAddress) {
    const err = new NotImplementedError('getTokenBalance(tokenAddress)')
    err.message = "Method 'getTokenBalance(tokenAddress)' is not implemented yet on Wavelength: token support doesn't exist yet."
    throw err
  }

  /**
   * Quotes the fee of an on-chain send.
   *
   * @param {import('@tetherto/wdk-wallet').Transaction} tx - The transaction.
   * @returns {Promise<{ fee: bigint }>} The transaction's fee quote.
   */
  async quoteSendTransaction ({ to, value }) {
    const prepared = await this._client.prepareSend({ onchainAddress: to, amountSat: Number(value) })
    return { fee: assertQuotedFee(prepared, 'quoteSendTransaction') }
  }

  /**
   * Not implemented: there is no token support.
   *
   * @param {import('@tetherto/wdk-wallet').TransferOptions} options - The transfer's options.
   * @returns {Promise<never>} Always throws.
   */
  async quoteTransfer (options) {
    const err = new NotImplementedError('quoteTransfer(options)')
    err.message = "Method 'quoteTransfer(options)' is not implemented yet on Wavelength: token support doesn't exist yet."
    throw err
  }

  /**
   * Scans the paged activity feed; the daemon has no lookup by id. Hitting
   * `maxPages` reads as absent, same as a miss.
   *
   * @protected
   * @param {(entry: import('@lightninglabs/wavelength-core').Entry) => boolean} predicate - Matches the wanted entry.
   * @param {Object} [options]
   * @param {import('@lightninglabs/wavelength-core').EntryKind[]} [options.kinds] - Narrows the feed, shortening the walk.
   * @param {number} [options.maxPages=10] - How many pages to scan before giving up.
   * @returns {Promise<import('@lightninglabs/wavelength-core').Entry | null>} The matching entry, or null.
   */
  async _findActivityEntry (predicate, { kinds, maxPages = 10 } = {}) {
    let cursor = ''

    for (let page = 0; page < maxPages; page++) {
      const request = { view: 'activity', kinds, cursor, ...(page > 0 && { limit: LOOKUP_PAGE_LIMIT }) }
      const { activity } = await this._client.list(/** @type {ListRequest} */ (request))

      const match = activity?.entries.find(predicate)
      if (match) return match

      // Without a cursor, the next request would refetch the first page.
      if (!activity?.hasMore || !activity.nextCursor) return null

      cursor = activity.nextCursor
    }

    return null
  }

  /**
   * Returns the raw activity entry; see `getTransaction` for WDK's shape.
   *
   * @param {string} hash - The entry id.
   * @returns {Promise<import('@lightninglabs/wavelength-core').Entry | null>} The matching entry, or null if it isn't within the scanned pages.
   */
  async getTransactionReceipt (hash) {
    return await this._findActivityEntry((entry) => entry.id === hash)
  }

  /**
   * @param {string} hash - The entry id.
   * @returns {Promise<TransactionReceipt>} The normalized receipt.
   * @throws {NoSuchElementError} If no entry is found for the given hash.
   */
  async getTransaction (hash) {
    const entry = await this._findActivityEntry((entry) => entry.id === hash)

    if (!entry) {
      throw new NoSuchElementError(`No transaction found for hash '${hash}'`)
    }

    return toTransactionReceipt(entry)
  }

  /**
   * @returns {Promise<WalletInfo>} The daemon's info.
   */
  async getInfo () {
    return await this._client.getInfo()
  }

  /**
   * @returns {Promise<WalletStatus>} The daemon's status.
   */
  async status () {
    return await this._client.status()
  }

  /**
   * @param {ListRequest} [options] - The list options.
   * @returns {Promise<ListResult>} The requested page.
   */
  async list (options) {
    return await this._client.list(options)
  }

  /**
   * Emits `'activity'` per changed entry and `'activityStream'` if the stream
   * ends or fails. A new watch replaces the previous one.
   *
   * @param {(event: ActivityEvent) => void} listener - Receives each event.
   * @param {ActivityStreamOptions} [options] - The stream's options.
   * @returns {Promise<() => void>} Stops the watch.
   */
  async watchActivity (listener, options = {}) {
    this._unwatchActivity?.()

    const client = this._client
    const unsubscribe = client.subscribe((event) => {
      if (event.type === 'activity' || event.type === 'activityStream') listener(event)
    })

    const unwatch = () => {
      unsubscribe()
      if (this._unwatchActivity !== unwatch) return
      this._unwatchActivity = undefined
      client.stopActivity()
    }
    this._unwatchActivity = unwatch

    try {
      await client.startActivity(options)
    } catch (err) {
      unwatch()
      throw err
    }

    return unwatch
  }

  /**
   * @param {GetExitPlanRequest} req - The outpoints to plan an exit for.
   * @returns {Promise<GetExitPlanResult>} The exit plan.
   */
  async getExitPlan (req) {
    return await this._client.getExitPlan(req)
  }

  /**
   * @param {ExitStatusRequest} req - The outpoint to query.
   * @returns {Promise<ExitStatusResult>} The exit's status.
   */
  async exitStatus (req) {
    return await this._client.exitStatus(req)
  }

  /**
   * @param {ExitSummaryRequest} [req] - Unused; the summary is wallet-wide.
   * @returns {Promise<ExitSummaryResult>} The exit-portfolio summary.
   */
  async exitSummary (req = {}) {
    return await this._client.exitSummary(req)
  }

  /**
   * Drops shared references only; the manager owns transport shutdown.
   *
   * @returns {void}
   */
  dispose () {
    this._unwatchActivity?.()
    this._client = null
    this._config = {}
    this._addressPromise = undefined
  }
}
