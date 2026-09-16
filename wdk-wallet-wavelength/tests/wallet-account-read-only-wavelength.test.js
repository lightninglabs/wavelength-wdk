'use strict'

import { jest } from '@jest/globals'

import { NotImplementedError, NoSuchElementError } from '@tetherto/wdk-wallet'

import { secp256k1 } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/curves/utils'
import { sha256 } from '@noble/hashes/sha2.js'

import WalletAccountReadOnlyWavelength from '../src/wallet-account-read-only-wavelength.js'

// Wavelength's read-only account wraps an already-unlocked client passed
// directly into the constructor, so tests fake that client shape.
function createFakeClient (overrides = {}) {
  return {
    balance: jest.fn().mockResolvedValue({ confirmedSat: 1234, pendingInSat: 0, pendingOutSat: 0, creditAvailableSat: 0, creditReservedSat: 0 }),
    prepareSend: jest.fn().mockResolvedValue({ expectedFeeSat: 10, feeKnown: true }),
    list: jest.fn().mockResolvedValue({ activity: { entries: [] } }),
    getInfo: jest.fn().mockResolvedValue({ walletState: 'ready', walletReady: true, identityPubKey: 'ab' }),
    status: jest.fn().mockResolvedValue({ synced: true }),
    deposit: jest.fn().mockResolvedValue({ address: 'tb1qboarding...', entry: { id: 'entry-1' } }),
    getExitPlan: jest.fn().mockResolvedValue({ canStart: true, totalRecommendedFundingSat: 0, plans: [] }),
    exitStatus: jest.fn().mockResolvedValue({ found: true, status: 'pending' }),
    exitSummary: jest.fn().mockResolvedValue({ totalExits: 0, exits: [] }),
    ...overrides
  }
}

