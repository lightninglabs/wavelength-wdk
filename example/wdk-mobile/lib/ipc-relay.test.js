'use strict'

import b4a from 'b4a'

import { createIpcRelay } from './ipc-relay'

// Fakes both halves of the boundary createIpcRelay takes as parameters --
// no Android SDK, emulator, or real Kotlin module needed.
function createFakeIpc () {
  let onData
  return {
    write: jest.fn(),
    on: jest.fn((event, listener) => {
      if (event === 'data') onData = listener
    }),
    _receive (chunk) {
      onData(chunk)
    }
  }
}

function createFakeNativeWavelength (overrides = {}) {
  return {
    call: jest.fn().mockResolvedValue('null'),
    startActivity: jest.fn().mockResolvedValue(undefined),
    stopActivity: jest.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

function createFakeActivityEmitter () {
  let listener
  return {
    addListener: jest.fn((eventName, fn) => {
      listener = fn
      return { remove: jest.fn() }
    }),
    _emit (event) {
      listener(event)
    }
  }
}

// Parses the newline-terminated JSON lines written via ipc.write(). Decodes
// from bytes, not a string -- BareKitIPC's native _write needs a real
// buffer, which crashed on a real Android device before encodeMessage
// started returning bytes.
function writtenMessages (ipc) {
  return ipc.write.mock.calls.map((call) => JSON.parse(b4a.toString(call[0]).trimEnd()))
}

describe('createIpcRelay', () => {
  let ipc, nativeWavelength, activityEmitter

  beforeEach(() => {
    ipc = createFakeIpc()
    nativeWavelength = createFakeNativeWavelength()
    activityEmitter = createFakeActivityEmitter()
  })

  it('registers a data listener on the IPC and an activity listener on the emitter', () => {
    createIpcRelay({ ipc, nativeWavelength, activityEmitter })

    expect(ipc.on).toHaveBeenCalledWith('data', expect.any(Function))
    expect(activityEmitter.addListener).toHaveBeenCalledWith('wavelengthActivity', expect.any(Function))
  })

  describe('request dispatch', () => {
    it('forwards a generic facade method through call() and writes back the parsed result', async () => {
      nativeWavelength.call.mockResolvedValue(JSON.stringify({ walletState: 'ready' }))
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      ipc._receive(JSON.stringify({ id: 1, method: 'getInfo', params: { foo: 'bar' } }) + '\n')
      await new Promise((resolve) => setImmediate(resolve))

      expect(nativeWavelength.call).toHaveBeenCalledWith('getInfo', JSON.stringify({ foo: 'bar' }))
      expect(writtenMessages(ipc)).toContainEqual({ id: 1, ok: true, result: { walletState: 'ready' } })
    })

    it('defaults params to {} when omitted', async () => {
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      ipc._receive(JSON.stringify({ id: 1, method: 'isRunning' }) + '\n')
      await new Promise((resolve) => setImmediate(resolve))

      expect(nativeWavelength.call).toHaveBeenCalledWith('isRunning', '{}')
    })

    it('treats a literal empty-string result (start/stop) as a null result', async () => {
      nativeWavelength.call.mockResolvedValue('')
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      ipc._receive(JSON.stringify({ id: 1, method: 'start', params: { mnemonic: 'x' } }) + '\n')
      await new Promise((resolve) => setImmediate(resolve))

      expect(writtenMessages(ipc)).toContainEqual({ id: 1, ok: true, result: null })
    })

    it('writes an error response when call() rejects', async () => {
      nativeWavelength.call.mockRejectedValue(new Error('wallet actor not initialized'))
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      ipc._receive(JSON.stringify({ id: 1, method: 'deposit' }) + '\n')
      await new Promise((resolve) => setImmediate(resolve))

      expect(writtenMessages(ipc)).toContainEqual({ id: 1, ok: false, error: 'wallet actor not initialized' })
    })

    it('routes startActivity to its own TurboModule method, not call()', async () => {
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      ipc._receive(JSON.stringify({ id: 1, method: 'startActivity', params: { includeExisting: true } }) + '\n')
      await new Promise((resolve) => setImmediate(resolve))

      expect(nativeWavelength.startActivity).toHaveBeenCalledWith(JSON.stringify({ includeExisting: true }))
      expect(nativeWavelength.call).not.toHaveBeenCalled()
      expect(writtenMessages(ipc)).toContainEqual({ id: 1, ok: true, result: null })
    })

    it('routes stopActivity to its own TurboModule method, not call()', async () => {
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      ipc._receive(JSON.stringify({ id: 1, method: 'stopActivity' }) + '\n')
      await new Promise((resolve) => setImmediate(resolve))

      expect(nativeWavelength.stopActivity).toHaveBeenCalledTimes(1)
      expect(nativeWavelength.call).not.toHaveBeenCalled()
      expect(writtenMessages(ipc)).toContainEqual({ id: 1, ok: true, result: null })
    })

    it('handles multiple in-flight requests independently, resolving out of order', async () => {
      let resolveFirst
      nativeWavelength.call.mockImplementation((method) => {
        if (method === 'slow') return new Promise((resolve) => { resolveFirst = resolve })
        return Promise.resolve(JSON.stringify('fast-result'))
      })
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      ipc._receive(JSON.stringify({ id: 1, method: 'slow' }) + '\n')
      ipc._receive(JSON.stringify({ id: 2, method: 'fast' }) + '\n')
      await new Promise((resolve) => setImmediate(resolve))

      // The fast call's response arrives first even though it was requested second.
      expect(writtenMessages(ipc)).toContainEqual({ id: 2, ok: true, result: 'fast-result' })
      expect(writtenMessages(ipc)).not.toContainEqual(expect.objectContaining({ id: 1 }))

      resolveFirst(JSON.stringify('slow-result'))
      await new Promise((resolve) => setImmediate(resolve))
      expect(writtenMessages(ipc)).toContainEqual({ id: 1, ok: true, result: 'slow-result' })
    })

    it('handles a request split across two IPC data chunks', async () => {
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      const line = JSON.stringify({ id: 1, method: 'isRunning' }) + '\n'
      ipc._receive(line.slice(0, 10))
      ipc._receive(line.slice(10))
      await new Promise((resolve) => setImmediate(resolve))

      expect(nativeWavelength.call).toHaveBeenCalledWith('isRunning', '{}')
    })

    it('ignores a foreign (driver-wdk.mjs-shaped) message on the shared IPC instead of dispatching it', async () => {
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      ipc._receive(JSON.stringify({ id: 1, command: 'get-balance' }) + '\n')
      await new Promise((resolve) => setImmediate(resolve))

      expect(nativeWavelength.call).not.toHaveBeenCalled()
      expect(writtenMessages(ipc)).toHaveLength(0)
    })
  })

  describe('activity streaming', () => {
    it('forwards an entry event onto the IPC as a framed activityEvent message', () => {
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      activityEmitter._emit({ kind: 'entry', payload: JSON.stringify({ id: 'entry-1' }) })

      expect(writtenMessages(ipc)).toContainEqual({
        type: 'activityEvent',
        kind: 'entry',
        payload: JSON.stringify({ id: 'entry-1' })
      })
    })

    it('forwards end/error events the same way', () => {
      createIpcRelay({ ipc, nativeWavelength, activityEmitter })

      activityEmitter._emit({ kind: 'end', payload: '' })
      activityEmitter._emit({ kind: 'error', payload: 'stream broke' })

      expect(writtenMessages(ipc)).toContainEqual({ type: 'activityEvent', kind: 'end', payload: '' })
      expect(writtenMessages(ipc)).toContainEqual({ type: 'activityEvent', kind: 'error', payload: 'stream broke' })
    })

    it('returns a teardown function that removes the activity-event subscription', () => {
      const teardown = createIpcRelay({ ipc, nativeWavelength, activityEmitter })
      const subscription = activityEmitter.addListener.mock.results[0].value

      teardown()

      expect(subscription.remove).toHaveBeenCalledTimes(1)
    })
  })
})
