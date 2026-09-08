'use strict'

import fs from 'bare-fs'
import path from 'bare-path'
import { createRequire } from 'bare-module'
// @ts-expect-error -- TS wants a JSON import attribute Bare's loader doesn't require
import nodeRuntimeImports from 'bare-node-runtime/imports'

const O_EXCL_BY_PLATFORM = {
  darwin: 0x0800,
  linux: 0x80,
  win32: 0x0400
}

let bootstrapped = false

/**
 * @typedef {Object} WasmHostBootstrapOptions
 * @property {string} runtimeDir - Directory containing the runtime assets:
 * `wavewalletdk.wasm`, `wasm_exec.js`, `sqlite-bridge.js`, `sqlite-worker.js`.
 */

/**
 * Wires up everything the Wavewalletdk WASM module and its go-wasmsqlite
 * dependency need to run inside plain Bare, then instantiates the module and
 * waits for its facade entrypoint to become callable.
 *
 * @param {WasmHostBootstrapOptions} options
 * @returns {Promise<{ call: (method: string, params?: unknown) => Promise<unknown> }>}
 */
export default async function bootstrapWasmHost ({ runtimeDir }) {
  if (bootstrapped) {
    throw new Error('bootstrapWasmHost() was already called in this process -- the underlying Go/WASM runtime is a single global instance and cannot be bootstrapped twice.')
  }
  bootstrapped = true

  await import('bare-node-runtime/global')

  globalThis.fs = fs
  globalThis.path = path

  if (globalThis.fs.constants.O_EXCL === undefined) {
    const oExcl = O_EXCL_BY_PLATFORM[Bare.platform]
    if (oExcl === undefined) {
      throw new Error(`bootstrapWasmHost(): no known O_EXCL value for Bare.platform=${JSON.stringify(Bare.platform)} (bare-fs does not define one either). Add it to O_EXCL_BY_PLATFORM once confirmed for this platform.`)
    }
    globalThis.fs.constants.O_EXCL = oExcl
  }

  if (typeof globalThis.CustomEvent !== 'function') {
    /** @type {any} */
    const MinimalCustomEvent = class CustomEvent {
      constructor (type, opts) {
        this.type = type
        this.detail = opts && opts.detail
      }
    }
    globalThis.CustomEvent = MinimalCustomEvent
  }
  if (typeof globalThis.dispatchEvent !== 'function') {
    /** @type {any} */
    const noop = () => {}
    globalThis.dispatchEvent = noop
  }

  const workerThreadsShimPath = new URL('./worker-threads-shim.cjs', import.meta.url).pathname
  const customImports = {
    ...nodeRuntimeImports,
    worker_threads: { ...nodeRuntimeImports.worker_threads, bare: workerThreadsShimPath },
    'node:worker_threads': { ...nodeRuntimeImports['node:worker_threads'], bare: workerThreadsShimPath }
  }

  /** @type {any} */
  const bareRequire = createRequire(import.meta.url, { imports: customImports })
  globalThis.require = bareRequire

  globalThis.sqliteBridgeWorkerURL = path.join(runtimeDir, 'sqlite-worker.js')
  globalThis.sqliteBridgeAssetDir = runtimeDir

  const sqliteBridgeSrc = fs.readFileSync(path.join(runtimeDir, 'sqlite-bridge.js'), 'utf8')
  ;(0, eval)(sqliteBridgeSrc) // eslint-disable-line no-eval

  const wasmExecSrc = fs.readFileSync(path.join(runtimeDir, 'wasm_exec.js'), 'utf8')
  ;(0, eval)(wasmExecSrc) // eslint-disable-line no-eval

  const go = new globalThis.Go()

  const wasmBytes = fs.readFileSync(path.join(runtimeDir, 'wavewalletdk.wasm'))

  /** @type {{ instance: WebAssembly.Instance }} */
  const { instance } = /** @type {any} */ (await WebAssembly.instantiate(wasmBytes, go.importObject))

  go.run(instance).catch((err) => {
    console.error('wasm-host-bootstrap: go.run() rejected:', err && err.message)
  })

  await waitForFacadeReady()

  return { call: globalThis.wavewalletdkCall }
}

const FACADE_READY_POLL_INTERVAL_MS = 250
const FACADE_READY_TIMEOUT_MS = 30_000

function waitForFacadeReady () {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + FACADE_READY_TIMEOUT_MS

    const poll = setInterval(() => {
      if (typeof globalThis.wavewalletdkCall === 'function') {
        clearInterval(poll)
        resolve()
        return
      }

      if (Date.now() >= deadline) {
        clearInterval(poll)
        reject(new Error(`bootstrapWasmHost(): timed out after ${FACADE_READY_TIMEOUT_MS}ms waiting for globalThis.wavewalletdkCall to become available.`))
      }
    }, FACADE_READY_POLL_INTERVAL_MS)
  })
}
