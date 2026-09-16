'use strict'

import { BaseWavelengthClient, errorMessage } from '@lightninglabs/wavelength-core'

import { encodeRequest, LineDecoder } from './android/ipc-framing.js'
import { invokeFacadeWithRetry, START_METHODS } from './facade-retry.js'

/** @typedef {import('@lightninglabs/wavelength-core').FacadeMethod} FacadeMethod */
/** @typedef {import('@lightninglabs/wavelength-core').WavelengthClient} WavelengthClient */
/** @typedef {import('@lightninglabs/wavelength-core').ActivityStreamOptions} ActivityStreamOptions */

/**
 * @typedef {Object} ActivityEventMessage
 * @property {'activityEvent'} type
 * @property {'entry' | 'end' | 'error'} kind
 * @property {string} payload
 */

/**
 * @typedef {Object} ResponseMessage
 * @property {undefined} [type]
 * @property {number} id
 * @property {boolean} ok
 * @property {unknown} [result]
 * @property {string} [error]
 */

/** @typedef {'rest' | 'grpc'} ServerTransport */

let nextIpcRequestId = 1

export class BareAndroidWavelengthClient extends BaseWavelengthClient {
  /** @type {ServerTransport} */
  serverTransport = 'grpc'

  constructor () {
    super()

    /** @private */
    this._ipc = BareKit.IPC

    /** @private */
    this._decoder = new LineDecoder()

    /**
     * @private
     * @type {Map<number, { resolve: (value: unknown) => void, reject: (err: Error) => void }>}
     */
    this._pending = new Map()

    /** @private */
    this._activityStoppedByClient = false

    this._ipc.on('data', (chunk) => this._handleIpcData(chunk))
  }

  ready () {
    return Promise.resolve()
  }

  /**
   * @private
   * @param {unknown} chunk
   */
  _handleIpcData (chunk) {
    const messages = /** @type {(ActivityEventMessage | ResponseMessage)[]} */ (this._decoder.push(chunk))

    for (const raw of messages) {
      if (raw && raw.type === 'activityEvent') {
        this._handleActivityEvent(/** @type {ActivityEventMessage} */ (raw))
        continue
      }

      if (!raw || typeof (/** @type {ResponseMessage} */ (raw)).ok !== 'boolean') continue

      const msg = /** @type {ResponseMessage} */ (raw)
      const pending = this._pending.get(msg.id)
      if (!pending) continue

      this._pending.delete(msg.id)
      if (msg.ok) {
        pending.resolve(msg.result)
      } else {
        pending.reject(new Error(msg.error))
      }
    }
  }

  /**
   * @private
   * @param {string} method
   * @param {unknown} [params]
   * @returns {Promise<unknown>}
   */
  _sendRequest (method, params) {
    const id = nextIpcRequestId++

    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject })
      this._ipc.write(encodeRequest(id, method, params))
    })
  }

  /**
   * @template [T=unknown]
   * @param {FacadeMethod} method - The facade method to invoke.
   * @param {unknown} [params] - The method's camelCase (or, for
   * createWallet/unlockWallet, already Go-shaped) request params.
   * @returns {Promise<T>} The raw (still PascalCase) facade result.
   */
  async invokeFacade (method, params = {}) {
    return invokeFacadeWithRetry(
      () => /** @type {Promise<T>} */ (this._sendRequest(method, params ?? {})),
      { canRecoverStaleStart: START_METHODS.has(method), stop: () => this._sendRequest('stop', {}) }
    )
  }

  /**
   * @param {ActivityStreamOptions} opts - The stream's options.
   * @returns {Promise<void>}
   */
  async openActivityStream (opts) {
    this._activityStoppedByClient = false
    await this._sendRequest('startActivity', opts)
  }

  /**
   * @private
   * @param {ActivityEventMessage} msg
   */
  _handleActivityEvent (msg) {
    if (msg.kind === 'entry') {
      const raw = JSON.parse(msg.payload)
      this.emit({ type: 'activity', payload: this.normalizeActivityEntry(raw) })
      return
    }

    if (this._activityStoppedByClient) return

    if (msg.kind === 'end') {
      this.emit({ type: 'activityStream', payload: { state: 'ended' } })
    } else if (msg.kind === 'error') {
      this.emit({ type: 'activityStream', payload: { state: 'failed', message: msg.payload } })
    }
  }

  stopActivity () {
    this._activityStoppedByClient = true

    this._sendRequest('stopActivity').catch((err) => {
      this.emit({ type: 'log', payload: { level: 'error', message: `stopActivity request failed: ${errorMessage(err)}` } })
    })
  }
}

/**
 * Creates the Bare Android transport's {@link WavelengthClient}.
 *
 * @param {unknown} [options] - Ignored.
 * @returns {WavelengthClient} The Bare Android transport client.
 */
export default function createWavelengthTransport (options) {
  return new BareAndroidWavelengthClient()
}
