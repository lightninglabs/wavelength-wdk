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
 * Maps Wavelength's Entry.status to WDK's Finality. 'complete' means durably
 * settled, so it maps to 'final' rather than an intermediate 'confirmed'.
 * 'failed' maps to 'dropped' -- the closest match, since Finality has no
 * 'reverted' value.
 *
 * @type {Record<import('@lightninglabs/wavelength-core').EntryStatus, Finality>}
 */
const ENTRY_STATUS_TO_FINALITY = {
  pending: 'pending',
  complete: 'final',
  failed: 'dropped'
}

/**
 * Maps a raw daemon Entry onto WDK's normalized, chain-agnostic
 * TransactionReceipt shape.
 *
 * `success` is only meaningful once the entry has reached a terminal state --
 * pending entries haven't succeeded or failed yet, so it's left undefined.
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
 * A restricted, read-only view over an already-unlocked Wavelength daemon
 * connection. Wavelength has no keyless query mode -- balance()/list() need
 * an unlocked daemon -- so this always wraps the *same* client connection an
 * unlocked WalletAccountWavelength uses, rather than an independent one.
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
     * The shared, already-unlocked Wavelength client.
     *
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
   * Returns a fresh receive address for the account. Wavelength has no
   * stable receive address -- `deposit()` allocates a new on-chain boarding
   * address every call (standard Ark address-rotation), so this returns a
   * new address each time rather than caching one.
   *
   * @returns {Promise<string>} A fresh boarding address.
   */
  async getAddress () {
    const { address } = await this._client.deposit()
    return address
  }

  /**
   * Returns the account's bitcoin balance: confirmed funds, plus anything
   * committed to an outgoing send that hasn't finalized yet, plus unused
   * Ark credit-line capacity (spendable now via a credit-backed send).
   * Excludes unconfirmed incoming funds (not really "yours" until they
   * land) and credit already reserved against an in-flight payment (not
   * available to spend again).
   *
   * @returns {Promise<bigint>} The bitcoin balance (in satoshis).
   */
  async getBalance () {
    const balance = await this._client.balance()
    return BigInt(balance.confirmedSat) + BigInt(balance.pendingOutSat) + BigInt(balance.creditAvailableSat)
  }

  /**
   * Verifies a message's signature against the account's identity public key.
   * Runs entirely client-side via ECDSA/secp256k1 -- no daemon RPC beyond the
   * already-cached `identityPubKey` from `getInfo()`.
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
   * Returns the account balance for a specific token.
   *
   * Not implemented yet: Wavelength has no token support yet.
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
   * Quotes the cost of a transfer operation.
   *
   * Not implemented yet: Wavelength has no token support yet.
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
   * Returns an activity entry by id.
   *
   * Interim implementation, same caveat as `WalletAccountWavelength#getLightningReceiveRequest`:
   * lists recent activity and filters client-side until `InspectActivity` is exported.
   *
   * @param {string} hash - The activity entry's id.
   * @returns {Promise<import('@lightninglabs/wavelength-core').Entry | null>} The matching entry, or null if not found in the listed page.
   */
  async getTransactionReceipt (hash) {
    const { activity } = await this._client.list({ view: 'activity' })
    return activity?.entries.find((entry) => entry.id === hash) ?? null
  }

  /**
   * Returns a normalized, finality-based receipt for a transaction --
   * `getTransactionReceipt()`'s own list-and-filter logic, with the raw
   * Entry mapped onto WDK's chain-agnostic `TransactionReceipt` shape.
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
   * Previews unilateral-exit readiness for a set of VTXO outpoints --
   * funding requirements, feasibility, and recommended funding -- before
   * committing to `exit()`'s unilateral branch.
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
   * Drops the stopped daemon client and configuration references shared with
   * the owning account. The manager owns transport shutdown.
   *
   * @returns {void}
   */
  dispose () {
    this._client = null
    this._config = {}
  }
}
