/**
 * Manages a Wavelength (self-custodial Lightning/Ark) wallet.
 *
 * Every account is derived from a BIP-39 phrase or raw seed: each account
 * index selects a complete Wavelength daemon identity and isolated profile.
 * WDK derives 16 bytes of BIP-85 entropy and owns the versioned
 * network/root/index directory layout; Wavelength receives only that final
 * directory and already-derived entropy.
 */
export default class WalletManagerWavelength extends WalletManager {
    /**
     * Creates a new wallet manager for Wavelength.
     *
     * Owns a copy of the mutable seed input (rather than the caller's own
     * reference) so `close()` can wipe it without mutating memory that still
     * belongs to the caller.
     *
     * @param {string | Uint8Array} seedOrSigner - A BIP-39 phrase or raw seed. Every account is derived from it.
     * @param {WavelengthWalletConfig} config - Runtime and wallet configuration. Requires explicit `network` and base `dataDir`.
     */
    constructor(seedOrSigner: string | Uint8Array, config?: WavelengthWalletConfig);
    /**
     * Same object as the base class's `this._config`, typed as the wider
     * Wavelength-specific shape instead of the base's narrower `WalletConfig`.
     *
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
     * Starts one externally seeded daemon at its final WDK-selected profile.
     * Every account receives its own transport/client; the transport decides
     * how to isolate the daemon runtime on its platform.
     *
     * The client is published to `_clients` before the cancellable external
     * open runs, and `_closed` is re-checked right after -- so `close()` can
     * race a hung start with `stop()` instead of losing the client.
     *
     * On failure, Wavelength atomically stops a daemon whose external-seed
     * startup failed. If `close()` already claimed the client from `_clients`,
     * it owns stop+dispose; otherwise this removes and disposes it directly.
     *
     * @private
     * @param {number} index
     * @param {ExternalSeedAccountOptions} options
     * @returns {Promise<WalletAccountWavelength>}
     */
    private _bootExternalAccount;
    /**
     * Returns one complete Wavelength account/daemon instance. Every valid
     * index is derived independently from the manager's seed and cached.
     *
     * Wavelength has no named-signer registry, so `options.signerName` is
     * always rejected rather than silently ignored.
     *
     * `_accountPromises` is populated before the boot promise's first `await`,
     * so concurrent callers for one index share exactly one daemon boot.
     *
     * @param {number | string} [index] - The index of the account to get (default: 0).
     * @param {ExternalSeedAccountOptions} [options] - Account-open options. Named signers are not supported.
     * @returns {Promise<WalletAccountWavelength>} The account.
     */
    getAccount(index?: number | string, options?: ExternalSeedAccountOptions): Promise<WalletAccountWavelength>;
    /**
     * Stops and disposes one account's daemon without closing the whole
     * manager or the other accounts it has open.
     *
     * Required before switching to (or adding) a different account on
     * iOS/Android, where only one embedded daemon can be active per process.
     * The desktop/WASM transport has no such limit -- each account gets its
     * own isolated instance.
     *
     * A no-op if the index was never opened (or was already closed). Waits for
     * an in-flight boot to settle first, so a late successful start doesn't
     * leave an orphaned daemon behind.
     *
     * @param {number} index
     * @returns {Promise<void>}
     */
    closeAccount(index: number): Promise<void>;
    /**
     * Returns the wallet account at a specific derivation path.
     *
     * Not supported: no derivation-path concept exists anywhere in the mobile
     * facade (`RuntimeConfig`/`CreateWalletRequest`/`UnlockWalletRequest`).
     *
     * @param {string} path - The derivation path.
     * @param {Object} [options] - Account options.
     * @param {string} [options.signerName] - Not supported on Wavelength; unused, this method always throws regardless.
     * @returns {Promise<never>} Never resolves; always throws.
     */
    getAccountByPath(path: string, options?: {
        signerName?: string;
    }): Promise<never>;
    /**
     * Stops every daemon and then disposes its transport. Await this in hosts
     * that need database shutdown and worker termination to finish before exit.
     *
     * The seed is wiped immediately, before daemon shutdown (which can take a
     * while, or hang). Every already-published client starts stopping right
     * away too, racing any still-in-flight startup rather than waiting for it,
     * then any client that completed during that wait is caught in a second
     * pass. `super.dispose()`'s per-account cleanup is a no-op for us (raw
     * private keys never leave the daemons), so each account's `dispose()` is
     * called explicitly here instead.
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
     * - Run server-assisted state recovery for this account open. Defaults to false.
     */
    recoverState?: boolean;
    /**
     * - Per-key-family recovery look-ahead. Only meaningful when `recoverState` is true.
     */
    recoveryWindow?: number;
    /**
     * - Directory containing the Wavewalletdk WASM runtime assets (`wavewalletdk.wasm`, `wasm_exec.js`, `sqlite-bridge.js`, ...). Only used on desktop/server Bare platforms (`darwin`/`linux`/`win32`); ignored on iOS.
     */
    wasmRuntimeDir?: string;
};
export type WavelengthWalletConfig = RuntimeConfig & WavelengthWalletOptions;
export type ExternalSeedAccountOptions = {
    /**
     * - Optional persisted daemon identity to verify for this account index; pass it to getAccount(), not the manager config.
     */
    expectedIdentityPubKey?: string;
    /**
     * - Run state recovery for this account open.
     */
    recoverState?: boolean;
    /**
     * - Per-key-family recovery look-ahead.
     */
    recoveryWindow?: number;
    /**
     * - Unsupported base-WDK signer selector.
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
    }>;
};
/**
 * Structural external-seed capability used until the low-level lifecycle is
 * available in the next published wavelength-core declarations.
 */
export type ExternalSeedWavelengthClient = WavelengthClient & ExternalSeedLifecycle;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountWavelength from './wallet-account-wavelength.js';
