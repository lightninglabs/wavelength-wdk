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
export default class WalletAccountWavelength extends WalletAccountReadOnlyWavelength implements IWalletAccount {
    /**
     * Creates a new Wavelength wallet account.
     *
     * @param {WavelengthClient} client - The already-started, unlocked Wavelength client.
     * @param {string} identityPubKey - The daemon's identity public key (hex), from `getInfo()` at unlock time. `keyPair` is a synchronous getter, so this can't be fetched lazily inside it.
     * @param {WavelengthWalletConfig} [config] - The configuration object.
     * @param {number} [index=0] - The external-seed account/daemon index.
     * @param {string} [path] - The external-seed derivation path.
     */
    constructor(client: WavelengthClient, identityPubKey: string, config?: WavelengthWalletConfig, index?: number, path?: string);
    /** @private */
    private _identityPubKey;
    /** @private */
    private _readOnlyAccount;
    /** @private */
    private _index;
    /** @private */
    private _path;
    /**
     * The derivation index selecting this complete daemon identity.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The derivation path of this account -- WDK's versioned BIP-85 path.
     *
     * @type {string}
     */
    get path(): string;
    /**
     * The account's key pair. `privateKey` is `null`, not merely absent --
     * Wavelength never exposes raw key material, and base
     * `WalletManager.dispose()` checks `account.keyPair?.privateKey` to decide
     * whether to dispose a cached account, so `null` makes it skip us safely.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /** @private */
    private get _identityPubKeyBytes();
    /**
     * Signs a message.
     *
     * Not available: Wavelength has no `MobileSignMessage` export.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<never>} Never resolves; always throws.
     */
    sign(message: string): Promise<never>;
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
    signTransaction(tx: WavelengthTransaction): Promise<never>;
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
    sendTransaction({ to, value, note, maxFeeSat, sweepAll }: WavelengthTransaction): Promise<TransactionResult>;
    /**
     * Throws unless a prepared send's quoted fee is known and within budget.
     *
     * @private
     * @param {PrepareSendResult} prepared - The prepareSend quote.
     * @param {number} [maxFeeSat] - The caller's fee cap, if any.
     */
    private _assertFeeWithinBudget;
    /**
     * Allocates a fresh on-chain boarding address for depositing bitcoin into
     * the wallet. Wavelength-specific addition, not part of base `IWalletAccount`.
     *
     * @param {import('@lightninglabs/wavelength-core').DepositRequest} [options] - The deposit options.
     * @returns {Promise<import('@lightninglabs/wavelength-core').DepositResult>} The boarding address and its initial activity entry.
     */
    getDepositAddress(options?: import("@lightninglabs/wavelength-core").DepositRequest): Promise<import("@lightninglabs/wavelength-core").DepositResult>;
    /**
     * Transfers a token to another address.
     *
     * Not implemented yet: Wavelength has no token support yet.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<never>} Never resolves; always throws.
     */
    transfer(options: TransferOptions): Promise<never>;
    /**
     * Creates a Lightning invoice for receiving payments.
     *
     * @param {LightningInvoiceOptions} options - The invoice options.
     * @returns {Promise<ReceiveResult>} The invoice and its initial wallet entry.
     */
    createLightningInvoice(options: LightningInvoiceOptions): Promise<ReceiveResult>;
    /**
     * Pays a Lightning invoice.
     *
     * Implemented as an explicit `prepareSend()` + `sendPrepared()` pair for
     * the same `maxFeeSat`-enforcement reason as `sendTransaction`.
     *
     * @param {PayLightningInvoiceOptions} options - The payment options.
     * @returns {Promise<SendResult>} The payment's result.
     */
    payLightningInvoice({ invoice, note, maxFeeSat }: PayLightningInvoiceOptions): Promise<SendResult>;
    /**
     * Quotes the fee for paying a Lightning invoice.
     *
     * @param {QuotePayLightningInvoiceOptions} options - The invoice to quote.
     * @returns {Promise<bigint>} The expected fee, in satoshis.
     */
    quotePayLightningInvoice({ invoice }: QuotePayLightningInvoiceOptions): Promise<bigint>;
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
    getLightningReceiveRequest(invoiceId: string): Promise<Entry | null>;
    /**
     * Gets a Lightning send request by id. See `getLightningReceiveRequest`'s
     * interim-implementation note; the same caveat applies here.
     *
     * @param {string} requestId - The id of the Lightning send request.
     * @returns {Promise<Entry | null>} The matching activity entry, or null if not found in the listed page.
     */
    getLightningSendRequest(requestId: string): Promise<Entry | null>;
    /**
     * Returns a read-only copy of the account, sharing this account's client
     * connection.
     *
     * @returns {Promise<WalletAccountReadOnlyWavelength>} The read-only account.
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyWavelength>;
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
    exit(req: ExitRequest): Promise<ExitResult>;
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
    sweepWallet(req: SweepWalletRequest): Promise<SweepWalletResult>;
}
export type WavelengthClient = import("@lightninglabs/wavelength-core").WavelengthClient;
export type PrepareSendResult = import("@lightninglabs/wavelength-core").PrepareSendResult;
export type SendResult = import("@lightninglabs/wavelength-core").SendResult;
export type ReceiveResult = import("@lightninglabs/wavelength-core").ReceiveResult;
export type Entry = import("@lightninglabs/wavelength-core").Entry;
export type ExitRequest = import("@lightninglabs/wavelength-core").ExitRequest;
export type ExitResult = import("@lightninglabs/wavelength-core").ExitResult;
export type SweepWalletRequest = import("@lightninglabs/wavelength-core").SweepWalletRequest;
export type SweepWalletResult = import("@lightninglabs/wavelength-core").SweepWalletResult;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type WavelengthWalletConfig = import("./wallet-manager-wavelength.js").WavelengthWalletConfig;
export type WavelengthTransaction = {
    /**
     * - The recipient's on-chain address.
     */
    to: string;
    /**
     * - The amount to send, in satoshis.
     */
    value: number | bigint;
    /**
     * - An optional note recorded with the activity.
     */
    note?: string;
    /**
     * - An optional cap on the fee, in satoshis; enforced client-side against the prepareSend quote before sending (see `sendTransaction`).
     */
    maxFeeSat?: number;
    /**
     * - When true, sweeps the entire spendable balance to `to` (value is ignored).
     */
    sweepAll?: boolean;
};
export type LightningInvoiceOptions = {
    /**
     * - The amount to request, in sats.
     */
    amountSat: number;
    /**
     * - An optional memo attached to the invoice.
     */
    memo?: string;
};
export type PayLightningInvoiceOptions = {
    /**
     * - The Lightning invoice to pay.
     */
    invoice: string;
    /**
     * - An optional note recorded with the activity.
     */
    note?: string;
    /**
     * - An optional cap on the fee, in satoshis; enforced client-side against the prepareSend quote before sending.
     */
    maxFeeSat?: number;
};
export type QuotePayLightningInvoiceOptions = {
    /**
     * - The Lightning invoice to quote.
     */
    invoice: string;
};
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
import WalletAccountReadOnlyWavelength from './wallet-account-read-only-wavelength.js';
