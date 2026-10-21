'use strict'

import { jest } from '@jest/globals'
import b4a from 'b4a'

import { WavelengthError } from '@lightninglabs/wavelength-core'

import { encodeOkResponse, encodeErrorResponse, encodeMessage } from '../src/transports/android/ipc-framing.js'

// BareKit is a global ambient, stubbed on `global` before each test.
function createFakeIpc () {
  const onData = []
  return {
    write: jest.fn(),
    on: jest.fn((event, listener) => {
      if (event === 'data') onData.push(listener)
    }),
    _receive (chunk) {
      for (const listener of onData) listener(chunk)
    }
  }
}

// ipc.write() is called with bytes, not a string, so decode first.
function parseWrittenRequest (ipc, callIndex = ipc.write.mock.calls.length - 1) {
  return JSON.parse(b4a.toString(ipc.write.mock.calls[callIndex][0]).trimEnd())
}

let BareAndroidWavelengthClient
let createWavelengthTransport

beforeAll(async () => {
  const mod = await import('../src/transports/wavelength-transport-bare-android.js')
  BareAndroidWavelengthClient = mod.BareAndroidWavelengthClient
  createWavelengthTransport = mod.default
})

describe('BareAndroidWavelengthClient', () => {
  let ipc

  beforeEach(() => {
    ipc = createFakeIpc()
    global.BareKit = { IPC: ipc }
  })

  afterEach(() => {
    delete global.BareKit
  })

  describe('constructor', () => {
    it('reports the grpc server transport', () => {
      const client = new BareAndroidWavelengthClient()
      expect(client.serverTransport).toBe('grpc')
    })

    it('registers a data listener on BareKit.IPC', () => {
      // eslint-disable-next-line no-new
      new BareAndroidWavelengthClient()
      expect(ipc.on).toHaveBeenCalledWith('data', expect.any(Function))
    })
  })

  describe('ready', () => {
    it('resolves immediately, with no IPC traffic', async () => {
      const client = new BareAndroidWavelengthClient()
      await expect(client.ready()).resolves.toBeUndefined()
      expect(ipc.write).not.toHaveBeenCalled()
    })
  })

  describe('invokeFacade', () => {
    it('writes a framed request and resolves with the correlated response result', async () => {
      const client = new BareAndroidWavelengthClient()

      const resultPromise = client.invokeFacade('getInfo', { foo: 'bar' })
      const request = parseWrittenRequest(ipc)
      expect(request).toEqual({ id: request.id, method: 'getInfo', params: { foo: 'bar' } })

      ipc._receive(encodeOkResponse(request.id, { walletState: 'ready' }))

      await expect(resultPromise).resolves.toEqual({ walletState: 'ready' })
    })

    it('keeps out-of-order responses correlated across client instances', async () => {
      const firstClient = new BareAndroidWavelengthClient()
      const secondClient = new BareAndroidWavelengthClient()

      const firstResult = firstClient.invokeFacade('getInfo', {
        account: 0
      })
      const secondResult = secondClient.invokeFacade('getInfo', {
        account: 1
      })
      const firstRequest = parseWrittenRequest(ipc, 0)
      const secondRequest = parseWrittenRequest(ipc, 1)

      expect(firstRequest.id).not.toBe(secondRequest.id)

      ipc._receive(encodeOkResponse(secondRequest.id, {
        identityPubKey: 'account-1'
      }))
      ipc._receive(encodeOkResponse(firstRequest.id, {
        identityPubKey: 'account-0'
      }))

      await expect(firstResult).resolves.toEqual({
        identityPubKey: 'account-0'
      })
      await expect(secondResult).resolves.toEqual({
        identityPubKey: 'account-1'
      })
    })

    it('defaults params to {} when omitted', async () => {
      const client = new BareAndroidWavelengthClient()

      const resultPromise = client.invokeFacade('isRunning')
      const request = parseWrittenRequest(ipc)
      expect(request.params).toEqual({})

      ipc._receive(encodeOkResponse(request.id, true))
      await resultPromise
    })

    it('rejects with the relay-reported error when the response is not ok', async () => {
      const client = new BareAndroidWavelengthClient()

      const resultPromise = client.invokeFacade('deposit')
      const request = parseWrittenRequest(ipc)
      ipc._receive(encodeErrorResponse(request.id, 'something else entirely'))

      await expect(resultPromise).rejects.toThrow(/something else entirely/)
    })

    it('wraps a facade error without retrying', async () => {
      const client = new BareAndroidWavelengthClient()

      const resultPromise = client.invokeFacade('deposit')
      const request = parseWrittenRequest(ipc)
      ipc._receive(encodeErrorResponse(request.id, 'rpc error: code = Internal desc = something else entirely'))

      await expect(resultPromise).rejects.toThrow(/something else entirely/)
      expect(ipc.write).toHaveBeenCalledTimes(1)
    })

    it('ignores a response whose id has no matching in-flight request', async () => {
      const client = new BareAndroidWavelengthClient()

      expect(() => ipc._receive(encodeOkResponse(999, 'stray'))).not.toThrow()
    })

    it('ignores a foreign (driver-wdk.mjs-shaped) message on the shared IPC without corrupting a real pending request', async () => {
      // The app's worklet driver shares this duplex with its own {id,
      // command, ...} protocol; an id collision between the two counters
      // would resolve the wrong in-flight call.
      const client = new BareAndroidWavelengthClient()

      const resultPromise = client.invokeFacade('deposit')
      const request = parseWrittenRequest(ipc)

      ipc._receive(JSON.stringify({ id: request.id, command: 'get-balance', confirmedSat: '123' }) + '\n')
      ipc._receive(encodeOkResponse(request.id, { address: 'tb1qboarding' }))

      await expect(resultPromise).resolves.toEqual({ address: 'tb1qboarding' })
    })
  })

  describe('activity streaming', () => {
    it('openActivityStream sends a startActivity request and resolves once the relay confirms', async () => {
      const client = new BareAndroidWavelengthClient()

      const openPromise = client.openActivityStream({ includeExisting: true })
      const request = parseWrittenRequest(ipc)
      expect(request).toEqual({ id: request.id, method: 'startActivity', params: { includeExisting: true } })

      ipc._receive(encodeOkResponse(request.id, null))
      await expect(openPromise).resolves.toBeUndefined()
    })

    it('emits an activity event for an unsolicited entry push message', async () => {
      const client = new BareAndroidWavelengthClient()
      const received = []
      client.subscribe((event) => received.push(event))

      ipc._receive(encodeMessage({ type: 'activityEvent', kind: 'entry', payload: JSON.stringify({ id: 'entry-1', kind: 'deposit' }) }))

      expect(received).toHaveLength(1)
      expect(received[0].type).toBe('activity')
      expect(received[0].payload.id).toBe('entry-1')
    })

    it('emits an ended activityStream event when the stream ends unsolicited', async () => {
      const client = new BareAndroidWavelengthClient()
      const received = []
      client.subscribe((event) => received.push(event))

      ipc._receive(encodeMessage({ type: 'activityEvent', kind: 'end', payload: '' }))

      expect(received).toContainEqual({ type: 'activityStream', payload: { state: 'ended' } })
    })

    it('emits a failed activityStream event when the stream errors unsolicited', async () => {
      const client = new BareAndroidWavelengthClient()
      const received = []
      client.subscribe((event) => received.push(event))

      ipc._receive(encodeMessage({ type: 'activityEvent', kind: 'error', payload: 'stream broke' }))

      expect(received).toContainEqual({ type: 'activityStream', payload: { state: 'failed', message: 'stream broke' } })
    })

    it('client-initiated stopActivity() suppresses a subsequent unsolicited end/error event', async () => {
      const client = new BareAndroidWavelengthClient()
      const received = []
      client.subscribe((event) => received.push(event))

      client.stopActivity()
      const stopRequest = parseWrittenRequest(ipc)
      expect(stopRequest.method).toBe('stopActivity')
      ipc._receive(encodeOkResponse(stopRequest.id, null))

      ipc._receive(encodeMessage({ type: 'activityEvent', kind: 'end', payload: '' }))

      expect(received.some((e) => e.type === 'activityStream')).toBe(false)
    })

    it('emits a log event if the stopActivity request itself fails', async () => {
      const client = new BareAndroidWavelengthClient()
      const received = []
      client.subscribe((event) => received.push(event))

      client.stopActivity()
      const stopRequest = parseWrittenRequest(ipc)
      ipc._receive(encodeErrorResponse(stopRequest.id, 'relay unreachable'))

      // stopActivity() is fire-and-forget; give its rejection handler a tick.
      await new Promise((resolve) => setImmediate(resolve))

      const logEvent = received.find((e) => e.type === 'log')
      expect(logEvent).toBeDefined()
      expect(logEvent.payload.message).toMatch(/relay unreachable/)
    })

    it('stopActivity() does not throw when no stream is open', () => {
      const client = new BareAndroidWavelengthClient()
      expect(() => client.stopActivity()).not.toThrow()
    })
  })

  describe('createWavelengthTransport (default export)', () => {
    it('ignores its options and returns a BareAndroidWavelengthClient', () => {
      const client = createWavelengthTransport({ anything: true })
      expect(client).toBeInstanceOf(BareAndroidWavelengthClient)
      expect(client.serverTransport).toBe('grpc')
    })

    it('returns a working client when called with no arguments', () => {
      const client = createWavelengthTransport()
      expect(client).toBeInstanceOf(BareAndroidWavelengthClient)
    })
  })
})
