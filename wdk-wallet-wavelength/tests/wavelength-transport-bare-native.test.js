'use strict'

import { jest } from '@jest/globals'

const addon = {
  start: jest.fn(),
  stop: jest.fn(),
  balance: jest.fn(),
  list: jest.fn(),
  isRunning: jest.fn(),
  subscribe: jest.fn(),
  subscriptionNext: jest.fn(),
  subscriptionClose: jest.fn()
}

let BareWavelengthClient

beforeAll(async () => {
  jest.unstable_mockModule('@lightninglabs/wavelength-bare-addon', () => ({ default: addon }))
  BareWavelengthClient = (await import('../src/transports/wavelength-transport-bare-native.js')).BareWavelengthClient
})

beforeEach(() => {
  for (const fn of Object.values(addon)) fn.mockReset()
  addon.subscriptionClose.mockResolvedValue(undefined)
})

function deferred () {
  let resolve, reject
  const promise = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject })
  return { promise, resolve, reject }
}

// Hands out next() results one at a time, then blocks like a live stream.
function queueNext (...results) {
  addon.subscriptionNext.mockImplementation(() => {
    if (results.length === 0) return new Promise(() => {})
    const result = results.shift()
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  })
}

function flush () {
  return new Promise((resolve) => setImmediate(resolve))
}

function collectEvents (client) {
  const events = []
  client.subscribe((event) => events.push(event))
  return events
}

describe('BareWavelengthClient', () => {
  describe('invokeFacade', () => {
    it('parses JSON results from getters and JSON methods', async () => {
      addon.balance.mockResolvedValue('{"ConfirmedSat":5}')
      addon.list.mockResolvedValue('{"Activity":null}')
      const client = new BareWavelengthClient()

      await expect(client.invokeFacade('balance')).resolves.toEqual({ ConfirmedSat: 5 })
      await expect(client.invokeFacade('list', { view: 'activity' })).resolves.toEqual({ Activity: null })
      expect(addon.balance).toHaveBeenCalledWith()
      expect(addon.list).toHaveBeenCalledWith('{"view":"activity"}')
    })

    it('passes scalar results through unparsed', async () => {
      addon.isRunning.mockResolvedValue(true)
      const client = new BareWavelengthClient()

      await expect(client.invokeFacade('isRunning')).resolves.toBe(true)
    })

    it('wraps a rejected call in a WavelengthError', async () => {
      addon.list.mockRejectedValue(new Error('boom'))
      const client = new BareWavelengthClient()

      await expect(client.invokeFacade('list', {})).rejects.toMatchObject({ name: 'WavelengthError', message: 'boom' })
    })
  })

  describe('activity stream', () => {
    it('emits each entry and an ended event on a clean end', async () => {
      addon.subscribe.mockResolvedValue('sub-1')
      queueNext('{"id":"e1"}', null)
      const client = new BareWavelengthClient()
      const events = collectEvents(client)

      await client.startActivity({ includeExisting: true })
      await flush()

      expect(addon.subscribe).toHaveBeenCalledWith('{"includeExisting":true}')
      expect(events.map((e) => e.type)).toEqual(['activity', 'activityStream'])
      expect(events[0].payload).toMatchObject({ id: 'e1' })
      expect(events[1].payload).toEqual({ state: 'ended' })
    })

    it('emits a failed event when next() rejects', async () => {
      addon.subscribe.mockResolvedValue('sub-1')
      queueNext(new Error('stream broke'))
      const client = new BareWavelengthClient()
      const events = collectEvents(client)

      await client.startActivity()
      await flush()

      expect(events).toEqual([{ type: 'activityStream', payload: { state: 'failed', message: 'stream broke' } }])
    })

    it('closes the subscription on stop and emits nothing further', async () => {
      addon.subscribe.mockResolvedValue('sub-1')
      const next = deferred()
      addon.subscriptionNext.mockReturnValue(next.promise)
      const client = new BareWavelengthClient()
      const events = collectEvents(client)

      await client.startActivity()
      client.stopActivity()
      next.resolve('{"id":"late"}')
      await flush()

      expect(addon.subscriptionClose).toHaveBeenCalledWith('sub-1')
      expect(events).toEqual([])
    })

    it('closes a subscription that resolves after stopActivity()', async () => {
      const subscribe = deferred()
      addon.subscribe.mockReturnValue(subscribe.promise)
      const client = new BareWavelengthClient()

      const opening = client.startActivity()
      client.stopActivity()
      subscribe.resolve('sub-late')
      await opening

      expect(addon.subscriptionClose).toHaveBeenCalledWith('sub-late')
      expect(addon.subscriptionNext).not.toHaveBeenCalled()
    })

    it('replaces an open stream without emitting for the old one', async () => {
      addon.subscribe.mockResolvedValueOnce('sub-1').mockResolvedValueOnce('sub-2')
      const oldNext = deferred()
      addon.subscriptionNext.mockReturnValueOnce(oldNext.promise).mockReturnValue(new Promise(() => {}))
      const client = new BareWavelengthClient()
      const events = collectEvents(client)

      await client.startActivity()
      await client.startActivity()
      oldNext.resolve(null)
      await flush()

      expect(addon.subscriptionClose).toHaveBeenCalledWith('sub-1')
      expect(addon.subscriptionNext).toHaveBeenLastCalledWith('sub-2')
      expect(events).toEqual([])
    })
  })
})
