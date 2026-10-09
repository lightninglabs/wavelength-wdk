'use strict'

import { HDKey } from '@scure/bip32'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { ValueError } from '@tetherto/wdk-wallet'

export const WAVELENGTH_ACCOUNT_NAMESPACE = 'wavelength-bip85-wave-aezeed-v1'

const HARDENED_OFFSET = 0x80000000
const BIP85_PURPOSE = 83696968
const WAVE_APPLICATION = 1463899717
const BIP85_HMAC_KEY = utf8ToBytes('bip-entropy-from-k')
const ROOT_ID_DOMAIN = utf8ToBytes('wavelength:bip85-wave-root-id:v1')

export const WAVELENGTH_ACCOUNT_NETWORK_IDS = Object.freeze({
  mainnet: 0,
  regtest: 1,
  signet: 2,
  testnet: 3,
  testnet4: 4
})

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
export function deriveWavelengthAccount (rootSeed, network, accountIndex) {
  if (!(rootSeed instanceof Uint8Array) || rootSeed.length < 16 || rootSeed.length > 64) {
    throw new ValueError('rootSeed must be a 16..64-byte Uint8Array')
  }

  validateDerivationIndex(accountIndex)
  const networkId = wavelengthAccountNetworkId(network)
  if (networkId === undefined) {
    throw new ValueError(unsupportedNetworkMessage(network))
  }

  let root
  let purpose
  let application
  let networkNode
  let role
  let account
  let entropy
  let rootDigest
  let leafPrivateKey

  try {
    root = HDKey.fromMasterSeed(rootSeed)
    purpose = root.deriveChild(hardened(BIP85_PURPOSE))
    application = purpose.deriveChild(hardened(WAVE_APPLICATION))

    const applicationPublicKey = application.publicKey
    if (applicationPublicKey === null) {
      throw new Error('WAVE application node has no public key')
    }

    rootDigest = sha256.create()
      .update(ROOT_ID_DOMAIN)
      .update(applicationPublicKey)
      .digest()
    const rootId = bytesToHex(rootDigest.subarray(0, 16))

    networkNode = application.deriveChild(hardened(networkId))
    role = networkNode.deriveChild(hardened(0))
    account = role.deriveChild(hardened(accountIndex))

    leafPrivateKey = account.privateKey ?? undefined
    if (leafPrivateKey === undefined) {
      throw new Error('Wavelength account node has no private key')
    }

    entropy = hmac(sha512, BIP85_HMAC_KEY, leafPrivateKey)

    return {
      seedEntropy: entropy.slice(0, 16),
      rootId
    }
  } finally {
    entropy?.fill(0)
    rootDigest?.fill(0)
    leafPrivateKey?.fill(0)
    wipeHDKey(account)
    wipeHDKey(role)
    wipeHDKey(networkNode)
    wipeHDKey(application)
    wipeHDKey(purpose)
    wipeHDKey(root)
  }
}

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
export function wavelengthAccountDataDir (baseDataDir, rootId, network, accountIndex) {
  if (typeof baseDataDir !== 'string' || baseDataDir.trim() === '') {
    throw new ValueError('a nonempty base dataDir is required for Wavelength accounts')
  }
  if (typeof rootId !== 'string' || !/^[0-9a-f]{32}$/.test(rootId)) {
    throw new ValueError('rootId must be exactly 32 lowercase hexadecimal characters')
  }
  if (wavelengthAccountNetworkId(network) === undefined) {
    throw new ValueError(unsupportedNetworkMessage(network))
  }
  validateDerivationIndex(accountIndex)

  const trimmedBase = baseDataDir.replace(/\/+$/, '')
  const suffix = [
    'accounts',
    WAVELENGTH_ACCOUNT_NAMESPACE,
    rootId,
    network,
    String(accountIndex)
  ].join('/')

  return trimmedBase === '' ? `/${suffix}` : `${trimmedBase}/${suffix}`
}

/**
 * @param {WavelengthNetwork} network - Network name.
 * @param {number} accountIndex - Account index.
 * @returns {string}
 */
export function wavelengthAccountDerivationPath (network, accountIndex) {
  const networkId = wavelengthAccountNetworkId(network)
  if (networkId === undefined) {
    throw new ValueError(unsupportedNetworkMessage(network))
  }
  validateDerivationIndex(accountIndex)

  return `m/${BIP85_PURPOSE}'/${WAVE_APPLICATION}'/${networkId}'/0'/${accountIndex}'`
}

function hardened (index) {
  return HARDENED_OFFSET + index
}

function wavelengthAccountNetworkId (network) {
  if (typeof network !== 'string' || !Object.hasOwn(WAVELENGTH_ACCOUNT_NETWORK_IDS, network)) {
    return undefined
  }

  return WAVELENGTH_ACCOUNT_NETWORK_IDS[network]
}

function unsupportedNetworkMessage (network) {
  const value = typeof network === 'string' ? network : typeof network
  return `unsupported Wavelength account network: ${value}`
}

function validateDerivationIndex (accountIndex) {
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0 || accountIndex >= HARDENED_OFFSET) {
    throw new ValueError('accountIndex must be an integer in 0..0x7fffffff')
  }
}

function wipeHDKey (key) {
  if (key === undefined) return

  key.wipePrivateData()
  key.chainCode?.fill(0)
}
