'use strict'

import { parentPort, workerData } from 'bare-worker'

import bootstrapWasmHost from './wasm-host-bootstrap.js'

const subscriptions = new Map()
let subscriptionId = 0

function serializeError (err) {
  return {
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : undefined
  }
}

function respond (id, value) {
  parentPort.postMessage({ id, type: 'response', ok: true, value })
}

function reject (id, err) {
  parentPort.postMessage({
    id,
    type: 'response',
    ok: false,
    error: serializeError(err)
  })
}

async function main () {
  const host = await bootstrapWasmHost({ runtimeDir: workerData.runtimeDir })

  parentPort.on('message', async (message) => {
    try {
      if (message.type === 'call') {
        const result = /** @type {any} */ (
          await host.call(message.method, message.params ?? {})
        )
        if (
          result &&
          typeof result.next === 'function' &&
          typeof result.close === 'function'
        ) {
          const id = subscriptionId++
          subscriptions.set(id, result)
          respond(message.id, { subscriptionId: id })
          return
        }

        respond(message.id, result)
        return
      }

      const subscription = subscriptions.get(message.subscriptionId)
      if (!subscription) {
        throw new Error(`Unknown Wavewalletdk subscription ${message.subscriptionId}`)
      }

      if (message.type === 'subscriptionNext') {
        let value
        try {
          value = await subscription.next()
        } catch (err) {
          subscriptions.delete(message.subscriptionId)
          throw err
        }
        if (value === null || value === undefined) {
          subscriptions.delete(message.subscriptionId)
        }
        respond(message.id, value)
        return
      }

      if (message.type === 'subscriptionClose') {
        subscriptions.delete(message.subscriptionId)
        respond(message.id, await subscription.close())
        return
      }

      throw new Error(`Unknown Wavewalletdk worker request ${message.type}`)
    } catch (err) {
      reject(message.id, err)
    }
  })

  parentPort.postMessage({ type: 'ready' })
}

main().catch((err) => {
  throw err
})
