/**
 * Shares the owning account's client; there is no keyless query mode.
 *
 * @implements {IWalletAccountReadOnly}
 */
export default class WalletAccountReadOnlyWavelength extends WalletAccountReadOnly implements IWalletAccountReadOnly {
    /**
     * @param {WavelengthClient} client - The started, unlocked client this view shares.
     * @param {WavelengthWalletConfig} [config] - The configuration object.
     */
    constructor(client: WavelengthClient, config?: WavelengthWalletConfig);
    /**
     * @protected
     * @type {WavelengthClient}
     */
    protected _client: WavelengthClient;
    /**
     * @protected
     * @type {WavelengthWalletConfig}
     */
    protected _config: WavelengthWalletConfig;
    /**
     * @private
     * @type {Promise<string> | undefined}
     */
    private _addressPromise;
    /**
     * @protected
     * @type {(() => void) | undefined}
     */
    protected _unwatchActivity: (() => void) | undefined;
    /**
     * @returns {Promise<BalanceBreakdown>} The balance components, in satoshis.
     */
    getBalanceBreakdown(): Promise<BalanceBreakdown>;
    /**
     * Not implemented: there is no token support.
     *
     * @param {string} tokenAddress - The token address.
     * @returns {Promise<never>} Always throws.
     */
    getTokenBalance(tokenAddress: string): Promise<never>;
    /**
     * Not implemented: there is no token support.
     *
     * @param {import('@tetherto/wdk-wallet').TransferOptions} options - The transfer's options.
     * @returns {Promise<never>} Always throws.
     */
    quoteTransfer(options: import("@tetherto/wdk-wallet").TransferOptions): Promise<never>;
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
    protected _findActivityEntry(predicate: (entry: import("@lightninglabs/wavelength-core").Entry) => boolean, { kinds, maxPages }?: {
        kinds?: import("@lightninglabs/wavelength-core").EntryKind[];
        maxPages?: number;
    }): Promise<import("@lightninglabs/wavelength-core").Entry | null>;
    /**
     * Returns the raw activity entry; see `getTransaction` for WDK's shape.
     *
     * @param {string} hash - The entry id.
     * @returns {Promise<import('@lightninglabs/wavelength-core').Entry | null>} The matching entry, or null if it isn't within the scanned pages.
     */
    getTransactionReceipt(hash: string): Promise<import("@lightninglabs/wavelength-core").Entry | null>;
    /**
     * @returns {Promise<WalletInfo>} The daemon's info.
     */
    getInfo(): Promise<WalletInfo>;
    /**
     * @returns {Promise<WalletStatus>} The daemon's status.
     */
    status(): Promise<WalletStatus>;
    /**
     * @param {ListRequest} [options] - The list options.
     * @returns {Promise<ListResult>} The requested page.
     */
    list(options?: ListRequest): Promise<ListResult>;
    /**
     * Emits `'activity'` per changed entry and `'activityStream'` if the stream
     * ends or fails. A new watch replaces the previous one.
     *
     * @param {(event: ActivityEvent) => void} listener - Receives each event.
     * @param {ActivityStreamOptions} [options] - The stream's options.
     * @returns {Promise<() => void>} Stops the watch.
     */
    watchActivity(listener: (event: ActivityEvent) => void, options?: ActivityStreamOptions): Promise<() => void>;
    /**
     * @param {GetExitPlanRequest} req - The outpoints to plan an exit for.
     * @returns {Promise<GetExitPlanResult>} The exit plan.
     */
    getExitPlan(req: GetExitPlanRequest): Promise<GetExitPlanResult>;
    /**
     * @param {ExitStatusRequest} req - The outpoint to query.
     * @returns {Promise<ExitStatusResult>} The exit's status.
     */
    exitStatus(req: ExitStatusRequest): Promise<ExitStatusResult>;
    /**
     * @param {ExitSummaryRequest} [req] - Unused; the summary is wallet-wide.
     * @returns {Promise<ExitSummaryResult>} The exit-portfolio summary.
     */
    exitSummary(req?: ExitSummaryRequest): Promise<ExitSummaryResult>;
    /**
     * Drops shared references only; the manager owns transport shutdown.
     *
     * @returns {void}
     */
    dispose(): void;
}
export type WavelengthClient = import("@lightninglabs/wavelength-core").WavelengthClient;
export type WalletInfo = import("@lightninglabs/wavelength-core").WalletInfo;
export type WalletStatus = import("@lightninglabs/wavelength-core").WalletStatus;
export type ListRequest = import("@lightninglabs/wavelength-core").ListRequest;
export type ListResult = import("@lightninglabs/wavelength-core").ListResult;
export type BalanceBreakdown = {
    /**
     * - Self-custodied funds.
     */
    confirmed: bigint;
    /**
     * - Unconfirmed incoming funds.
     */
    pendingIn: bigint;
    /**
     * - Committed to unfinalized outgoing payments.
     */
    pendingOut: bigint;
    /**
     * - Spendable server credit.
     */
    creditAvailable: bigint;
    /**
     * - Server credit held for in-flight payments.
     */
    creditReserved: bigint;
};
export type GetExitPlanRequest = import("@lightninglabs/wavelength-core").GetExitPlanRequest;
export type GetExitPlanResult = import("@lightninglabs/wavelength-core").GetExitPlanResult;
export type ExitStatusRequest = import("@lightninglabs/wavelength-core").ExitStatusRequest;
export type ExitStatusResult = import("@lightninglabs/wavelength-core").ExitStatusResult;
export type ExitSummaryRequest = import("@lightninglabs/wavelength-core").ExitSummaryRequest;
export type ExitSummaryResult = import("@lightninglabs/wavelength-core").ExitSummaryResult;
export type ActivityStreamOptions = import("@lightninglabs/wavelength-core").ActivityStreamOptions;
export type ActivityEvent = Extract<import("@lightninglabs/wavelength-core").WavelengthEvent, {
    type: "activity" | "activityStream";
}>;
export type TransactionReceipt = import("@tetherto/wdk-wallet").TransactionReceipt;
export type Finality = import("@tetherto/wdk-wallet").Finality;
export type WavelengthWalletConfig = import("./wallet-manager-wavelength.js").WavelengthWalletConfig;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
