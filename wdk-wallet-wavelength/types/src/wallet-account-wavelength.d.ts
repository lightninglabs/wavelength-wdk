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
export default class WalletAccountWavelength extends WalletAccountReadOnlyWavelength implements IWalletAccount {
    /**
     * @param {WavelengthClient} client - The started, unlocked client.
     * @param {string} identityPubKey - Daemon identity pubkey (hex); `keyPair` is synchronous, so it can't be fetched lazily.
     * @param {WavelengthWalletConfig} [config] - The configuration object.
     * @param {number} [index=0] - Account index.
     * @param {string} [path] - Derivation path.
     * @param {boolean} [imported=false] - Whether this open created a new local profile.
     */
    constructor(client: WavelengthClient, identityPubKey: string, config?: WavelengthWalletConfig, index?: number, path?: string, imported?: boolean);
    /** @private */
    private _identityPubKey;
    /** @private */
    private _readOnlyAccount;
    /** @private */
    private _index;
    /** @private */
    private _path;
    /** @private */
    private _imported;
    /**
     * @type {number}
     */
    get index(): number;
    /**
     * @type {string}
     */
    get path(): string;
    /**
     * @type {boolean}
     */
    get imported(): boolean;
    /**
     * `privateKey` is `null`, not absent: base `WalletManager.dispose()` skips
     * accounts whose `keyPair?.privateKey` is null.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /** @private */
    private get _identityPubKeyBytes();
    /**
     * Not available on Wavelength.
     *
     * @param {string} message - The message.
     * @returns {Promise<never>} Always throws.
     */
    sign(message: string): Promise<never>;
    /**
     * Not supported: there is no sign-without-broadcast primitive.
     *
     * @param {WavelengthTransaction} tx - The transaction.
     * @returns {Promise<never>} Always throws.
     */
    signTransaction(tx: WavelengthTransaction): Promise<never>;
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
    sendTransaction({ to, value, note, maxFeeSat, sweepAll }: WavelengthTransaction): Promise<TransactionResult>;
    /**
     * An unknown fee is fatal only when `maxFeeSat` is set.
     *
     * @private
     * @param {PrepareSendResult} prepared - The prepareSend quote.
     * @param {number} [maxFeeSat] - The caller's fee cap, if any.
     */
    private _assertFeeWithinBudget;
    /**
     * Allocates a fresh on-chain boarding address.
     *
     * @param {import('@lightninglabs/wavelength-core').DepositRequest} [options] - The deposit options.
     * @returns {Promise<import('@lightninglabs/wavelength-core').DepositResult>} The boarding address and its initial activity entry.
     */
    getDepositAddress(options?: import("@lightninglabs/wavelength-core").DepositRequest): Promise<import("@lightninglabs/wavelength-core").DepositResult>;
    /**
     * Not implemented: no token support.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @returns {Promise<never>} Always throws.
     */
    transfer(options: TransferOptions): Promise<never>;
    /**
     * Creates a Lightning invoice.
     *
     * @param {LightningInvoiceOptions} options - The invoice options.
     * @returns {Promise<ReceiveResult>} The invoice and its initial wallet entry.
     */
    createLightningInvoice(options: LightningInvoiceOptions): Promise<ReceiveResult>;
    /**
     * Pays a Lightning invoice.
     *
     * @param {PayLightningInvoiceOptions} options - The payment options.
     * @returns {Promise<SendResult>} The payment's result.
     */
    payLightningInvoice({ invoice, note, maxFeeSat }: PayLightningInvoiceOptions): Promise<SendResult>;
    /**
     * Quotes the fee for paying an invoice.
     *
     * @param {QuotePayLightningInvoiceOptions} options - The invoice to quote.
     * @returns {Promise<bigint>} The expected fee, in satoshis.
     */
    quotePayLightningInvoice({ invoice }: QuotePayLightningInvoiceOptions): Promise<bigint>;
    /**
     * Scans the paged `receive` feed; the daemon has no lookup by id.
     *
     * @param {string} invoiceId - The entry id.
     * @returns {Promise<Entry | null>} The matching activity entry, or null if not found in the listed page.
     */
    getLightningReceiveRequest(invoiceId: string): Promise<Entry | null>;
    /**
     * Scans the paged `send` feed; the daemon has no lookup by id.
     *
     * @param {string} requestId - The entry id.
     * @returns {Promise<Entry | null>} The matching activity entry, or null if not found in the listed page.
     */
    getLightningSendRequest(requestId: string): Promise<Entry | null>;
    /**
     * @returns {Promise<WalletAccountReadOnlyWavelength>} The read-only account.
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyWavelength>;
    /**
     * Exits one VTXO: `destination` for a cooperative leave, or `forceUnrollAck`
     * for a forced on-chain unroll. The two are mutually exclusive.
     *
     * @param {ExitRequest} req - The outpoint to exit, and which branch to take.
     * @returns {Promise<ExitResult>} The exit's result; see `ExitResult.path` to discriminate the outcome.
     */
    exit(req: ExitRequest): Promise<ExitResult>;
    /**
     * Previews (default) or, with `broadcast: true`, broadcasts a sweep to
     * `destinationAddress`. Broadcasting moves funds: show the preview's
     * `estimatedFeeSat`/`netAmountSat` first.
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
     * - On-chain address.
     */
    to: string;
    /**
     * - Amount in satoshis.
     */
    value: number | bigint;
    /**
     * - Note recorded with the activity.
     */
    note?: string;
    /**
     * - Fee cap in satoshis, checked against the quote before sending.
     */
    maxFeeSat?: number;
    /**
     * - Sends the entire spendable balance; `value` is ignored.
     */
    sweepAll?: boolean;
};
export type LightningInvoiceOptions = {
    /**
     * - Amount in sats.
     */
    amountSat: number;
    /**
     * - Memo attached to the invoice.
     */
    memo?: string;
};
export type PayLightningInvoiceOptions = {
    /**
     * - Invoice to pay.
     */
    invoice: string;
    /**
     * - Note recorded with the activity.
     */
    note?: string;
    /**
     * - Fee cap in satoshis, checked against the quote before sending.
     */
    maxFeeSat?: number;
};
export type QuotePayLightningInvoiceOptions = {
    /**
     * - Invoice to quote.
     */
    invoice: string;
};
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
import WalletAccountReadOnlyWavelength from './wallet-account-read-only-wavelength.js';
