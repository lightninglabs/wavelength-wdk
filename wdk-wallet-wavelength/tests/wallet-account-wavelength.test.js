'use strict'

import { jest } from '@jest/globals'

import { UnsupportedOperationError, NotImplementedError } from '@tetherto/wdk-wallet'
import { FORCE_UNROLL_ACK } from '@lightninglabs/wavelength-core'

import WalletAccountWavelength from '../src/wallet-account-wavelength.js'

function createFakeClient (overrides = {}) {
  return {
    balance: jest.fn().mockResolvedValue({ confirmedSat: 1234, pendingInSat: 0, pendingOutSat: 0, creditAvailableSat: 0, creditReservedSat: 0 }),
    prepareSend: jest.fn().mockResolvedValue({ sendIntentId: 'intent-1', expectedFeeSat: 10, feeKnown: true }),
    sendPrepared: jest.fn().mockResolvedValue({ entry: { id: 'entry-1', feeSat: 10 }, actualAmountSat: 1000 }),
    receive: jest.fn().mockResolvedValue({ invoice: 'lnbc...', entry: { id: 'entry-2' } }),
    list: jest.fn().mockResolvedValue({ activity: { entries: [{ id: 'entry-3', kind: 'receive' }] } }),
    deposit: jest.fn().mockResolvedValue({ address: 'tb1qboarding...', entry: { id: 'entry-4' } }),
    getInfo: jest.fn().mockResolvedValue({ walletState: 'ready', walletReady: true, identityPubKey: 'ab' }),
    exit: jest.fn().mockResolvedValue({ path: 'cooperative', queuedOutpoints: ['txid:0'] }),
    sweepWallet: jest.fn().mockResolvedValue({ canBroadcast: true, estimatedFeeSat: 200, netAmountSat: 9800, inputs: [] }),
    ...overrides
  }
}

