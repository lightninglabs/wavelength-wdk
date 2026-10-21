/**
 * @typedef {keyof typeof WAVELENGTH_ACCOUNT_NETWORK_IDS} WavelengthNetwork
 */
/**
 * @typedef {Object} DerivedWavelengthAccount
 * @property {Uint8Array} seedEntropy - 16 secret bytes.
 * @property {string} rootId - Non-secret; shared by accounts under one root.
 */
/**
 * Derives a daemon identity at `m/83696968'/1463899717'/network_id'/0'/account_index'`.
 *
 * The caller owns the returned entropy and must zero it after daemon startup.
 *
 * @param {Uint8Array} rootSeed - BIP-39 seed bytes (not mnemonic entropy).
 * @param {WavelengthNetwork} network - Network name.
 * @param {number} accountIndex - Account index.
 * @returns {DerivedWavelengthAccount}
 */
export function deriveWavelengthAccount(rootSeed: Uint8Array, network: WavelengthNetwork, accountIndex: number): DerivedWavelengthAccount;
/**
 * Builds the per-account daemon profile path. `baseDataDir` must not come from
 * untrusted input.
 *
 * @param {string} baseDataDir - Base directory.
 * @param {string} rootId - From deriveWavelengthAccount.
 * @param {WavelengthNetwork} network - Network name.
 * @param {number} accountIndex - Account index.
 * @returns {string}
 */
export function wavelengthAccountDataDir(baseDataDir: string, rootId: string, network: WavelengthNetwork, accountIndex: number): string;
/**
 * @param {WavelengthNetwork} network - Network name.
 * @param {number} accountIndex - Account index.
 * @returns {string}
 */
export function wavelengthAccountDerivationPath(network: WavelengthNetwork, accountIndex: number): string;
export const WAVELENGTH_ACCOUNT_NAMESPACE: "wavelength-bip85-wave-aezeed-v1";
export const WAVELENGTH_ACCOUNT_NETWORK_IDS: Readonly<{
    mainnet: 0;
    regtest: 1;
    signet: 2;
    testnet: 3;
    testnet4: 4;
}>;
export type WavelengthNetwork = keyof typeof WAVELENGTH_ACCOUNT_NETWORK_IDS;
export type DerivedWavelengthAccount = {
    /**
     * - 16 secret bytes.
     */
    seedEntropy: Uint8Array;
    /**
     * - Non-secret; shared by accounts under one root.
     */
    rootId: string;
};