describe('WalletAccountReadOnlyWavelength', () => {
  describe('getBalance', () => {
    test('should return confirmedSat + pendingOutSat + creditAvailableSat', async () => {
      const client = createFakeClient({ balance: jest.fn().mockResolvedValue({ confirmedSat: 12_345, pendingInSat: 0, pendingOutSat: 500, creditAvailableSat: 1_000, creditReservedSat: 0 }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const balance = await account.getBalance()

      expect(client.balance).toHaveBeenCalled()
      expect(balance).toBe(13_845n)
    })

    test('should not include pendingInSat in the result', async () => {
      const client = createFakeClient({ balance: jest.fn().mockResolvedValue({ confirmedSat: 12_345, pendingInSat: 9_999, pendingOutSat: 0, creditAvailableSat: 0, creditReservedSat: 0 }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const balance = await account.getBalance()

      expect(balance).toBe(12_345n)
    })

    test('should not include creditReservedSat in the result', async () => {
      const client = createFakeClient({ balance: jest.fn().mockResolvedValue({ confirmedSat: 12_345, pendingInSat: 0, pendingOutSat: 0, creditAvailableSat: 0, creditReservedSat: 5_000 }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const balance = await account.getBalance()

      expect(balance).toBe(12_345n)
    })
  })

  describe('getTokenBalance', () => {
    test('should throw NotImplementedError, since token support does not exist yet', async () => {
      const account = new WalletAccountReadOnlyWavelength(createFakeClient())

      await expect(account.getTokenBalance('some-token-address')).rejects.toThrow(/token support doesn't exist yet/)
      await expect(account.getTokenBalance('some-token-address')).rejects.toBeInstanceOf(NotImplementedError)
    })
  })

  describe('quoteSendTransaction', () => {
    const TRANSACTION = { to: 'tb1qdestinationaddress', value: 1000 }

    test('should quote the fee via prepareSend', async () => {
      const client = createFakeClient()
      const account = new WalletAccountReadOnlyWavelength(client)

      const { fee } = await account.quoteSendTransaction(TRANSACTION)

      expect(client.prepareSend).toHaveBeenCalledWith({ onchainAddress: TRANSACTION.to, amountSat: TRANSACTION.value })
      expect(fee).toBe(10n)
    })
  })

  describe('quoteTransfer', () => {
    test('should throw NotImplementedError, since token support does not exist yet', async () => {
      const account = new WalletAccountReadOnlyWavelength(createFakeClient())

      await expect(account.quoteTransfer({})).rejects.toThrow(/token support doesn't exist yet/)
      await expect(account.quoteTransfer({})).rejects.toBeInstanceOf(NotImplementedError)
    })
  })

  describe('getTransactionReceipt', () => {
    const DUMMY_ENTRY_ID = 'dummy-entry-id'

    test('should return the matching activity entry', async () => {
      const DUMMY_ENTRY = { id: DUMMY_ENTRY_ID, kind: 'deposit' }
      const client = createFakeClient({ list: jest.fn().mockResolvedValue({ activity: { entries: [DUMMY_ENTRY] } }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const receipt = await account.getTransactionReceipt(DUMMY_ENTRY_ID)

      expect(client.list).toHaveBeenCalledWith({ view: 'activity' })
      expect(receipt).toEqual(DUMMY_ENTRY)
    })

    test('should return null if the entry is not found', async () => {
      const client = createFakeClient({ list: jest.fn().mockResolvedValue({ activity: { entries: [] } }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const receipt = await account.getTransactionReceipt(DUMMY_ENTRY_ID)

      expect(receipt).toBe(null)
    })
  })

  describe('getTransaction', () => {
    const DUMMY_ENTRY_ID = 'dummy-entry-id'

    test('should normalize a complete entry to a final, successful receipt', async () => {
      const DUMMY_ENTRY = { id: DUMMY_ENTRY_ID, status: 'complete', feeSat: 250, progress: { confirmationHeight: 800_000 } }
      const client = createFakeClient({ list: jest.fn().mockResolvedValue({ activity: { entries: [DUMMY_ENTRY] } }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const receipt = await account.getTransaction(DUMMY_ENTRY_ID)

      expect(client.list).toHaveBeenCalledWith({ view: 'activity' })
      expect(receipt).toEqual({ hash: DUMMY_ENTRY_ID, finality: 'final', success: true, block: 800_000, fee: 250n })
    })

    test('should normalize a pending entry with success left undefined', async () => {
      const DUMMY_ENTRY = { id: DUMMY_ENTRY_ID, status: 'pending', feeSat: 0 }
      const client = createFakeClient({ list: jest.fn().mockResolvedValue({ activity: { entries: [DUMMY_ENTRY] } }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const receipt = await account.getTransaction(DUMMY_ENTRY_ID)

      expect(receipt.finality).toBe('pending')
      expect(receipt.success).toBeUndefined()
    })

    test('should normalize a failed entry to dropped, unsuccessful', async () => {
      const DUMMY_ENTRY = { id: DUMMY_ENTRY_ID, status: 'failed', feeSat: 0 }
      const client = createFakeClient({ list: jest.fn().mockResolvedValue({ activity: { entries: [DUMMY_ENTRY] } }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const receipt = await account.getTransaction(DUMMY_ENTRY_ID)

      expect(receipt.finality).toBe('dropped')
      expect(receipt.success).toBe(false)
    })

    test('should throw NoSuchElementError if the entry is not found', async () => {
      const client = createFakeClient({ list: jest.fn().mockResolvedValue({ activity: { entries: [] } }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.getTransaction(DUMMY_ENTRY_ID)).rejects.toThrow(/No transaction found/)
      await expect(account.getTransaction(DUMMY_ENTRY_ID)).rejects.toBeInstanceOf(NoSuchElementError)
    })
  })

  describe('verify', () => {
    const privateKey = secp256k1.utils.randomSecretKey()
    const publicKey = secp256k1.getPublicKey(privateKey, true)
    const identityPubKey = bytesToHex(publicKey)

    function sign (message) {
      const hash = sha256(Buffer.from(message, 'utf8'))
      return bytesToHex(secp256k1.sign(hash, privateKey).toBytes('compact'))
    }

    test('should return true for a signature genuinely produced over the identity key', async () => {
      const client = createFakeClient({ getInfo: jest.fn().mockResolvedValue({ identityPubKey }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const message = 'Hello, Wavelength!'
      const signature = sign(message)

      await expect(account.verify(message, signature)).resolves.toBe(true)
    })

    test('should return false for a tampered message', async () => {
      const client = createFakeClient({ getInfo: jest.fn().mockResolvedValue({ identityPubKey }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const signature = sign('original message')

      await expect(account.verify('tampered message', signature)).resolves.toBe(false)
    })

    test('should return false for a tampered signature', async () => {
      const client = createFakeClient({ getInfo: jest.fn().mockResolvedValue({ identityPubKey }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const message = 'Hello, Wavelength!'
      const signature = sign(message)
      const tamperedSignature = signature.slice(0, -2) + (signature.slice(-2) === '00' ? '01' : '00')

      await expect(account.verify(message, tamperedSignature)).resolves.toBe(false)
    })

    test('should not call this._client for anything beyond getInfo()', async () => {
      const client = createFakeClient({ getInfo: jest.fn().mockResolvedValue({ identityPubKey }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const message = 'Hello, Wavelength!'
      await account.verify(message, sign(message))

      expect(client.getInfo).toHaveBeenCalledTimes(1)
      expect(client.balance).not.toHaveBeenCalled()
      expect(client.list).not.toHaveBeenCalled()
      expect(client.deposit).not.toHaveBeenCalled()
      expect(client.prepareSend).not.toHaveBeenCalled()
      expect(client.status).not.toHaveBeenCalled()
    })
  })

  describe('getAddress', () => {
    test('should return the address from deposit()', async () => {
      const client = createFakeClient({ deposit: jest.fn().mockResolvedValue({ address: 'tb1qfirst...', entry: { id: 'entry-1' } }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.getAddress()).resolves.toBe('tb1qfirst...')
    })

    test('should call deposit() again on every call, and return a new address each time', async () => {
      const client = createFakeClient({
        deposit: jest.fn()
          .mockResolvedValueOnce({ address: 'tb1qfirst...', entry: { id: 'entry-1' } })
          .mockResolvedValueOnce({ address: 'tb1qsecond...', entry: { id: 'entry-2' } })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      const first = await account.getAddress()
      const second = await account.getAddress()

      expect(client.deposit).toHaveBeenCalledTimes(2)
      expect(first).toBe('tb1qfirst...')
      expect(second).toBe('tb1qsecond...')
    })
  })

  describe('getInfo', () => {
    test('should return the daemon info', async () => {
      const client = createFakeClient()
      const account = new WalletAccountReadOnlyWavelength(client)

      const info = await account.getInfo()

      expect(client.getInfo).toHaveBeenCalled()
      expect(info).toEqual({ walletState: 'ready', walletReady: true, identityPubKey: 'ab' })
    })
  })

  describe('status', () => {
    test('should return the daemon status', async () => {
      const client = createFakeClient()
      const account = new WalletAccountReadOnlyWavelength(client)

      const status = await account.status()

      expect(client.status).toHaveBeenCalled()
      expect(status).toEqual({ synced: true })
    })
  })

  describe('list', () => {
    test('should forward options to the client and return the requested page', async () => {
      const DUMMY_RESULT = { activity: { entries: [{ id: 'entry-1' }] } }
      const client = createFakeClient({ list: jest.fn().mockResolvedValue(DUMMY_RESULT) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const OPTIONS = { view: 'activity', kinds: ['deposit'] }
      const result = await account.list(OPTIONS)

      expect(client.list).toHaveBeenCalledWith(OPTIONS)
      expect(result).toEqual(DUMMY_RESULT)
    })
  })

  describe('getExitPlan', () => {
    test('should forward the outpoints to the client and return the plan', async () => {
      const DUMMY_RESULT = { canStart: false, totalRecommendedFundingSat: 5000, plans: [{ outpoint: 'txid:0', infeasibilityReason: 'funding_shortfall' }] }
      const client = createFakeClient({ getExitPlan: jest.fn().mockResolvedValue(DUMMY_RESULT) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const REQ = { outpoints: ['txid:0'], confTarget: 6 }
      const result = await account.getExitPlan(REQ)

      expect(client.getExitPlan).toHaveBeenCalledWith(REQ)
      expect(result).toEqual(DUMMY_RESULT)
    })
  })

  describe('exitStatus', () => {
    test('should forward the outpoint to the client and return the status', async () => {
      const DUMMY_RESULT = { found: true, status: 'unrolling', cSV: { mature: false, blocksRemaining: 42 } }
      const client = createFakeClient({ exitStatus: jest.fn().mockResolvedValue(DUMMY_RESULT) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const REQ = { outpoint: 'txid:0', detailed: true }
      const result = await account.exitStatus(REQ)

      expect(client.exitStatus).toHaveBeenCalledWith(REQ)
      expect(result).toEqual(DUMMY_RESULT)
    })
  })

  describe('exitSummary', () => {
    test('should return the wallet-wide exit portfolio', async () => {
      const DUMMY_RESULT = { totalExits: 2, exits: [{ outpoint: 'txid:0' }, { outpoint: 'txid:1' }] }
      const client = createFakeClient({ exitSummary: jest.fn().mockResolvedValue(DUMMY_RESULT) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const result = await account.exitSummary()

      expect(client.exitSummary).toHaveBeenCalledWith({})
      expect(result).toEqual(DUMMY_RESULT)
    })

    test('should forward an explicit request object too', async () => {
      const client = createFakeClient()
      const account = new WalletAccountReadOnlyWavelength(client)

      await account.exitSummary({})

      expect(client.exitSummary).toHaveBeenCalledWith({})
    })
  })
})
