'use strict'

import Worker from 'bare-worker'

const WORKER_READY_TIMEOUT_MS = 30_000

/**
 * @typedef {Object} WasmWorkerHost
 * @property {(method: string, params?: unknown) => Promise<unknown>} call
 * @property {() => Promise<number>} terminate
 */

/**
 * Starts one Wavewalletdk WASM runtime in its own Bare worker isolate.
 *
 * @param {{runtimeDir: string}} options
 * @returns {Promise<WasmWorkerHost>}
 */
export default function createWasmWorkerHost ({ runtimeDir }) {
  const entry = new URL('./wasm-daemon-worker.js', import.meta.url).pathname
  const worker = new Worker(entry, { workerData: { runtimeDir } })
  const pending = new Map()
  let requestId = 0
  let settled = false
  let exited = false
  let terminalError
  let termination

  /** @type {(value: WasmWorkerHost) => void} */
  let resolveReady
  /** @type {(reason?: unknown) => void} */
  let rejectReady

  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  const readyTimer = setTimeout(() => {
    fail(new Error(`Wavewalletdk worker did not become ready within ${WORKER_READY_TIMEOUT_MS}ms`))
  }, WORKER_READY_TIMEOUT_MS)

  function terminateWorker () {
    if (termination) return termination

    if (exited) {
      termination = Promise.resolve(0)
      return termination
    }

    try {
      termination = Promise.resolve(worker.terminate())
    } catch (err) {
      termination = Promise.reject(err)
    }

    return termination
  }

  function fail (err) {
    terminalError ??= err

    if (!settled) {
      settled = true
      clearTimeout(readyTimer)
      rejectReady(terminalError)
    }

    for (const { reject } of pending.values()) reject(terminalError)
    pending.clear()

    terminateWorker().catch(() => {})
  }

  function request (type, payload = {}) {
    if (terminalError) return Promise.reject(terminalError)

    return new Promise((resolve, reject) => {
      const id = requestId++
      pending.set(id, { resolve, reject })
      try {
        worker.postMessage({ id, type, ...payload })
      } catch (err) {
        pending.delete(id)
        reject(err)
        fail(err)
      }
    })
  }

  const host = {
    async call (method, params = {}) {
      const result = await request('call', { method, params })
      if (!result || result.subscriptionId === undefined) return result

      const subscriptionId = result.subscriptionId
      return {
        next: () => request('subscriptionNext', { subscriptionId }),
        close: () => request('subscriptionClose', { subscriptionId })
      }
    },
    terminate () {
      fail(new Error('Wavewalletdk worker was terminated'))
      return terminateWorker()
    }
  }

  worker.on('message', (message) => {
    if (message && message.type === 'ready') {
      if (!settled) {
        settled = true
        clearTimeout(readyTimer)
        resolveReady(host)
      }
      return
    }

    if (!message || message.type !== 'response') return

    const deferred = pending.get(message.id)
    if (!deferred) return
    pending.delete(message.id)

    if (message.ok) {
      deferred.resolve(message.value)
      return
    }

    const err = new Error(message.error?.message || 'Wavewalletdk worker call failed')
    if (message.error?.stack) err.stack = message.error.stack
    deferred.reject(err)
  })

  worker.on('error', fail)
  worker.on('exit', (code) => {
    exited = true
    if (!termination) termination = Promise.resolve(code)
    fail(new Error(`Wavewalletdk worker exited with code ${code}`))
  })

  return ready
}