describe('WalletAccountWavelength', () => {
  it('always reports index 0', () => {
    const account = new WalletAccountWavelength(createFakeClient(), 'ab')
    expect(account.index).toBe(0)
  })

  it('reports WDK derivation metadata for an external-seed account', () => {
    const path = "m/83696968'/1463899717'/2'/0'/7'"
    const account = new WalletAccountWavelength(createFakeClient(), 'ab', {}, 7, path)

    expect(account.index).toBe(7)
    expect(account.path).toBe(path)
  })

  it('defaults imported to false, and reports whatever startExternalSeedWallet reported', () => {
    const path = "m/83696968'/1463899717'/2'/0'/7'"
    const reopened = new WalletAccountWavelength(createFakeClient(), 'ab', {}, 7, path)
    expect(reopened.imported).toBe(false)

    const firstImport = new WalletAccountWavelength(createFakeClient(), 'ab', {}, 7, path, true)
    expect(firstImport.imported).toBe(true)
  })

  it('throws for the permanently unsupported IWalletAccount surface Wavelength genuinely lacks', async () => {
    const account = new WalletAccountWavelength(createFakeClient(), 'ab')

    await expect(account.sign('hi')).rejects.toThrow(/MobileSignMessage/)
    await expect(account.sign('hi')).rejects.toBeInstanceOf(UnsupportedOperationError)
    await expect(account.signTransaction({})).rejects.toThrow(/sign-without-broadcast/)
    await expect(account.signTransaction({})).rejects.toBeInstanceOf(UnsupportedOperationError)
  })

  it('throws NotImplementedError for transfer(), since token support does not exist yet', async () => {
    const account = new WalletAccountWavelength(createFakeClient(), 'ab')

    await expect(account.transfer({})).rejects.toThrow(/token support doesn't exist yet/)
    await expect(account.transfer({})).rejects.toBeInstanceOf(NotImplementedError)
  })

  it('inherits verify() from the read-only class, rejecting an invalid signature', async () => {
    const account = new WalletAccountWavelength(createFakeClient(), 'ab')

    await expect(account.verify('hi', 'deadbeef')).resolves.toBe(false)
  })

  it('decodes identityPubKey hex into keyPair.publicKey, with privateKey always null', () => {
    const account = new WalletAccountWavelength(createFakeClient(), 'ab12')

    expect(account.keyPair.privateKey).toBeNull()
    expect(Array.from(account.keyPair.publicKey)).toEqual([0xab, 0x12])
  })

  it('maps getBalance() onto the confirmed satoshi balance', async () => {
    const account = new WalletAccountWavelength(createFakeClient(), 'ab')
    await expect(account.getBalance()).resolves.toBe(1234n)
  })

  it('sendTransaction quotes then dispatches, returning the entry id as the hash', async () => {
    const client = createFakeClient()
    const account = new WalletAccountWavelength(client, 'ab')

    const result = await account.sendTransaction({ to: 'tb1qdest', value: 1000 })

    expect(client.prepareSend).toHaveBeenCalledWith(expect.objectContaining({ onchainAddress: 'tb1qdest', amountSat: 1000 }))
    expect(client.sendPrepared).toHaveBeenCalled()
    expect(result).toEqual({ hash: 'entry-1', fee: 10n })
  })

  it('sendTransaction rejects before sending when the quoted fee exceeds maxFeeSat', async () => {
    const client = createFakeClient()
    const account = new WalletAccountWavelength(client, 'ab')

    await expect(account.sendTransaction({ to: 'tb1qdest', value: 1000, maxFeeSat: 5 }))
      .rejects.toThrow(/exceeds maxFeeSat/)
    expect(client.sendPrepared).not.toHaveBeenCalled()
  })

  it('sendTransaction rejects before sending when the fee is not known and a cap was requested', async () => {
    const client = createFakeClient({
      prepareSend: jest.fn().mockResolvedValue({ sendIntentId: 'intent-1', feeKnown: false, warning: 'no route yet' })
    })
    const account = new WalletAccountWavelength(client, 'ab')

    await expect(account.sendTransaction({ to: 'tb1qdest', value: 1000, maxFeeSat: 5 }))
      .rejects.toThrow(/could not determine the fee/)
    expect(client.sendPrepared).not.toHaveBeenCalled()
  })

  it('quotePayLightningInvoice returns the quoted fee', async () => {
    const client = createFakeClient()
    const account = new WalletAccountWavelength(client, 'ab')

    await expect(account.quotePayLightningInvoice({ invoice: 'lnbc...' })).resolves.toBe(10n)
    expect(client.prepareSend).toHaveBeenCalledWith({ invoice: 'lnbc...' })
  })

  it('quotePayLightningInvoice throws rather than reporting an undetermined fee as zero', async () => {
    const client = createFakeClient({
      prepareSend: jest.fn().mockResolvedValue({ sendIntentId: 'intent-1', expectedFeeSat: 0, feeKnown: false, warning: 'no route yet' })
    })
    const account = new WalletAccountWavelength(client, 'ab')

    await expect(account.quotePayLightningInvoice({ invoice: 'lnbc...' })).rejects.toThrow(/could not determine the fee/)
  })

  it('sendTransaction still dispatches when the fee is not known and no cap was requested', async () => {
    const client = createFakeClient({
      prepareSend: jest.fn().mockResolvedValue({ sendIntentId: 'intent-1', feeKnown: false, warning: 'no route yet' })
    })
    const account = new WalletAccountWavelength(client, 'ab')

    await expect(account.sendTransaction({ to: 'tb1qdest', value: 1000 })).resolves.toBeDefined()
    expect(client.sendPrepared).toHaveBeenCalled()
  })

  it('creates a lightning invoice via receive()', async () => {
    const client = createFakeClient()
    const account = new WalletAccountWavelength(client, 'ab')

    const result = await account.createLightningInvoice({ amountSat: 500, memo: 'coffee' })

    expect(client.receive).toHaveBeenCalledWith({ amountSat: 500, memo: 'coffee' })
    expect(result.invoice).toBe('lnbc...')
  })

  it('finds a lightning receive request by filtering the activity list', async () => {
    const client = createFakeClient()
    const account = new WalletAccountWavelength(client, 'ab')

    const entry = await account.getLightningReceiveRequest('entry-3')

    expect(client.list).toHaveBeenCalledWith(expect.objectContaining({ view: 'activity', kinds: ['receive'] }))
    expect(entry).toEqual({ id: 'entry-3', kind: 'receive' })
  })

  it('returns null when the lightning request id is not found on the listed page', async () => {
    const client = createFakeClient()
    const account = new WalletAccountWavelength(client, 'ab')

    await expect(account.getLightningSendRequest('missing')).resolves.toBeNull()
  })

  it('toReadOnlyAccount returns a cached view sharing the same client', async () => {
    const client = createFakeClient()
    const account = new WalletAccountWavelength(client, 'ab')

    const readOnly = await account.toReadOnlyAccount()
    const readOnlyAgain = await account.toReadOnlyAccount()

    expect(readOnly).toBe(readOnlyAgain)
    await expect(readOnly.getBalance()).resolves.toBe(1234n)
  })

  describe('exit', () => {
    test('forwards a cooperative request (destination) unchanged', async () => {
      const DUMMY_RESULT = { path: 'cooperative', queuedOutpoints: ['txid:0'] }
      const client = createFakeClient({ exit: jest.fn().mockResolvedValue(DUMMY_RESULT) })
      const account = new WalletAccountWavelength(client, 'ab')

      const REQ = { outpoint: 'txid:0', destination: 'tb1qdestination...' }
      const result = await account.exit(REQ)

      expect(client.exit).toHaveBeenCalledWith(REQ)
      expect(result).toEqual(DUMMY_RESULT)
    })

    test('forwards a unilateral request (forceUnrollAck) unchanged', async () => {
      const DUMMY_RESULT = { path: 'unilateral', created: true, actorID: 'actor-1' }
      const client = createFakeClient({ exit: jest.fn().mockResolvedValue(DUMMY_RESULT) })
      const account = new WalletAccountWavelength(client, 'ab')

      const REQ = { outpoint: 'txid:0', forceUnrollAck: FORCE_UNROLL_ACK }
      const result = await account.exit(REQ)

      expect(client.exit).toHaveBeenCalledWith(REQ)
      expect(result).toEqual(DUMMY_RESULT)
    })
  })

  describe('sweepWallet', () => {
    test('forwards a preview request (broadcast: false) unchanged', async () => {
      const DUMMY_RESULT = { canBroadcast: true, estimatedFeeSat: 200, netAmountSat: 9800, inputs: [] }
      const client = createFakeClient({ sweepWallet: jest.fn().mockResolvedValue(DUMMY_RESULT) })
      const account = new WalletAccountWavelength(client, 'ab')

      const REQ = { destinationAddress: 'tb1qdestination...', broadcast: false }
      const result = await account.sweepWallet(REQ)

      expect(client.sweepWallet).toHaveBeenCalledWith(REQ)
      expect(result).toEqual(DUMMY_RESULT)
    })

    test('forwards a broadcast request (broadcast: true) unchanged', async () => {
      const client = createFakeClient()
      const account = new WalletAccountWavelength(client, 'ab')

      const REQ = { destinationAddress: 'tb1qdestination...', broadcast: true, feeRateSatPerVByte: 5 }
      await account.sweepWallet(REQ)

      expect(client.sweepWallet).toHaveBeenCalledWith(REQ)
    })
  })
})
