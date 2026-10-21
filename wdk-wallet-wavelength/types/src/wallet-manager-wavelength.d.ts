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
    constructor(seedOrSigner: string | Uint8Array, config?: WavelengthWalletConfig);
    /**
     * @private
     * @type {WavelengthWalletConfig}
     */
    private _wavelengthConfig;
    /** @private @type {Map<number, Promise<WalletAccountWavelength>>} */
    private _accountPromises;
    /** @private @type {Map<number, WavelengthClient>} */
    private _clients;
    /** @private @type {Map<number, ExternalSeedAccountOptions>} */
    private _accountOptions;
    /** @private @type {Promise<void> | undefined} */
    private _closePromise;
    /** @private */
    private _closed;
    /**
     * The client is published to `_clients` before the open so `close()` can stop
     * a hung start; whoever claims it from `_clients` first owns stop+dispose.
     *
     * @private
     * @param {number} index
     * @param {ExternalSeedAccountOptions} options
     * @returns {Promise<WalletAccountWavelength>}
     */
    private _bootExternalAccount;
    /**
     * `_accountPromises` is populated before the boot's first `await`, so
     * concurrent callers for one index share one daemon boot.
     *
     * @param {number | string} [index] - The account index (default: 0).
     * @param {ExternalSeedAccountOptions} [options] - Account-open options.
     * @returns {Promise<WalletAccountWavelength>} The account.
     */
    getAccount(index?: number | string, options?: ExternalSeedAccountOptions): Promise<WalletAccountWavelength>;
    /**
     * Required before opening another account on iOS/Android, where only one
     * embedded daemon can run per process.
     *
     * Waits for an in-flight boot first, so a late start can't orphan a daemon.
     *
     * @param {number} index
     * @returns {Promise<void>}
     */
    closeAccount(index: number): Promise<void>;
    /**
     * Not supported.
     *
     * @param {string} path - The derivation path.
     * @param {Object} [options] - Account options.
     * @param {string} [options.signerName] - Unused.
     * @returns {Promise<never>} Always throws.
     */
    getAccountByPath(path: string, options?: {
        signerName?: string;
    }): Promise<never>;
    /**
     * Await this in hosts that need database shutdown to finish before exit.
     *
     * The seed is wiped first, since shutdown can hang. A second pass stops
     * clients that finished starting meanwhile. `super.dispose()` skips our
     * accounts (null `privateKey`), so each is disposed explicitly.
     *
     * @returns {Promise<void>}
     */
    close(): Promise<void>;
}
export type RuntimeConfig = import("@lightninglabs/wavelength-core").RuntimeConfig;
export type WavelengthClient = import("@lightninglabs/wavelength-core").WavelengthClient;
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
export type WavelengthWalletOptions = {
    /**
     * - Run server-assisted state recovery on open. Defaults to false.
     */
    recoverState?: boolean;
    /**
     * - Per-key-family recovery look-ahead; only used when `recoverState` is true.
     */
    recoveryWindow?: number;
    /**
     * - Directory of the WASM runtime assets. Only used on desktop/server Bare (`darwin`/`linux`/`win32`); ignored on iOS.
     */
    wasmRuntimeDir?: string;
};
export type WavelengthWalletConfig = RuntimeConfig & WavelengthWalletOptions;
export type ExternalSeedAccountOptions = {
    /**
     * - Daemon identity to verify; pass to getAccount(), not the manager config.
     */
    expectedIdentityPubKey?: string;
    /**
     * - Run state recovery on open.
     */
    recoverState?: boolean;
    /**
     * - Per-key-family recovery look-ahead.
     */
    recoveryWindow?: number;
    /**
     * - Always rejected.
     */
    signerName?: string;
};
export type ExternalSeedLifecycle = {
    startExternalSeedWallet: (config: RuntimeConfig, req: {
        seedEntropy: Uint8Array;
        expectedIdentityPubKey?: string;
        recoverState?: boolean;
        recoveryWindow?: number;
    }) => Promise<{
        identityPubKey: string;
        imported: boolean;
    }>;
};
export type ExternalSeedWavelengthClient = WavelengthClient & ExternalSeedLifecycle;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountWavelength from './wallet-account-wavelength.js';
