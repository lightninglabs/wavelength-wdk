import { File, Paths } from 'expo-file-system'

// One JSON file holding the wallet's seed plus which account indices exist
// and which is active. Reloaded on every app launch to replay the same init
// sequence against a fresh worklet, which never persists this itself.
// Plaintext on disk, not Keychain/Keystore-backed -- fine for this demo app,
// not a pattern to copy for a real wallet.
const WALLET_META_FILENAME = 'wavelength-wallet-v1.json'

export function walletMetaFile() {
  return new File(Paths.document, WALLET_META_FILENAME)
}

// The worklet's init-wallet has no fallback defaults -- every field here
// must be supplied explicitly.
export const NETWORK_CONFIG = {
  network: 'signet',
  walletType: 'lwwallet',
  walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
  arkServerAddress: 'signet.wavelength.lightning.finance:443',
  swapServerAddress: 'swap.signet.wavelength.lightning.finance:443',
}
