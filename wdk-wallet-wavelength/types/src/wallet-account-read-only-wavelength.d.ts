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
export default class WalletAccountReadOnlyWavelength extends WalletAccountReadOnly implements IWalletAccountReadOnly {
    /**
     * Creates a new read-only Wavelength wallet account.
     *
     * @param {WavelengthClient} client - The already-started, unlocked Wavelength client this view shares.
     * @param {WavelengthWalletConfig} [config] - The configuration object.
     */
    constructor(client: WavelengthClient, config?: WavelengthWalletConfig);
    /**
     * The shared, already-unlocked Wavelength client.
     *
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
     * Returns the account balance for a specific token.
     *
     * Not implemented yet: Wavelength has no token support yet.
     *
     * @param {string} tokenAddress - The token's address.
     * @returns {Promise<never>} Never resolves; always throws.
     */
    getTokenBalance(tokenAddress: string): Promise<never>;
    /**
     * Quotes the cost of a transfer operation.
     *
     * Not implemented yet: Wavelength has no token support yet.
     *
     * @param {import('@tetherto/wdk-wallet').TransferOptions} options - The transfer's options.
     * @returns {Promise<never>} Never resolves; always throws.
     */
    quoteTransfer(options: import("@tetherto/wdk-wallet").TransferOptions): Promise<never>;
    /**
     * Returns an activity entry by id.
     *
     * Interim implementation, same caveat as `WalletAccountWavelength#getLightningReceiveRequest`:
     * lists recent activity and filters client-side until `InspectActivity` is exported.
     *
     * @param {string} hash - The activity entry's id.
     * @returns {Promise<import('@lightninglabs/wavelength-core').Entry | null>} The matching entry, or null if not found in the listed page.
     */
    getTransactionReceipt(hash: string): Promise<import("@lightninglabs/wavelength-core").Entry | null>;
    /**
     * Returns the daemon's current info (network, block height, wallet state, identity pubkey, ...).
     *
     * @returns {Promise<WalletInfo>} The daemon's info.
     */
    getInfo(): Promise<WalletInfo>;
    /**
     * Returns the daemon's current sync/connectivity status.
     *
     * @returns {Promise<WalletStatus>} The daemon's status.
     */
    status(): Promise<WalletStatus>;
    /**
     * Lists wallet activity, VTXOs, or on-chain outputs.
     *
     * @param {ListRequest} [options] - The list options.
     * @returns {Promise<ListResult>} The requested page.
     */
    list(options?: ListRequest): Promise<ListResult>;
    /**
     * Previews unilateral-exit readiness for a set of VTXO outpoints --
     * funding requirements, feasibility, and recommended funding -- before
     * committing to `exit()`'s unilateral branch.
     *
     * @param {GetExitPlanRequest} req - The outpoints to plan an exit for.
     * @returns {Promise<GetExitPlanResult>} The exit plan.
     */
    getExitPlan(req: GetExitPlanRequest): Promise<GetExitPlanResult>;
    /**
     * Queries the status of an in-progress exit for one VTXO outpoint.
     *
     * @param {ExitStatusRequest} req - The outpoint whose exit status is queried.
     * @returns {Promise<ExitStatusResult>} The exit's status.
     */
    exitStatus(req: ExitStatusRequest): Promise<ExitStatusResult>;
    /**
     * Summarizes every in-progress exit across the wallet.
     *
     * @param {ExitSummaryRequest} [req] - No arguments; the daemon reports the wallet-wide portfolio.
     * @returns {Promise<ExitSummaryResult>} The exit-portfolio summary.
     */
    exitSummary(req?: ExitSummaryRequest): Promise<ExitSummaryResult>;
    /**
     * Drops the stopped daemon client and configuration references shared with
     * the owning account. The manager owns transport shutdown.
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
export type GetExitPlanRequest = import("@lightninglabs/wavelength-core").GetExitPlanRequest;
export type GetExitPlanResult = import("@lightninglabs/wavelength-core").GetExitPlanResult;
export type ExitStatusRequest = import("@lightninglabs/wavelength-core").ExitStatusRequest;
export type ExitStatusResult = import("@lightninglabs/wavelength-core").ExitStatusResult;
export type ExitSummaryRequest = import("@lightninglabs/wavelength-core").ExitSummaryRequest;
export type ExitSummaryResult = import("@lightninglabs/wavelength-core").ExitSummaryResult;
export type TransactionReceipt = import("@tetherto/wdk-wallet").TransactionReceipt;
export type Finality = import("@tetherto/wdk-wallet").Finality;
export type WavelengthWalletConfig = import("./wallet-manager-wavelength.js").WavelengthWalletConfig;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
