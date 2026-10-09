'use strict'

import { jest } from '@jest/globals'

const workers = []

class FakeWorker {
  constructor (entry, options) {
    this.entry = entry
    this.options = options
    this.handlers = new Map()
    this.postMessage = jest.fn()
    this.terminate = jest.fn().mockResolvedValue(0)
    workers.push(this)
  }

  on (event, handler) {
    this.handlers.set(event, handler)
    return this
  }

  emit (event, value) {
    this.handlers.get(event)?.(value)
  }
}

jest.unstable_mockModule('bare-worker', () => ({ default: FakeWorker }))

const { default: createWasmWorkerHost } = await import(
  '../src/transports/wasm/wasm-worker-host.js'
)

beforeEach(() => {
  workers.length = 0
})

afterEach(() => {
  jest.useRealTimers()
})

describe('createWasmWorkerHost', () => {
  it('terminates the worker once when readiness times out', async () => {
    jest.useFakeTimers()
    const ready = createWasmWorkerHost({ runtimeDir: '/tmp/runtime' })
    const worker = workers[0]
    const assertion = expect(ready).rejects.toThrow(
      /did not become ready within 30000ms/
    )

    await jest.advanceTimersByTimeAsync(30_000)
    await assertion

    expect(worker.terminate).toHaveBeenCalledTimes(1)

    worker.emit('error', new Error('late worker error'))
    worker.emit('exit', 1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('terminates the worker once when bootstrap emits an error', async () => {
    const ready = createWasmWorkerHost({ runtimeDir: '/tmp/runtime' })
    const worker = workers[0]
    const assertion = expect(ready).rejects.toThrow('bootstrap failed')

    worker.emit('error', new Error('bootstrap failed'))
    await assertion

    expect(worker.terminate).toHaveBeenCalledTimes(1)

    worker.emit('exit', 1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('rejects pending and subsequent calls after a runtime failure', async () => {
    const ready = createWasmWorkerHost({ runtimeDir: '/tmp/runtime' })
    const worker = workers[0]
    worker.emit('message', { type: 'ready' })
    const host = await ready

    const pending = host.call('getInfo')
    const assertion = expect(pending).rejects.toThrow('runtime failed')
    worker.emit('error', new Error('runtime failed'))
    await assertion

    await expect(host.call('deposit')).rejects.toThrow('runtime failed')
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('makes explicit termination idempotent and rejects pending calls', async () => {
    const ready = createWasmWorkerHost({ runtimeDir: '/tmp/runtime' })
    const worker = workers[0]
    worker.emit('message', { type: 'ready' })
    const host = await ready

    const pending = host.call('getInfo')
    const assertion = expect(pending).rejects.toThrow(/was terminated/)
    const first = host.terminate()
    const second = host.terminate()

    expect(first).toBe(second)
    await first
    await assertion
    expect(worker.terminate).toHaveBeenCalledTimes(1)

    worker.emit('exit', 0)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
