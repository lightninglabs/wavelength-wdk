'use strict'

import { jest } from '@jest/globals'

import { NotImplementedError, NoSuchElementError } from '@tetherto/wdk-wallet'

import { secp256k1 } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/curves/utils'
import { sha256 } from '@noble/hashes/sha2.js'

import WalletAccountReadOnlyWavelength from '../src/wallet-account-read-only-wavelength.js'

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
    test('should return confirmedSat, leaving server credit out', async () => {
      const client = createFakeClient({ balance: jest.fn().mockResolvedValue({ confirmedSat: 12_345, pendingInSat: 0, pendingOutSat: 0, creditAvailableSat: 1_000, creditReservedSat: 0 }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const balance = await account.getBalance()

      expect(client.balance).toHaveBeenCalled()
      expect(balance).toBe(12_345n)
    })

    test('should not include pendingOutSat, so a stuck outgoing payment stops inflating the balance', async () => {
      const client = createFakeClient({ balance: jest.fn().mockResolvedValue({ confirmedSat: 12_345, pendingInSat: 0, pendingOutSat: 9_999, creditAvailableSat: 0, creditReservedSat: 0 }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const balance = await account.getBalance()

      expect(balance).toBe(12_345n)
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

  describe('getBalanceBreakdown', () => {
    test('should return every balance component as bigint', async () => {
      const client = createFakeClient({ balance: jest.fn().mockResolvedValue({ confirmedSat: 12_345, pendingInSat: 1, pendingOutSat: 2, creditAvailableSat: 3, creditReservedSat: 4 }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.getBalanceBreakdown()).resolves.toEqual({
        confirmed: 12_345n,
        pendingIn: 1n,
        pendingOut: 2n,
        creditAvailable: 3n,
        creditReserved: 4n
      })
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

    test('should throw rather than report an undetermined fee as zero', async () => {
      const client = createFakeClient({
        prepareSend: jest.fn().mockResolvedValue({ expectedFeeSat: 0, feeKnown: false, warning: 'no route yet' })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.quoteSendTransaction(TRANSACTION)).rejects.toThrow(/could not determine the fee/)
      await expect(account.quoteSendTransaction(TRANSACTION)).rejects.toThrow(/no route yet/)
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

      expect(client.list).toHaveBeenCalledWith(expect.objectContaining({ view: 'activity' }))
      expect(receipt).toEqual(DUMMY_ENTRY)
    })

    test('should return null if the entry is not found', async () => {
      const client = createFakeClient({ list: jest.fn().mockResolvedValue({ activity: { entries: [] } }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const receipt = await account.getTransactionReceipt(DUMMY_ENTRY_ID)

      expect(receipt).toBe(null)
    })

    test('should follow nextCursor to find an entry on a later page', async () => {
      const DUMMY_ENTRY = { id: DUMMY_ENTRY_ID, kind: 'deposit' }
      const client = createFakeClient({
        list: jest.fn()
          .mockResolvedValueOnce({ activity: { entries: [{ id: 'other' }], hasMore: true, nextCursor: 'page-2' } })
          .mockResolvedValueOnce({ activity: { entries: [DUMMY_ENTRY], hasMore: false, nextCursor: '' } })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.getTransactionReceipt(DUMMY_ENTRY_ID)).resolves.toEqual(DUMMY_ENTRY)
      expect(client.list).toHaveBeenCalledTimes(2)
      expect(client.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'page-2' }))
    })

    test('should use the default page size first, then larger pages', async () => {
      const DUMMY_ENTRY = { id: DUMMY_ENTRY_ID, kind: 'deposit' }
      const client = createFakeClient({
        list: jest.fn()
          .mockResolvedValueOnce({ activity: { entries: [{ id: 'other' }], hasMore: true, nextCursor: 'page-2' } })
          .mockResolvedValueOnce({ activity: { entries: [DUMMY_ENTRY], hasMore: false, nextCursor: '' } })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.getTransactionReceipt(DUMMY_ENTRY_ID)).resolves.toEqual(DUMMY_ENTRY)
      expect(client.list.mock.calls[0][0].limit).toBeUndefined()
      expect(client.list.mock.calls[1][0]).toEqual(expect.objectContaining({ cursor: 'page-2', limit: 500 }))
    })

    test('should stop at the first page when hasMore is false', async () => {
      const client = createFakeClient({
        list: jest.fn().mockResolvedValue({ activity: { entries: [{ id: 'other' }], hasMore: false, nextCursor: '' } })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.getTransactionReceipt(DUMMY_ENTRY_ID)).resolves.toBe(null)
      expect(client.list).toHaveBeenCalledTimes(1)
    })

    test('should stop when a page claims more but hands back no cursor', async () => {
      const client = createFakeClient({
        list: jest.fn().mockResolvedValue({ activity: { entries: [{ id: 'other' }], hasMore: true, nextCursor: '' } })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.getTransactionReceipt(DUMMY_ENTRY_ID)).resolves.toBe(null)
      expect(client.list).toHaveBeenCalledTimes(1)
    })

    test('should give up after the page bound rather than walking an unbounded history', async () => {
      const client = createFakeClient({
        list: jest.fn().mockResolvedValue({ activity: { entries: [{ id: 'other' }], hasMore: true, nextCursor: 'next' } })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.getTransactionReceipt(DUMMY_ENTRY_ID)).resolves.toBe(null)
      expect(client.list).toHaveBeenCalledTimes(10)
    })
  })

  describe('getTransaction', () => {
    const DUMMY_ENTRY_ID = 'dummy-entry-id'

    test('should normalize a complete entry to a final, successful receipt', async () => {
      const DUMMY_ENTRY = { id: DUMMY_ENTRY_ID, status: 'complete', feeSat: 250, progress: { confirmationHeight: 800_000 } }
      const client = createFakeClient({ list: jest.fn().mockResolvedValue({ activity: { entries: [DUMMY_ENTRY] } }) })
      const account = new WalletAccountReadOnlyWavelength(client)

      const receipt = await account.getTransaction(DUMMY_ENTRY_ID)

      expect(client.list).toHaveBeenCalledWith(expect.objectContaining({ view: 'activity' }))
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

    test('should allocate once and reuse it, since each deposit() mints daemon-side state', async () => {
      const client = createFakeClient({
        deposit: jest.fn()
          .mockResolvedValueOnce({ address: 'tb1qfirst...', entry: { id: 'entry-1' } })
          .mockResolvedValueOnce({ address: 'tb1qsecond...', entry: { id: 'entry-2' } })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      const first = await account.getAddress()
      const second = await account.getAddress()

      expect(client.deposit).toHaveBeenCalledTimes(1)
      expect(first).toBe('tb1qfirst...')
      expect(second).toBe('tb1qfirst...')
    })

    test('should allocate once for concurrent first calls', async () => {
      const client = createFakeClient({
        deposit: jest.fn()
          .mockResolvedValueOnce({ address: 'tb1qfirst...', entry: { id: 'entry-1' } })
          .mockResolvedValueOnce({ address: 'tb1qsecond...', entry: { id: 'entry-2' } })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      const [first, second] = await Promise.all([account.getAddress(), account.getAddress()])

      expect(client.deposit).toHaveBeenCalledTimes(1)
      expect(first).toBe('tb1qfirst...')
      expect(second).toBe('tb1qfirst...')
    })

    test('should retry after a failed allocation instead of caching the rejection', async () => {
      const client = createFakeClient({
        deposit: jest.fn()
          .mockRejectedValueOnce(new Error('daemon not ready'))
          .mockResolvedValueOnce({ address: 'tb1qsecond...', entry: { id: 'entry-2' } })
      })
      const account = new WalletAccountReadOnlyWavelength(client)

      await expect(account.getAddress()).rejects.toThrow('daemon not ready')
      await expect(account.getAddress()).resolves.toBe('tb1qsecond...')
      expect(client.deposit).toHaveBeenCalledTimes(2)
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

describe('WalletAccountReadOnlyWavelength.watchActivity', () => {
  function createStreamingClient () {
    const listeners = new Set()
    return {
      ...createFakeClient(),
      subscribe: jest.fn((listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }),
      startActivity: jest.fn().mockResolvedValue(undefined),
      stopActivity: jest.fn(),
      emit: (event) => listeners.forEach((listener) => listener(event)),
      listenerCount: () => listeners.size
    }
  }

  test('should forward only activity and activityStream events', async () => {
    const client = createStreamingClient()
    const account = new WalletAccountReadOnlyWavelength(client)
    const listener = jest.fn()

    await account.watchActivity(listener, { includeExisting: true })

    client.emit({ type: 'activity', payload: { id: 'e1' } })
    client.emit({ type: 'log', payload: { level: 'info', message: 'x' } })
    client.emit({ type: 'activityStream', payload: { state: 'ended' } })

    expect(client.startActivity).toHaveBeenCalledWith({ includeExisting: true })
    expect(listener.mock.calls.map(([event]) => event.type)).toEqual(['activity', 'activityStream'])
  })

  test('should stop the stream and unsubscribe when unwatched', async () => {
    const client = createStreamingClient()
    const account = new WalletAccountReadOnlyWavelength(client)

    const unwatch = await account.watchActivity(jest.fn())
    unwatch()

    expect(client.stopActivity).toHaveBeenCalledTimes(1)
    expect(client.listenerCount()).toBe(0)
  })

  test('should not stop a replacement stream when a superseded watch is unwatched', async () => {
    const client = createStreamingClient()
    const account = new WalletAccountReadOnlyWavelength(client)

    const first = await account.watchActivity(jest.fn())
    await account.watchActivity(jest.fn())
    expect(client.stopActivity).toHaveBeenCalledTimes(1)

    first()

    expect(client.stopActivity).toHaveBeenCalledTimes(1)
    expect(client.listenerCount()).toBe(1)
  })

  test('should unsubscribe if the stream fails to open', async () => {
    const client = createStreamingClient()
    client.startActivity.mockRejectedValue(new Error('boom'))
    const account = new WalletAccountReadOnlyWavelength(client)

    await expect(account.watchActivity(jest.fn())).rejects.toThrow('boom')
    expect(client.listenerCount()).toBe(0)
  })

  test('should stop the stream on dispose', async () => {
    const client = createStreamingClient()
    const account = new WalletAccountReadOnlyWavelength(client)

    await account.watchActivity(jest.fn())
    account.dispose()

    expect(client.stopActivity).toHaveBeenCalledTimes(1)
  })
})
