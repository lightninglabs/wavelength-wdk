/**
 * Integration tests for WalletManagerWavelength against the public Signet
 * deployment.
 *
 * Wavelength has no client transport drivable from plain `node`/Jest: the
 * Bare native addon only exists inside a Bare/Pear runtime, and the Node
 * "default" transport (`@lightninglabs/wavelength-web`) is actually
 * browser-only (touches `document`, OPFS, no Node fallback). This suite
 * documents the intended coverage but self-skips under headless Node
 * instead of failing confusingly on "document is not defined".
 *
 * Run with: npm run test:integration (once a Node-capable transport exists)
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import WalletManagerWavelength from '../index.js'

// True only in a DOM-capable Jest environment (e.g. testEnvironment:
// 'jsdom'), which this package doesn't configure -- so this suite is
// skipped by default, on purpose.
const CAN_RUN = typeof document !== 'undefined'

const NETWORK = 'signet'

// BIP-39's public test vector, never a production wallet.
const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon about'

const WALLET_CONFIG = {
  network: NETWORK,
  walletType: 'lwwallet',
  walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
  arkServerAddress: 'signet.wavelength.lightning.finance:443',
  swapServerAddress: 'swap.signet.wavelength.lightning.finance:443'
}

;(CAN_RUN ? describe : describe.skip)('WalletManagerWavelength Integration Tests (Signet)', () => {
  let wallet

  beforeAll(async () => {
    const os = await import('node:os')
    const fs = await import('node:fs')
    const path = await import('node:path')

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wdk-wallet-wavelength-manager-'))
    wallet = new WalletManagerWavelength(SEED_PHRASE, { ...WALLET_CONFIG, dataDir })
  })

  afterAll(async () => {
    wallet?.dispose()
  })

  describe('Wallet Manager Initialization', () => {
    test('should create wallet manager with an external seed', () => {
      expect(wallet).toBeDefined()
    })
  })

  describe('Account Management', () => {
    test('should get account at index 0', async () => {
      const account = await wallet.getAccount(0)

      expect(account).toBeDefined()
      expect(account.index).toBe(0)
    })

    test('should get an independently derived account at a different index', async () => {
      const account = await wallet.getAccount(1)

      expect(account).toBeDefined()
      expect(account.index).toBe(1)
      expect(account.path).toBe("m/83696968'/1463899717'/2'/0'/1'")
    })

    test('should get the same account instance for the same index', async () => {
      const account1 = await wallet.getAccount(0)
      const account2 = await wallet.getAccount(0)

      expect(account1).toBe(account2)
    })
  })

  describe('Network Configuration', () => {
    test('should use the signet network', async () => {
      const account = await wallet.getAccount(0)
      const info = await account.getInfo()

      expect(info.network).toBe(NETWORK)
    })
  })

  describe('Fee Rates', () => {
    test('should estimate fee rates', async () => {
      const rates = await wallet.getFeeRates()

      expect(typeof rates.normal).toBe('bigint')
      expect(typeof rates.fast).toBe('bigint')
    })
  })
})
