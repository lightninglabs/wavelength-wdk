'use strict'

import { WalletAccountReadOnly, NotImplementedError, NoSuchElementError } from '@tetherto/wdk-wallet'

import { secp256k1 } from '@noble/curves/secp256k1'
import { hexToBytes } from '@noble/curves/utils'
import { sha256 } from '@noble/hashes/sha2.js'

/** @typedef {import('@lightninglabs/wavelength-core').WavelengthClient} WavelengthClient */
/** @typedef {import('@lightninglabs/wavelength-core').WalletInfo} WalletInfo */
/** @typedef {import('@lightninglabs/wavelength-core').WalletStatus} WalletStatus */
/** @typedef {import('@lightninglabs/wavelength-core').ListRequest} ListRequest */
/** @typedef {import('@lightninglabs/wavelength-core').ListResult} ListResult */
/** @typedef {import('@lightninglabs/wavelength-core').GetExitPlanRequest} GetExitPlanRequest */
/** @typedef {import('@lightninglabs/wavelength-core').GetExitPlanResult} GetExitPlanResult */
/** @typedef {import('@lightninglabs/wavelength-core').ExitStatusRequest} ExitStatusRequest */
/** @typedef {import('@lightninglabs/wavelength-core').ExitStatusResult} ExitStatusResult */
/** @typedef {import('@lightninglabs/wavelength-core').ExitSummaryRequest} ExitSummaryRequest */
/** @typedef {import('@lightninglabs/wavelength-core').ExitSummaryResult} ExitSummaryResult */

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
 * `success` is undefined until the entry reaches a terminal state.
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

/**
 * A read-only view over an unlocked daemon connection. There is no keyless
 * query mode, so this shares the owning account's client rather than opening
 * its own.
 *
 * @implements {IWalletAccountReadOnly}
 */
export default class WalletAccountReadOnlyWavelength extends WalletAccountReadOnly {
  /**
   * Creates a new read-only Wavelength wallet account.
   *
   * @param {WavelengthClient} client - The already-started, unlocked Wavelength client this view shares.
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
  }

  /**
   * There is no stable receive address: every call allocates a new one.
   *
   * @returns {Promise<string>} A fresh boarding address.
   */
  async getAddress () {
    const { address } = await this._client.deposit()
    return address
  }

  /**
   * Sums what the account can spend now. Excludes unconfirmed incoming funds
   * and credit already reserved against an in-flight payment.
   *
   * @returns {Promise<bigint>} The bitcoin balance (in satoshis).
   */
  async getBalance () {
    const balance = await this._client.balance()
    return BigInt(balance.confirmedSat) + BigInt(balance.pendingOutSat) + BigInt(balance.creditAvailableSat)
  }

  /**
   * Verifies a signature against the account's identity public key.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify (hex-encoded, DER or compact).
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
   * @param {string} tokenAddress - The token's address.
   * @returns {Promise<never>} Never resolves; always throws.
   */
  async getTokenBalance (tokenAddress) {
    const err = new NotImplementedError('getTokenBalance(tokenAddress)')
    err.message = "Method 'getTokenBalance(tokenAddress)' is not implemented yet on Wavelength: token support doesn't exist yet."
    throw err
  }

  /**
   * Quotes the cost of a send transaction operation.
   *
   * @param {import('@tetherto/wdk-wallet').Transaction} tx - The transaction.
   * @returns {Promise<{ fee: bigint }>} The transaction's fee quote.
   */
  async quoteSendTransaction ({ to, value }) {
    const { expectedFeeSat } = await this._client.prepareSend({ onchainAddress: to, amountSat: Number(value) })
    return { fee: BigInt(expectedFeeSat) }
  }

  /**
   * Not implemented: there is no token support.
   *
   * @param {import('@tetherto/wdk-wallet').TransferOptions} options - The transfer's options.
   * @returns {Promise<never>} Never resolves; always throws.
   */
  async quoteTransfer (options) {
    const err = new NotImplementedError('quoteTransfer(options)')
    err.message = "Method 'quoteTransfer(options)' is not implemented yet on Wavelength: token support doesn't exist yet."
    throw err
  }

  /**
   * Filters client-side over one listed page: the daemon exports no
   * lookup-by-id, so an entry outside that page reads as missing.
   *
   * @param {string} hash - The activity entry's id.
   * @returns {Promise<import('@lightninglabs/wavelength-core').Entry | null>} The matching entry, or null if not found in the listed page.
   */
  async getTransactionReceipt (hash) {
    const { activity } = await this._client.list({ view: 'activity' })
    return activity?.entries.find((entry) => entry.id === hash) ?? null
  }

  /**
   * Same lookup as `getTransactionReceipt`, normalized to WDK's shape and
   * throwing instead of returning null.
   *
   * @param {string} hash - The activity entry's id.
   * @returns {Promise<TransactionReceipt>} The normalized receipt.
   * @throws {NoSuchElementError} If no entry is found for the given hash.
   */
  async getTransaction (hash) {
    const { activity } = await this._client.list({ view: 'activity' })
    const entry = activity?.entries.find((entry) => entry.id === hash)

    if (!entry) {
      throw new NoSuchElementError(`No transaction found for hash '${hash}'`)
    }

    return toTransactionReceipt(entry)
  }

  /**
   * Returns the daemon's current info (network, block height, wallet state, identity pubkey, ...).
   *
   * @returns {Promise<WalletInfo>} The daemon's info.
   */
  async getInfo () {
    return await this._client.getInfo()
  }

  /**
   * Returns the daemon's current sync/connectivity status.
   *
   * @returns {Promise<WalletStatus>} The daemon's status.
   */
  async status () {
    return await this._client.status()
  }

  /**
   * Lists wallet activity, VTXOs, or on-chain outputs.
   *
   * @param {ListRequest} [options] - The list options.
   * @returns {Promise<ListResult>} The requested page.
   */
  async list (options) {
    return await this._client.list(options)
  }

  /**
   * Previews funding requirements and feasibility before committing to a
   * unilateral exit.
   *
   * @param {GetExitPlanRequest} req - The outpoints to plan an exit for.
   * @returns {Promise<GetExitPlanResult>} The exit plan.
   */
  async getExitPlan (req) {
    return await this._client.getExitPlan(req)
  }

  /**
   * Queries the status of an in-progress exit for one VTXO outpoint.
   *
   * @param {ExitStatusRequest} req - The outpoint whose exit status is queried.
   * @returns {Promise<ExitStatusResult>} The exit's status.
   */
  async exitStatus (req) {
    return await this._client.exitStatus(req)
  }

  /**
   * Summarizes every in-progress exit across the wallet.
   *
   * @param {ExitSummaryRequest} [req] - No arguments; the daemon reports the wallet-wide portfolio.
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
    this._client = null
    this._config = {}
  }
}
