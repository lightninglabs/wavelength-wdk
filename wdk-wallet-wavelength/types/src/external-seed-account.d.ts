/**
 * @typedef {keyof typeof WAVELENGTH_ACCOUNT_NETWORK_IDS} WavelengthNetwork
 */
/**
 * @typedef {Object} DerivedWavelengthAccount
 * @property {Uint8Array} seedEntropy - Exactly 16 secret bytes for Wavelength's external-seed lifecycle.
 * @property {string} rootId - Stable, non-secret identifier shared by accounts under this root.
 */
/**
 * Derives one Wavelength daemon identity from the BIP-39 seed bytes retained by
 * the base WDK WalletManager. The fully hardened path is
 * `m/83696968'/1463899717'/network_id'/0'/account_index'`.
 *
 * The returned entropy is owned by the caller and must be cleared after the
 * daemon startup call completes.
 *
 * @param {Uint8Array} rootSeed - BIP-39 seed bytes (not mnemonic entropy).
 * @param {WavelengthNetwork} network - Wavelength network name.
 * @param {number} accountIndex - Account/daemon instance index.
 * @returns {DerivedWavelengthAccount}
 */
export function deriveWavelengthAccount(rootSeed: Uint8Array, network: WavelengthNetwork, accountIndex: number): DerivedWavelengthAccount;
/**
 * Builds the isolated daemon profile location for one account. `baseDataDir`
 * is a host-selected storage root and must not come from untrusted input.
 *
 * @param {string} baseDataDir - Host-selected base directory.
 * @param {string} rootId - Root identifier returned by deriveWavelengthAccount.
 * @param {WavelengthNetwork} network - Wavelength network name.
 * @param {number} accountIndex - Account/daemon instance index.
 * @returns {string}
 */
export function wavelengthAccountDataDir(baseDataDir: string, rootId: string, network: WavelengthNetwork, accountIndex: number): string;
/**
 * Returns the interoperable derivation path for one Wavelength account.
 *
 * @param {WavelengthNetwork} network - Wavelength network name.
 * @param {number} accountIndex - Account/daemon instance index.
 * @returns {string}
 */
export function wavelengthAccountDerivationPath(network: WavelengthNetwork, accountIndex: number): string;
/** The versioned WDK-owned namespace for external-seed account profiles. */
export const WAVELENGTH_ACCOUNT_NAMESPACE: "wavelength-bip85-wave-aezeed-v1";
/** Network component of the versioned, fully hardened account path. */
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
     * - Exactly 16 secret bytes for Wavelength's external-seed lifecycle.
     */
    seedEntropy: Uint8Array;
    /**
     * - Stable, non-secret identifier shared by accounts under this root.
     */
    rootId: string;
};
