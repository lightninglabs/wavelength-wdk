'use strict'

import { jest } from '@jest/globals'

import { UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet'

// Fakes the client shape directly rather than booting a real daemon.
// `wavelength-bindings` is mocked below, before the manager is imported,
// since it's resolved at import time.
function createFakeClient (overrides = {}) {
  return {
    ready: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn(),
    isRunning: jest.fn().mockResolvedValue(false),
    start: jest.fn().mockResolvedValue(undefined),
    startExternalSeedWallet: jest.fn().mockResolvedValue({ imported: true, identityPubKey: 'ab' }),
    stop: jest.fn().mockResolvedValue(undefined),
    getInfo: jest.fn().mockResolvedValue({ walletState: 'none', walletReady: false, identityPubKey: 'ab' }),
    createWallet: jest.fn().mockResolvedValue({ mnemonic: ['abandon', 'ability'], identityPubKey: 'ab' }),
    unlockWallet: jest.fn().mockResolvedValue({ identityPubKey: 'ab' }),
    deposit: jest.fn().mockResolvedValue({ address: 'tb1qsomeaddress' }),
    prepareSend: jest.fn().mockResolvedValue({ expectedFeeSat: 42, feeKnown: true }),
    ...overrides
  }
}

function deferred () {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

let createWavelengthTransport
let WalletManagerWavelength

beforeAll(async () => {
  jest.unstable_mockModule('wavelength-bindings', () => ({
    default: jest.fn()
  }))

  createWavelengthTransport = (await import('wavelength-bindings')).default
  WalletManagerWavelength = (await import('../src/wallet-manager-wavelength.js')).default
})

beforeEach(() => {
  createWavelengthTransport.mockReset()
})

describe('WalletManagerWavelength', () => {
  it('requires a real seed: undefined, and legacy password/mnemonic/seedPassphrase config, all throw', () => {
    expect(() => new WalletManagerWavelength(undefined, { network: 'signet', dataDir: '/wallet-base' }))
      .toThrow(/seedOrSigner is required/)
    expect(() => new WalletManagerWavelength(undefined, { network: 'signet', dataDir: '/wallet-base' }))
      .toThrow(ValueError)
    expect(() => new WalletManagerWavelength(SEED_PHRASE, { network: 'signet', dataDir: '/wallet-base', password: 'nope' }))
      .toThrow(/password-only wallet mode has been removed/)
    expect(() => new WalletManagerWavelength(SEED_PHRASE, { network: 'signet', dataDir: '/wallet-base', mnemonic: ['a'] }))
      .toThrow(/password-only wallet mode has been removed/)
    expect(() => new WalletManagerWavelength(SEED_PHRASE, { network: 'signet', dataDir: '/wallet-base', seedPassphrase: 'nope' }))
      .toThrow(/password-only wallet mode has been removed/)
  })

  it('derives isolated external-seed profiles and starts one client per account', async () => {
    const observed = []
    const clients = [createFakeClient(), createFakeClient()]
    clients[0].startExternalSeedWallet.mockImplementation(async (config, req) => {
      observed.push({
        config,
        entropy: Buffer.from(req.seedEntropy).toString('hex'),
        expectedIdentityPubKey: req.expectedIdentityPubKey,
        seedEntropy: req.seedEntropy
      })
      return { imported: true, identityPubKey: '02aa' }
    })
    clients[1].startExternalSeedWallet.mockImplementation(async (config, req) => {
      observed.push({
        config,
        entropy: Buffer.from(req.seedEntropy).toString('hex'),
        expectedIdentityPubKey: req.expectedIdentityPubKey,
        seedEntropy: req.seedEntropy
      })
      return { imported: true, identityPubKey: '02bb' }
    })
    createWavelengthTransport
      .mockReturnValueOnce(clients[0])
      .mockReturnValueOnce(clients[1])

    const manager = new WalletManagerWavelength(SEED_PHRASE, {
      network: 'signet',
      dataDir: '/wallet-base',
      wasmRuntimeDir: '/runtime'
    })
    const [account0, account1] = await Promise.all([
      manager.getAccount(0, { expectedIdentityPubKey: '02aa' }),
      manager.getAccount(1, { expectedIdentityPubKey: '02bb' })
    ])

    expect(createWavelengthTransport).toHaveBeenCalledTimes(2)
    expect(clients[0].start).not.toHaveBeenCalled()
    expect(clients[1].start).not.toHaveBeenCalled()
    expect(observed[0].entropy).toBe('b644316adfd0c04ec65cee236834ad18')
    expect(observed[1].entropy).toBe('2fca0931dd3f52ced6c2d146ba30d0b9')
    expect(observed[0].expectedIdentityPubKey).toBe('02aa')
    expect(observed[1].expectedIdentityPubKey).toBe('02bb')
    expect(observed[0].config.dataDir).toBe(
      '/wallet-base/accounts/wavelength-bip85-wave-aezeed-v1/' +
      '1d6ed4027fb35344dbae49e75da8ce4a/signet/0'
    )
    expect(observed[1].config.dataDir).toBe(
      '/wallet-base/accounts/wavelength-bip85-wave-aezeed-v1/' +
      '1d6ed4027fb35344dbae49e75da8ce4a/signet/1'
    )
    expect(observed.every(({ seedEntropy }) => seedEntropy.every((byte) => byte === 0))).toBe(true)
    expect(account0.index).toBe(0)
    expect(account1.index).toBe(1)
    expect(account1.path).toBe("m/83696968'/1463899717'/2'/0'/1'")
  })

  it('memoizes each external-seed account boot independently, including the default index', async () => {
    const client = createFakeClient()
    createWavelengthTransport.mockReturnValue(client)
    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'regtest', dataDir: '/wallet-base' })

    const [a, b] = await Promise.all([manager.getAccount(7), manager.getAccount(7)])
    expect(a).toBe(b)

    const [c, d] = await Promise.all([manager.getAccount(), manager.getAccount()])
    expect(c).toBe(d)
    expect(c).not.toBe(a)

    expect(createWavelengthTransport).toHaveBeenCalledTimes(2)
    expect(client.startExternalSeedWallet).toHaveBeenCalledTimes(2)
  })

  it('rejects conflicting options for an opening external-seed account', async () => {
    const client = createFakeClient()
    createWavelengthTransport.mockReturnValue(client)
    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'regtest', dataDir: '/wallet-base' })

    const first = manager.getAccount(2, { recoverState: true, recoveryWindow: 50 })
    await expect(manager.getAccount(2, { recoverState: false, recoveryWindow: 50 }))
      .rejects.toThrow(/different external-seed options/)
    await expect(first).resolves.toBeDefined()
  })

  it('requires explicit network and base dataDir', () => {
    expect(() => new WalletManagerWavelength(SEED_PHRASE, { network: 'signet' }))
      .toThrow(/dataDir/)
    expect(() => new WalletManagerWavelength(SEED_PHRASE, { dataDir: '/wallet-base' }))
      .toThrow(/network/)
    expect(() => new WalletManagerWavelength(SEED_PHRASE, {
      network: 'signet',
      dataDir: '/wallet-base',
      expectedIdentityPubKey: '02aa'
    })).toThrow(/getAccount/)
  })

  it('rejects getAccountByPath, since no derivation-path parameter exists in the mobile facade', async () => {
    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'signet', dataDir: '/wallet-base' })

    await expect(manager.getAccountByPath('m/0/0')).rejects.toThrow(/derivation-path/)
    await expect(manager.getAccountByPath('m/0/0')).rejects.toBeInstanceOf(UnsupportedOperationError)
  })

  it('synthesizes fee rates from a nominal quote against its own deposit address', async () => {
    const client = createFakeClient()
    createWavelengthTransport.mockReturnValue(client)

    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'signet', dataDir: '/wallet-base' })
    const rates = await manager.getFeeRates()

    expect(client.deposit).toHaveBeenCalled()
    expect(client.prepareSend).toHaveBeenCalledWith(expect.objectContaining({ onchainAddress: 'tb1qsomeaddress' }))
    expect(rates).toEqual({ normal: 42n, fast: 42n })
  })

  it('cancels a getFeeRates boot raced by close(), same as a direct getAccount() open', async () => {
    const ready = deferred()
    const client = createFakeClient({ ready: jest.fn(() => ready.promise) })
    createWavelengthTransport.mockReturnValue(client)

    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'signet', dataDir: '/wallet-base' })
    const feeRates = manager.getFeeRates()
    const close = manager.close()

    ready.resolve()
    await expect(feeRates).rejects.toThrow(/closed/)
    await close

    // The open was cancelled before startExternalSeedWallet ran, but the
    // transport that was created and readied must still be disposed.
    expect(client.startExternalSeedWallet).not.toHaveBeenCalled()
    expect(client.dispose).toHaveBeenCalledTimes(1)
  })

  it('stops a published external client while its account open is pending', async () => {
    const open = deferred()
    const startEntered = deferred()
    const client = createFakeClient()
    client.startExternalSeedWallet.mockImplementation(() => {
      startEntered.resolve()
      return open.promise
    })
    client.stop.mockImplementation(async () => {
      open.reject(new Error('external account open cancelled by stop'))
    })
    createWavelengthTransport.mockReturnValue(client)

    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'regtest', dataDir: '/wallet-base' })
    const account = manager.getAccount(0)
    const accountFailure = expect(account).rejects.toThrow(
      'external account open cancelled by stop'
    )
    await startEntered.promise

    const close = manager.close()

    await accountFailure
    await expect(close).resolves.toBeUndefined()
    expect(client.stop).toHaveBeenCalledTimes(1)
    expect(client.dispose).toHaveBeenCalledTimes(1)
  })

  it('observes an early close failure while external account open is pending', async () => {
    const open = deferred()
    const startEntered = deferred()
    const client = createFakeClient({
      stop: jest.fn().mockRejectedValue(new Error('stop failed'))
    })
    client.startExternalSeedWallet.mockImplementation(() => {
      startEntered.resolve()
      return open.promise
    })
    createWavelengthTransport.mockReturnValue(client)

    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'regtest', dataDir: '/wallet-base' })
    const account = manager.getAccount(0)
    const accountFailure = expect(account).rejects.toThrow(
      'external account open failed after stop'
    )
    await startEntered.promise

    const close = manager.close()
    expect(client.stop).toHaveBeenCalledTimes(1)
    open.reject(new Error('external account open failed after stop'))

    await accountFailure
    await expect(close).rejects.toThrow('stop failed')
    expect(client.dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects a late external open after a racing stop fails', async () => {
    const open = deferred()
    const startEntered = deferred()
    const client = createFakeClient({
      stop: jest.fn().mockRejectedValue(new Error('stop failed'))
    })
    client.startExternalSeedWallet.mockImplementation(() => {
      startEntered.resolve()
      return open.promise
    })
    createWavelengthTransport.mockReturnValue(client)

    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'regtest', dataDir: '/wallet-base' })
    const account = manager.getAccount(0)
    const accountFailure = expect(account).rejects.toThrow(/closed/)
    await startEntered.promise

    const close = manager.close()
    open.resolve({ imported: true, identityPubKey: '02aa' })

    await accountFailure
    await expect(close).rejects.toThrow('stop failed')
    expect(manager._accounts).toEqual({})
    expect(client.dispose).toHaveBeenCalledTimes(1)
  })

  it('wipes its owned seed copy without mutating caller-owned bytes', async () => {
    const callerSeed = Uint8Array.from({ length: 64 }, (_, index) => index)
    const manager = new WalletManagerWavelength(callerSeed, {
      network: 'regtest',
      dataDir: '/wallet-base'
    })
    const ownedSeed = manager.seed

    expect(ownedSeed).not.toBe(callerSeed)
    await manager.close()

    expect(callerSeed).toEqual(Uint8Array.from({ length: 64 }, (_, index) => index))
    expect(ownedSeed.every((byte) => byte === 0)).toBe(true)
    expect(manager.seed).toBeUndefined()
    await expect(manager.getFeeRates()).rejects.toThrow(/closed/)
  })

  it('detaches caller-held accounts from their clients on close', async () => {
    const client = createFakeClient()
    createWavelengthTransport.mockReturnValue(client)

    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'signet', dataDir: '/wallet-base' })
    const account = await manager.getAccount(0)
    const readOnly = await account.toReadOnlyAccount()

    await manager.close()

    expect(account._client).toBeNull()
    expect(account._config).toEqual({})
    expect(readOnly._client).toBeNull()
    expect(readOnly._config).toEqual({})
  })

  it('stops and disposes every client on close', async () => {
    const clients = [createFakeClient(), createFakeClient()]
    createWavelengthTransport
      .mockReturnValueOnce(clients[0])
      .mockReturnValueOnce(clients[1])

    const manager = new WalletManagerWavelength(SEED_PHRASE, { network: 'signet', dataDir: '/wallet-base' })
    await Promise.all([manager.getAccount(0), manager.getAccount(1)])
    await manager.close()

    for (const client of clients) {
      expect(client.stop).toHaveBeenCalled()
      expect(client.dispose).toHaveBeenCalled()
    }
  })
})
