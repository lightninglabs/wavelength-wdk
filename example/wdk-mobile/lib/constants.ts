import { File, Paths } from 'expo-file-system'

// Replayed on every launch because the worklet never persists this itself.
// Plaintext on disk, not Keychain/Keystore-backed: demo only.
const WALLET_META_FILENAME = 'wavelength-wallet-v1.json'

export function walletMetaFile() {
  return new File(Paths.document, WALLET_META_FILENAME)
}

// init-wallet has no fallback defaults; every field is required.
export const NETWORK_CONFIG = {
  network: 'signet',
  walletType: 'lwwallet',
  walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
  arkServerAddress: 'signet.wavelength.lightning.finance:443',
  swapServerAddress: 'swap.signet.wavelength.lightning.finance:443',
}
