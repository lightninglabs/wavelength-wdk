'use strict'

import { jest } from '@jest/globals'

import { WavelengthError } from '@lightninglabs/wavelength-core'

// Mocked before importing the transport: wasm-worker-host.js would otherwise
// spawn a real Bare worker at module load.
function createFakeHost (overrides = {}) {
  return {
    call: jest.fn().mockResolvedValue(null),
    terminate: jest.fn().mockResolvedValue(0),
    ...overrides
  }
}

let createWasmWorkerHost
let BareWasmWavelengthClient

beforeAll(async () => {
  jest.unstable_mockModule('../src/transports/wasm/wasm-worker-host.js', () => ({
    default: jest.fn()
  }))

  createWasmWorkerHost = (await import('../src/transports/wasm/wasm-worker-host.js')).default
  BareWasmWavelengthClient = (await import('../src/transports/wavelength-transport-bare-wasm.js')).BareWasmWavelengthClient
})

beforeEach(() => {
  createWasmWorkerHost.mockReset()
})

describe('BareWasmWavelengthClient', () => {
  describe('constructor', () => {
    it('throws when runtimeDir is missing', () => {
      expect(() => new BareWasmWavelengthClient()).toThrow(/runtimeDir/)
      expect(() => new BareWasmWavelengthClient({})).toThrow(/runtimeDir/)
    })

    it('reports the rest server transport (gRPC is unavailable in js/wasm builds)', () => {
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      expect(client.serverTransport).toBe('rest')
    })
  })

  describe('ready', () => {
    it('bootstraps the wasm host with the configured runtimeDir', async () => {
      const host = createFakeHost()
      createWasmWorkerHost.mockResolvedValue(host)
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })

      await client.ready()

      expect(createWasmWorkerHost).toHaveBeenCalledWith({ runtimeDir: '/tmp/runtime' })
    })

    it('memoizes concurrent callers into a single bootstrap', async () => {
      let resolveBootstrap
      createWasmWorkerHost.mockReturnValue(new Promise((resolve) => { resolveBootstrap = resolve }))
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })

      const first = client.ready()
      const second = client.ready()

      resolveBootstrap(createFakeHost())
      await first
      await second

      expect(createWasmWorkerHost).toHaveBeenCalledTimes(1)
    })
  })

  describe('invokeFacade', () => {
    it('throws when called before ready() resolves', async () => {
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      await expect(client.invokeFacade('getInfo')).rejects.toThrow(/ready\(\) resolved/)
    })

    it('forwards the method and params to the host and returns its result', async () => {
      const host = createFakeHost({ call: jest.fn().mockResolvedValue({ walletState: 'ready' }) })
      createWasmWorkerHost.mockResolvedValue(host)
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      await client.ready()

      const result = await client.invokeFacade('getInfo', { foo: 'bar' })

      expect(host.call).toHaveBeenCalledWith('getInfo', { foo: 'bar' })
      expect(result).toEqual({ walletState: 'ready' })
    })

    it('defaults params to {} when omitted', async () => {
      const host = createFakeHost()
      createWasmWorkerHost.mockResolvedValue(host)
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      await client.ready()

      await client.invokeFacade('isRunning')

      expect(host.call).toHaveBeenCalledWith('isRunning', {})
    })

    it('wraps a facade error without retrying', async () => {
      const call = jest.fn().mockRejectedValue(new Error('rpc error: code = Internal desc = something else entirely'))
      const host = createFakeHost({ call })
      createWasmWorkerHost.mockResolvedValue(host)
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      await client.ready()

      await expect(client.invokeFacade('deposit')).rejects.toThrow(/something else entirely/)
      expect(call).toHaveBeenCalledTimes(1)
    })
  })

  describe('activity streaming', () => {
    function createFakeSubscription (entries) {
      let index = 0
      return {
        next: jest.fn(() => {
          if (index >= entries.length) return Promise.resolve(null)
          return Promise.resolve(entries[index++])
        }),
        close: jest.fn()
      }
    }

    it('pumps entries from the subscription and emits an activity event per entry', async () => {
      const entries = [{ id: 'entry-1', kind: 'deposit' }, { id: 'entry-2', kind: 'receive' }]
      const subscription = createFakeSubscription(entries)
      const host = createFakeHost({ call: jest.fn().mockResolvedValue(subscription) })
      createWasmWorkerHost.mockResolvedValue(host)
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      await client.ready()

      const received = []
      client.subscribe((event) => received.push(event))

      await client.startActivity({ includeExisting: true })
      // The pump loop runs detached from openActivityStream's promise; give it
      // a tick to drain.
      await new Promise((resolve) => setImmediate(resolve))

      expect(host.call).toHaveBeenCalledWith('subscribe', { includeExisting: true })
      const activityEvents = received.filter((e) => e.type === 'activity')
      expect(activityEvents).toHaveLength(2)
      expect(activityEvents[0].payload.id).toBe('entry-1')
      expect(activityEvents[1].payload.id).toBe('entry-2')
    })

    it('emits an ended activityStream event when the subscription ends unsolicited', async () => {
      const subscription = createFakeSubscription([])
      const host = createFakeHost({ call: jest.fn().mockResolvedValue(subscription) })
      createWasmWorkerHost.mockResolvedValue(host)
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      await client.ready()

      const received = []
      client.subscribe((event) => received.push(event))

      await client.startActivity({})
      await new Promise((resolve) => setImmediate(resolve))

      expect(received).toContainEqual({ type: 'activityStream', payload: { state: 'ended' } })
    })

    it('emits a failed activityStream event when next() rejects', async () => {
      const subscription = {
        next: jest.fn().mockRejectedValue(new Error('stream broke')),
        close: jest.fn()
      }
      const host = createFakeHost({ call: jest.fn().mockResolvedValue(subscription) })
      createWasmWorkerHost.mockResolvedValue(host)
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      await client.ready()

      const received = []
      client.subscribe((event) => received.push(event))

      await client.startActivity({})
      await new Promise((resolve) => setImmediate(resolve))

      const failedEvent = received.find((e) => e.type === 'activityStream')
      expect(failedEvent).toEqual({ type: 'activityStream', payload: { state: 'failed', message: 'stream broke' } })
    })

    it('client-initiated stopActivity() closes the handle and emits no activityStream event', async () => {
      // next() resolves only once stopActivity() closes it, isolating "closed
      // by the client" from "ended on its own".
      let closed = false
      const subscription = {
        next: jest.fn(() => new Promise((resolve) => {
          const check = () => (closed ? resolve(null) : setImmediate(check))
          check()
        })),
        close: jest.fn(() => { closed = true })
      }
      const host = createFakeHost({ call: jest.fn().mockResolvedValue(subscription) })
      createWasmWorkerHost.mockResolvedValue(host)
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      await client.ready()

      const received = []
      client.subscribe((event) => received.push(event))

      await client.startActivity({})
      client.stopActivity()
      await new Promise((resolve) => setImmediate(resolve))
      await new Promise((resolve) => setImmediate(resolve))

      expect(subscription.close).toHaveBeenCalledTimes(1)
      expect(received.some((e) => e.type === 'activityStream')).toBe(false)
    })

    it('stopActivity() is a no-op when no stream is open', () => {
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      expect(() => client.stopActivity()).not.toThrow()
    })
  })

  describe('dispose', () => {
    it('terminates the account-owned worker isolate', async () => {
      const host = createFakeHost()
      createWasmWorkerHost.mockResolvedValue(host)
      const client = new BareWasmWavelengthClient({ runtimeDir: '/tmp/runtime' })
      await client.ready()

      client.dispose()

      expect(host.terminate).toHaveBeenCalledTimes(1)
    })
  })

  describe('createWavelengthTransport (default export)', () => {
    it('translates wasmRuntimeDir into the constructor\'s runtimeDir option', async () => {
      const { default: createWavelengthTransport } = await import('../src/transports/wavelength-transport-bare-wasm.js')
      const client = createWavelengthTransport({ wasmRuntimeDir: '/tmp/runtime' })

      expect(client).toBeInstanceOf(BareWasmWavelengthClient)
      expect(client.serverTransport).toBe('rest')
    })

    it('throws when wasmRuntimeDir is missing', async () => {
      const { default: createWavelengthTransport } = await import('../src/transports/wavelength-transport-bare-wasm.js')
      expect(() => createWavelengthTransport()).toThrow(/runtimeDir/)
    })
  })
})
