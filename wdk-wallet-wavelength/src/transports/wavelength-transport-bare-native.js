'use strict'

import { BaseWavelengthClient, errorMessage } from '@lightninglabs/wavelength-core'

import addon from '@lightninglabs/wavelength-bare-addon'
import { invokeFacadeWithRetry, START_METHODS } from './facade-retry.js'

/** @typedef {import('@lightninglabs/wavelength-core').FacadeMethod} FacadeMethod */
/** @typedef {import('@lightninglabs/wavelength-core').WavelengthClient} WavelengthClient */
/** @typedef {import('@lightninglabs/wavelength-core').ActivityStreamOptions} ActivityStreamOptions */
/** @typedef {'rest' | 'grpc'} ServerTransport */

const GETTER_METHODS = new Set(['getInfo', 'status', 'balance'])
const SCALAR_METHODS = new Set(['isRunning', 'walletReady', 'confirmedBalanceSat', 'pendingInboundSat'])

export class BareWavelengthClient extends BaseWavelengthClient {
  /** @type {ServerTransport} */
  serverTransport = 'grpc'

  ready () {
    return Promise.resolve()
  }

  /**
   * @template [T=unknown]
   * @param {FacadeMethod} method - The facade method to invoke.
   * @param {unknown} [params] - The method's camelCase (or, for
   * createWallet/unlockWallet, already Go-shaped) request params.
   * @returns {Promise<T>} The raw (still PascalCase) facade result.
   */
  async invokeFacade (method, params = {}) {
    /** @type {any} */
    const fn = addon[method]

    return invokeFacadeWithRetry(
      async () => {
        if (method === 'start') {
          return fn(JSON.stringify(params ?? {}))
        }

        if (method === 'stop' || SCALAR_METHODS.has(method)) {
          return fn()
        }

        const resultJson = GETTER_METHODS.has(method)
          ? await fn()
          : await fn(JSON.stringify(params ?? {}))
        return resultJson ? JSON.parse(resultJson) : null
      },
      { canRecoverStaleStart: START_METHODS.has(method), stop: () => addon.stop() }
    )
  }

  /**
   * @param {ActivityStreamOptions} opts - The stream's options.
   * @returns {Promise<void>}
   */
  async openActivityStream (opts) {
    this.stopActivity()

    // stopActivity() or a newer open while subscribe() is pending clears or
    // replaces this token, so the late subscription is closed, not installed.
    const opening = {}
    this._opening = opening

    const subscription = await invokeFacadeWithRetry(() => addon.subscribe(JSON.stringify(opts ?? {})))

    if (this._opening !== opening) {
      addon.subscriptionClose(subscription).catch(() => {})
      return
    }

    this._opening = undefined
    this._subscription = subscription

    this._pumpActivityStream(subscription)
  }

  /**
   * @private
   * @param {import('@lightninglabs/wavelength-bare-addon').Subscription} subscription - The addon's stream handle.
   * @returns {Promise<void>}
   */
  async _pumpActivityStream (subscription) {
    try {
      for (;;) {
        const entryJson = await addon.subscriptionNext(subscription)

        // Stopped or replaced while next() was pending: no terminal event.
        if (this._subscription !== subscription) return

        if (entryJson === null) {
          this.emit({ type: 'activityStream', payload: { state: 'ended' } })
          return
        }

        this.emit({ type: 'activity', payload: this.normalizeActivityEntry(JSON.parse(entryJson)) })
      }
    } catch (err) {
      if (this._subscription === subscription) {
        this.emit({ type: 'activityStream', payload: { state: 'failed', message: errorMessage(err) } })
      }
    } finally {
      if (this._subscription === subscription) {
        this._subscription = undefined
      }
    }
  }

  stopActivity () {
    this._opening = undefined
    if (!this._subscription) return

    const subscription = this._subscription
    this._subscription = undefined
    addon.subscriptionClose(subscription).catch(() => {})
  }
}

/**
 * Creates the Bare native-addon transport's {@link WavelengthClient}.
 *
 * @param {unknown} [options] - Ignored.
 * @returns {WavelengthClient} The Bare native-addon transport client.
 */
export default function createWavelengthTransport (options) {
  return new BareWavelengthClient()
}
