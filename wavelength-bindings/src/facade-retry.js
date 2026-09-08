'use strict'

import { WavelengthError, errorMessage } from '@lightninglabs/wavelength-core'

/** @typedef {import('@lightninglabs/wavelength-core').FacadeMethod} FacadeMethod */

export const START_METHODS = new Set(['start', 'startExternalSeedWallet'])

const WALLET_ACTOR_NOT_INITIALIZED = 'wallet actor not initialized'
const ACTOR_READY_RETRY_INTERVAL_MS = 250
const ACTOR_READY_RETRY_TIMEOUT_MS = 10_000

const MOBILE_ALREADY_STARTED = 'already started'

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs one facade call attempt, retrying/self-healing the two daemon-level
 * races every Bare transport hits identically, then wrapping any other
 * failure in a {@link WavelengthError}.
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
  const deadline = Date.now() + ACTOR_READY_RETRY_TIMEOUT_MS
  let recoveredFromStaleStart = false

  for (;;) {
    try {
      return await attempt()
    } catch (err) {
      const message = errorMessage(err)

      if (message.includes(WALLET_ACTOR_NOT_INITIALIZED) && Date.now() < deadline) {
        await sleep(ACTOR_READY_RETRY_INTERVAL_MS)
        continue
      }

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
