'use strict'

import { BaseWavelengthClient, WavelengthError } from '@lightninglabs/wavelength-core'

import addon from 'wavelength-bare-addon'
import { invokeFacadeWithRetry, START_METHODS } from './facade-retry.js'

/** @typedef {import('@lightninglabs/wavelength-core').FacadeMethod} FacadeMethod */
/** @typedef {import('@lightninglabs/wavelength-core').WavelengthClient} WavelengthClient */
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

        if (method === 'stop') {
          return fn()
        }

        if (SCALAR_METHODS.has(method)) {
          return fn()
        }

        if (GETTER_METHODS.has(method)) {
          const resultJson = fn()
          return resultJson ? JSON.parse(resultJson) : null
        }

        const resultJson = fn(JSON.stringify(params ?? {}))
        return resultJson ? JSON.parse(resultJson) : null
      },
      { canRecoverStaleStart: START_METHODS.has(method), stop: () => addon.stop() }
    )
  }

  async openActivityStream (opts) {
    throw new WavelengthError(
      'Activity streaming is not implemented in the Bare transport yet (MobileSubscribe is bound in the addon but not wired to JS). Use list() to poll instead.',
      'unsupported_facade_method'
    )
  }

  stopActivity () {}
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
