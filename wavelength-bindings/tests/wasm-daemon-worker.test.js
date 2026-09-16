'use strict'

import { jest } from '@jest/globals'

const parentPort = {
  on: jest.fn(),
  postMessage: jest.fn()
}
const host = {
  call: jest.fn()
}

jest.unstable_mockModule('bare-worker', () => ({
  parentPort,
  workerData: { runtimeDir: '/runtime' }
}))
jest.unstable_mockModule('../src/wasm/wasm-host-bootstrap.js', () => ({
  default: jest.fn().mockResolvedValue(host)
}))

await import('../src/wasm/wasm-daemon-worker.js')

const messageHandler = parentPort.on.mock.calls.find(
  ([event]) => event === 'message'
)?.[1]

if (!messageHandler) {
  throw new Error('WASM daemon worker did not install its message handler')
}

async function dispatch (message) {
  const previousCalls = parentPort.postMessage.mock.calls.length
  await messageHandler(message)

  return parentPort.postMessage.mock.calls[previousCalls][0]
}

beforeEach(() => {
  host.call.mockReset()
})

describe('WASM daemon worker subscriptions', () => {
  it('forgets a subscription after its stream ends naturally', async () => {
    host.call.mockResolvedValue({
      next: jest.fn().mockResolvedValue(null),
      close: jest.fn()
    })

    const opened = await dispatch({
      id: 1,
      type: 'call',
      method: 'subscribe'
    })
    const { subscriptionId } = opened.value

    await expect(dispatch({
      id: 2,
      type: 'subscriptionNext',
      subscriptionId
    })).resolves.toMatchObject({ ok: true, value: null })
    await expect(dispatch({
      id: 3,
      type: 'subscriptionNext',
      subscriptionId
    })).resolves.toMatchObject({
      ok: false,
      error: { message: `Unknown Wavewalletdk subscription ${subscriptionId}` }
    })
  })

  it('forgets a subscription after its stream fails naturally', async () => {
    host.call.mockResolvedValue({
      next: jest.fn().mockRejectedValue(new Error('subscription failed')),
      close: jest.fn()
    })

    const opened = await dispatch({
      id: 4,
      type: 'call',
      method: 'subscribe'
    })
    const { subscriptionId } = opened.value

    await expect(dispatch({
      id: 5,
      type: 'subscriptionNext',
      subscriptionId
    })).resolves.toMatchObject({
      ok: false,
      error: { message: 'subscription failed' }
    })
    await expect(dispatch({
      id: 6,
      type: 'subscriptionNext',
      subscriptionId
    })).resolves.toMatchObject({
      ok: false,
      error: { message: `Unknown Wavewalletdk subscription ${subscriptionId}` }
    })
  })
})
