import { describe, expect, it } from '@jest/globals'

import {
  WAVELENGTH_ACCOUNT_NAMESPACE,
  WAVELENGTH_ACCOUNT_NETWORK_IDS,
  deriveWavelengthAccount,
  wavelengthAccountDataDir,
  wavelengthAccountDerivationPath
} from '../src/external-seed-account.js'

// BIP-39's canonical "abandon ... about" + "TREZOR" seed. Keeping the
// already-derived root bytes here makes these vectors test WDK's BIP-85/WAVE
// layer only, independently of whichever BIP-39 package the base manager uses.
const ROOT_SEED = Buffer.from(
  'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e534955' +
  '31f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
  'hex'
)

function hex (bytes) {
  return Buffer.from(bytes).toString('hex')
}

describe('external-seed Wavelength accounts', () => {
  it('matches the versioned WAVE BIP-85 golden vectors', () => {
    const vectors = [
      ['mainnet', 0, '5f1d150a8cbe6e1c6c879e55892ce9d2'],
      ['regtest', 0, '076d8d4f8670b38a0101fd1625e8d7c6'],
      ['signet', 7, '1678c8f0e45c85695f2264cf62db6fcc'],
      ['testnet', 0, '0694d0bb4c37ec553b20f2f615c7cc27'],
      ['testnet4', 0x7fffffff, '78f18ab49e21b1052d904caeddb0312e']
    ]

    for (const [network, accountIndex, expectedEntropy] of vectors) {
      const derived = deriveWavelengthAccount(ROOT_SEED, network, accountIndex)
      expect(derived.rootId).toBe('876cbd30abcd8c1bc185923cad9a0536')
      expect(hex(derived.seedEntropy)).toBe(expectedEntropy)
      derived.seedEntropy.fill(0)
    }
  })

  it('pins the network map, paths, and profile namespace', () => {
    expect(WAVELENGTH_ACCOUNT_NETWORK_IDS).toEqual({
      mainnet: 0,
      regtest: 1,
      signet: 2,
      testnet: 3,
      testnet4: 4
    })
    expect(WAVELENGTH_ACCOUNT_NAMESPACE).toBe('wavelength-bip85-wave-aezeed-v1')
    expect(wavelengthAccountDerivationPath('signet', 7))
      .toBe("m/83696968'/1463899717'/2'/0'/7'")
    expect(wavelengthAccountDerivationPath('testnet4', 0x7fffffff))
      .toBe("m/83696968'/1463899717'/4'/0'/2147483647'")
  })

  it('builds distinct versioned profiles for roots, networks, and indices', () => {
    const rootIds = [
      '0123456789abcdef0123456789abcdef',
      'abcdef0123456789abcdef0123456789'
    ]
    const paths = new Set()

    for (const rootId of rootIds) {
      for (const network of Object.keys(WAVELENGTH_ACCOUNT_NETWORK_IDS)) {
        for (const index of [0, 1, 0x7fffffff]) {
          paths.add(wavelengthAccountDataDir('/wavelength/', rootId, network, index))
        }
      }
    }

    expect(paths.size).toBe(30)
    expect(paths).toContain(
      '/wavelength/accounts/wavelength-bip85-wave-aezeed-v1/' +
      '0123456789abcdef0123456789abcdef/signet/1'
    )
  })

  it('rejects traversal, inherited network keys, and invalid indices', () => {
    const rootId = '0123456789abcdef0123456789abcdef'

    expect(() => wavelengthAccountDataDir('/wavelength', '../../other', 'regtest', 0))
      .toThrow(/rootId/)
    expect(() => wavelengthAccountDataDir('/wavelength', rootId, '__proto__', 0))
      .toThrow(/network/)
    expect(() => wavelengthAccountDerivationPath('constructor', 0))
      .toThrow(/network/)
    expect(() => wavelengthAccountDataDir('/wavelength', rootId, 'regtest', -1))
      .toThrow(/accountIndex/)
    expect(() => wavelengthAccountDataDir('/wavelength', rootId, 'regtest', 0x80000000))
      .toThrow(/accountIndex/)
    expect(() => deriveWavelengthAccount(new Uint8Array(15), 'regtest', 0))
      .toThrow(/16\.\.64-byte/)
  })
})
