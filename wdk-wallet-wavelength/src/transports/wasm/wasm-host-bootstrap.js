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

const FACADE_READY_POLL_INTERVAL_MS = 250
const FACADE_READY_TIMEOUT_MS = 30_000

let bootstrapped = false

/**
 * @typedef {Object} WasmHostBootstrapOptions
 * @property {string} runtimeDir - Directory containing the runtime assets:
 * `wavewalletdk.wasm`, `wasm_exec.js`, `sqlite-bridge.js`, `sqlite-worker.js`.
 */

/**
 * @typedef {Object} WasmHost
 * @property {(method: string, params?: unknown) => Promise<unknown>} call
 */

/**
 * Prepares Bare to host the Wavewalletdk WASM module, starts it, and waits
 * for its facade entrypoint.
 *
 * @param {WasmHostBootstrapOptions} options
 * @returns {Promise<WasmHost>}
 */
export default async function bootstrapWasmHost ({ runtimeDir }) {
  if (bootstrapped) {
    throw new Error('bootstrapWasmHost() was already called in this process -- the underlying Go/WASM runtime is a single global instance and cannot be bootstrapped twice.')
  }

  bootstrapped = true

  try {
    return await bootstrap(runtimeDir)
  } catch (err) {
    bootstrapped = false
    throw err
  }
}

/**
 * @param {string} runtimeDir
 * @returns {Promise<WasmHost>}
 */
async function bootstrap (runtimeDir) {
  await import('bare-node-runtime/global')

  installFilesystemGlobals()
  installEventGlobals()
  installRequire()

  // The bridge reads its config from globals as it evaluates.
  installSqliteBridgeConfig(runtimeDir)
  evaluateRuntimeScript(runtimeDir, 'sqlite-bridge.js')
  evaluateRuntimeScript(runtimeDir, 'wasm_exec.js')

  await startGoRuntime(runtimeDir)
  await waitForFacadeReady()

  return { call: globalThis.wavewalletdkCall }
}

/** `wasm_exec.js` and the sqlite bridge reach for these as bare globals. */
function installFilesystemGlobals () {
  globalThis.fs = fs
  globalThis.path = path

  /** @type {any} */
  const constants = fs.constants
  if (constants.O_EXCL !== undefined) return

  // Without O_EXCL the bridge silently truncates an existing database.
  const oExcl = O_EXCL_BY_PLATFORM[Bare.platform]
  if (oExcl === undefined) {
    throw new Error(`bootstrapWasmHost(): no known O_EXCL value for Bare.platform=${JSON.stringify(Bare.platform)} (bare-fs does not define one either). Add it to O_EXCL_BY_PLATFORM once confirmed for this platform.`)
  }

  constants.O_EXCL = oExcl
}

/** The sqlite bridge dispatches DOM-style events that Bare has no API for. */
function installEventGlobals () {
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
}

/**
 * The evaluated scripts call `require()` as a global, and their worker spawn
 * has to land on bare-worker rather than Node's worker_threads.
 */
function installRequire () {
  const shimPath = new URL('./worker-threads-shim.cjs', import.meta.url).pathname
  const imports = {
    ...nodeRuntimeImports,
    worker_threads: { ...nodeRuntimeImports.worker_threads, bare: shimPath },
    'node:worker_threads': { ...nodeRuntimeImports['node:worker_threads'], bare: shimPath }
  }

  /** @type {any} */
  const bareRequire = createRequire(import.meta.url, { imports })
  globalThis.require = bareRequire
}

/**
 * @param {string} runtimeDir
 */
function installSqliteBridgeConfig (runtimeDir) {
  globalThis.sqliteBridgeWorkerURL = path.join(runtimeDir, 'sqlite-worker.js')
  globalThis.sqliteBridgeAssetDir = runtimeDir
}

/**
 * Classic scripts that install globals; there is no module form to import.
 *
 * @param {string} runtimeDir
 * @param {string} file
 */
function evaluateRuntimeScript (runtimeDir, file) {
  const source = fs.readFileSync(path.join(runtimeDir, file), 'utf8')
  ;(0, eval)(source) // eslint-disable-line no-eval
}

/**
 * @param {string} runtimeDir
 * @returns {Promise<void>}
 */
async function startGoRuntime (runtimeDir) {
  const go = new globalThis.Go()
  const wasmBytes = fs.readFileSync(path.join(runtimeDir, 'wavewalletdk.wasm'))

  /** @type {{ instance: WebAssembly.Instance }} */
  const { instance } = /** @type {any} */ (await WebAssembly.instantiate(wasmBytes, go.importObject))

  // Resolves only once the Go program exits, so it is never awaited here.
  go.run(instance).catch((err) => {
    console.error('wasm-host-bootstrap: go.run() rejected:', err && err.message)
  })
}

/**
 * The Go runtime publishes its entrypoint asynchronously, with no callback to
 * hook, so readiness can only be polled.
 *
 * @returns {Promise<void>}
 */
async function waitForFacadeReady () {
  const deadline = Date.now() + FACADE_READY_TIMEOUT_MS

  while (typeof globalThis.wavewalletdkCall !== 'function') {
    if (Date.now() >= deadline) {
      throw new Error(`bootstrapWasmHost(): timed out after ${FACADE_READY_TIMEOUT_MS}ms waiting for globalThis.wavewalletdkCall to become available.`)
    }

    await sleep(FACADE_READY_POLL_INTERVAL_MS)
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
