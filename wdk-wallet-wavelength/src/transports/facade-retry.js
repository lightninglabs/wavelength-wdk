'use strict'

import { WavelengthError, errorMessage } from '@lightninglabs/wavelength-core'

/** @typedef {import('@lightninglabs/wavelength-core').FacadeMethod} FacadeMethod */

export const START_METHODS = new Set(['start', 'startExternalSeedWallet'])

const MOBILE_ALREADY_STARTED = 'already started'

/**
 * Runs one facade call. A start rejected by a stale process-wide daemon
 * handle is retried once after stop(); any other failure is wrapped in a
 * {@link WavelengthError}.
 *
 * @template [T=unknown]
 * @param {() => Promise<T>} attempt - Makes one facade call attempt.
 * @param {Object} [options]
 * @param {boolean} [options.canRecoverStaleStart] - Whether this call is a
 * start-family method eligible for stale-handle recovery.
 * @param {() => Promise<unknown>} [options.stop] - Stops a stale process-wide
 * daemon handle, used only when `canRecoverStaleStart` is true.
 * @returns {Promise<T>}
 */
export async function invokeFacadeWithRetry (attempt, { canRecoverStaleStart = false, stop } = {}) {
  let recoveredFromStaleStart = false

  for (;;) {
    try {
      return await attempt()
    } catch (err) {
      const message = errorMessage(err)

      if (canRecoverStaleStart && stop && message.includes(MOBILE_ALREADY_STARTED) && !recoveredFromStaleStart) {
        recoveredFromStaleStart = true
        try {
          await stop()
        } catch {}
        continue
      }

      throw new WavelengthError(message, 'wavelength_error', { cause: err })
    }
  }
}
