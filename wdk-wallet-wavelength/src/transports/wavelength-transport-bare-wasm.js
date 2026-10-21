'use strict'

import { BaseWavelengthClient, errorMessage } from '@lightninglabs/wavelength-core'

import createWasmWorkerHost from './wasm/wasm-worker-host.js'
import { invokeFacadeWithRetry } from './facade-retry.js'

/** @typedef {import('@lightninglabs/wavelength-core').FacadeMethod} FacadeMethod */
/** @typedef {import('@lightninglabs/wavelength-core').WavelengthClient} WavelengthClient */
/** @typedef {import('@lightninglabs/wavelength-core').ActivityStreamOptions} ActivityStreamOptions */
/** @typedef {'rest' | 'grpc'} ServerTransport */

export class BareWasmWavelengthClient extends BaseWavelengthClient {
  /** @type {ServerTransport} */
  serverTransport = 'rest'

  /**
   * @param {{ runtimeDir?: string }} [options]
   */
  constructor ({ runtimeDir } = {}) {
    super()

    if (!runtimeDir) {
      throw new Error('BareWasmWavelengthClient requires a runtimeDir option pointing at the WASM runtime assets (wavewalletdk.wasm, wasm_exec.js, sqlite-bridge.js, ...). Run `npm run fetch:wasm-runtime` in wdk-wallet-wavelength to populate this directory.')
    }

    /** @private */
    this._runtimeDir = runtimeDir

    /** @private */
    this._host = undefined

    /** @private */
    this._readyPromise = undefined

    /**
     * @private
     * @type {{ next: () => Promise<unknown>, close: () => unknown } | undefined}
     */
    this._subscription = undefined

    /** @private */
    this._subscriptionStoppedByClient = false
  }

  ready () {
    if (!this._readyPromise) {
      this._readyPromise = createWasmWorkerHost({ runtimeDir: this._runtimeDir }).then((host) => {
        this._host = host
      })
    }

    return this._readyPromise
  }

  /**
   * @template [T=unknown]
   * @param {FacadeMethod} method - The facade method to invoke.
   * @param {unknown} [params] - The method's camelCase (or, for
   * createWallet/unlockWallet, already Go-shaped) request params.
   * @returns {Promise<T>} The raw (still PascalCase) facade result.
   */
  async invokeFacade (method, params = {}) {
    if (!this._host) {
      throw new Error('BareWasmWavelengthClient.invokeFacade() called before ready() resolved -- the WASM host is not bootstrapped yet.')
    }

    return invokeFacadeWithRetry(() => /** @type {Promise<T>} */ (this._host.call(method, params ?? {})))
  }

  /**
   * @param {ActivityStreamOptions} opts - The stream's options.
   * @returns {Promise<void>}
   */
  async openActivityStream (opts) {
    const handle = /** @type {{ next: () => Promise<unknown>, close: () => unknown }} */ (
      await this.invokeFacade(/** @type {FacadeMethod} */ ('subscribe'), opts)
    )

    this._subscription = handle
    this._subscriptionStoppedByClient = false

    this._pumpActivityStream(handle)
  }

  /**
   * @private
   * @param {{ next: () => Promise<unknown>, close: () => unknown }} handle
   * @returns {Promise<void>}
   */
  async _pumpActivityStream (handle) {
    try {
      for (;;) {
        const raw = await handle.next()

        if (raw === null || raw === undefined) {
          if (!this._subscriptionStoppedByClient) {
            this.emit({ type: 'activityStream', payload: { state: 'ended' } })
          }
          return
        }

        this.emit({ type: 'activity', payload: this.normalizeActivityEntry(raw) })
      }
    } catch (err) {
      if (!this._subscriptionStoppedByClient) {
        this.emit({ type: 'activityStream', payload: { state: 'failed', message: errorMessage(err) } })
      }
    } finally {
      if (this._subscription === handle) {
        this._subscription = undefined
      }
    }
  }

  stopActivity () {
    if (!this._subscription) return

    this._subscriptionStoppedByClient = true
    const handle = this._subscription
    this._subscription = undefined
    const closeResult = /** @type {Promise<unknown> | undefined} */ (
      handle.close()
    )
    closeResult?.catch?.(() => {})
  }

  dispose () {
    super.dispose()
    const termination = this._host?.terminate()
    this._host = undefined
    return termination
  }
}

/**
 * Creates the Bare WASM transport's {@link WavelengthClient}.
 *
 * @param {{ wasmRuntimeDir?: string }} [options]
 * @returns {WavelengthClient} The Bare WASM transport client.
 */
export default function createWavelengthTransport ({ wasmRuntimeDir } = {}) {
  return new BareWasmWavelengthClient({ runtimeDir: wasmRuntimeDir })
}
