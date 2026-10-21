/**
 * Integration tests for WalletAccountWavelength against the public Signet
 * deployment. Self-skips under plain `node`/Jest; see
 * wallet-manager-wavelength.integration.test.js.
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import WalletManagerWavelength from '../index.js'

const CAN_RUN = typeof document !== 'undefined'

const NETWORK = 'signet'

// Each dataDir gets its own account 0 identity, so the two wallets don't
// collide despite sharing this seed.
const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon about'

const WALLET_CONFIG = {
  network: NETWORK,
  walletType: 'lwwallet',
  walletEsploraUrl: 'https://mempool-signet.testnet.lightningcluster.com/api',
  arkServerAddress: 'signet.wavelength.lightning.finance:443',
  swapServerAddress: 'swap.signet.wavelength.lightning.finance:443'
}

;(CAN_RUN ? describe : describe.skip)('WalletAccountWavelength Integration Tests (Signet)', () => {
  let wallet1
  let wallet2
  let account1
  let account2

  beforeAll(async () => {
    const os = await import('node:os')
    const fs = await import('node:fs')
    const path = await import('node:path')

    const dataDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'wdk-wallet-wavelength-account1-'))
    const dataDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wdk-wallet-wavelength-account2-'))

    wallet1 = new WalletManagerWavelength(SEED_PHRASE, { ...WALLET_CONFIG, dataDir: dataDir1 })
    wallet2 = new WalletManagerWavelength(SEED_PHRASE, { ...WALLET_CONFIG, dataDir: dataDir2 })

    account1 = await wallet1.getAccount(0)
    account2 = await wallet2.getAccount(0)
  })

  afterAll(async () => {
    wallet1?.dispose()
    wallet2?.dispose()
  })

  describe('Wallet Initialization', () => {
    test('should initialize wallet and get account', async () => {
      expect(account1).toBeDefined()
      expect(account1.index).toBe(0)
    })

    test('should expose its BIP-85 derivation path', () => {
      expect(account1.path).toBe("m/83696968'/1463899717'/2'/0'/0'")
    })

    test('should have an identity public key, but no private key', () => {
      const { publicKey, privateKey } = account1.keyPair

      expect(publicKey).toBeInstanceOf(Uint8Array)
      expect(publicKey.length).toBeGreaterThan(0)
      expect(privateKey).toBeNull()
    })
  })

  describe('Address Generation', () => {
    test('should allocate a fresh boarding address for each receive call', async () => {
      const address1 = await account1.getAddress()
      const address2 = await account1.getAddress()

      expect(typeof address1).toBe('string')
      expect(address1.length).toBeGreaterThan(0)
      expect(address2).not.toBe(address1)
    })

    test('should get an on-chain boarding deposit address', async () => {
      const deposit = await account1.getDepositAddress()

      expect(deposit).toBeDefined()
      expect(typeof deposit.address).toBe('string')
      expect(deposit.address.length).toBeGreaterThan(0)
    })

    test('should get different deposit addresses for different accounts', async () => {
      const deposit1 = await account1.getDepositAddress()
      const deposit2 = await account2.getDepositAddress()

      expect(deposit1.address).not.toBe(deposit2.address)
    })
  })

  describe('Message Signing', () => {
    test('should not be able to sign messages yet', async () => {
      await expect(account1.sign('Hello, Wavelength Signet!')).rejects.toThrow(/MobileSignMessage/)
    })

    test('should reject an invalid signature rather than throw', async () => {
      await expect(account1.verify('Hello, Wavelength Signet!', 'deadbeef')).resolves.toBe(false)
    })
  })

  describe('Balance Queries', () => {
    test('should get balance', async () => {
      const balance = await account1.getBalance()

      expect(typeof balance).toBe('bigint')
      expect(balance >= 0n).toBe(true)
    })

    test('should not be able to get a token balance', async () => {
      await expect(account1.getTokenBalance('btkn1dummy')).rejects.toThrow(/token support doesn't exist yet/)
    })
  })

  describe('Lightning Invoice Operations', () => {
    test('should create a Lightning invoice', async () => {
      const receiveResult = await account2.createLightningInvoice({
        amountSat: 500,
        memo: 'Integration test Lightning invoice'
      })

      expect(receiveResult).toBeDefined()
      expect(typeof receiveResult.invoice).toBe('string')
      expect(receiveResult.invoice.length).toBeGreaterThan(0)
    })

    test('should get a Lightning fee estimate', async () => {
      const receiveResult = await account2.createLightningInvoice({
        amountSat: 500,
        memo: 'Fee estimate test'
      })

      const feeEstimate = await account1.quotePayLightningInvoice({ invoice: receiveResult.invoice })

      expect(typeof feeEstimate).toBe('bigint')
      expect(feeEstimate >= 0n).toBe(true)
    })

    test('should pay a Lightning invoice if account1 has balance', async () => {
      const balance1 = await account1.getBalance()
      const PAYMENT_AMOUNT_SAT = 500

      if (balance1 < BigInt(PAYMENT_AMOUNT_SAT) + 100n) {
        console.log('Skipping Lightning invoice payment test - account1 has insufficient balance:', balance1, 'sats')
        return
      }

      const receiveResult = await account2.createLightningInvoice({
        amountSat: PAYMENT_AMOUNT_SAT,
        memo: 'Lightning payment integration test'
      })

      const result = await account1.payLightningInvoice({ invoice: receiveResult.invoice })

      expect(result).toBeDefined()
    })
  })

  describe('Read-Only Account', () => {
    test('should create a read-only account sharing the same client', async () => {
      const readOnlyAccount = await account1.toReadOnlyAccount()

      expect(readOnlyAccount).toBeDefined()

      const balance = await readOnlyAccount.getBalance()
      expect(typeof balance).toBe('bigint')
      expect(balance >= 0n).toBe(true)
    })
  })

  describe('Transaction Operations (requires funded account)', () => {
    test('should send an on-chain transaction if account1 has balance', async () => {
      const balance1 = await account1.getBalance()

      if (balance1 < 1000n) {
        console.log('Skipping send test - account1 has insufficient balance:', balance1, 'sats')
        return
      }

      const { address } = await account2.getDepositAddress()

      const result = await account1.sendTransaction({
        to: address,
        value: 500
      })

      expect(result).toBeDefined()
      expect(typeof result.hash).toBe('string')
      expect(typeof result.fee).toBe('bigint')
    })
  })
})
