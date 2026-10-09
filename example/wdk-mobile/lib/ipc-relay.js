'use strict'

// Dependencies are params, not react-native imports, so tests can fake them.
import { encodeMessage, encodeOkResponse, encodeErrorResponse, LineDecoder } from '@lightninglabs/wdk-wallet-wavelength/android/ipc-framing'

/**
 * The subset of Lightning Labs' "Wavelength" module this relay uses.
 *
 * @typedef {Object} NativeWavelengthModule
 * @property {(method: string, paramsJson: string) => Promise<string>} call
 * @property {(reqJson: string) => Promise<void>} startActivity
 * @property {() => Promise<void>} stopActivity
 */

/**
 * @typedef {Object} EmitterSubscription
 * @property {() => void} remove
 */

/**
 * @typedef {Object} DeviceEventEmitterLike
 * @property {(eventName: string, listener: (event: unknown) => void) => EmitterSubscription} addListener
 */

/**
 * @typedef {Object} IpcLike
 * @property {(data: string | Uint8Array) => void} write
 * @property {(event: 'data', listener: (chunk: unknown) => void) => void} on
 */

/**
 * @typedef {Object} FramedRequest
 * @property {number} id
 * @property {string} method
 * @property {unknown} [params]
 */

/**
 * @typedef {Object} ActivityEvent
 * @property {'entry' | 'end' | 'error'} kind
 * @property {string} payload
 */

/**
 * @param {unknown} err
 * @returns {string}
 */
function errorMessage (err) {
  return err instanceof Error ? err.message : String(err)
}

/**
 * `startActivity`/`stopActivity` are separate module methods, not `call()`
 * routes.
 *
 * @param {NativeWavelengthModule} nativeWavelength
 * @param {string} method
 * @param {unknown} params
 * @returns {Promise<unknown>}
 */
async function dispatch (nativeWavelength, method, params) {
  if (method === 'startActivity') {
    await nativeWavelength.startActivity(JSON.stringify(params ?? {}))
    return null
  }

  if (method === 'stopActivity') {
    await nativeWavelength.stopActivity()
    return null
  }

  const resultJson = await nativeWavelength.call(method, JSON.stringify(params ?? {}))
  // start/stop return a literal empty string, not a JSON value.
  return resultJson === '' ? null : JSON.parse(resultJson)
}

/**
 * Call once per worklet lifetime.
 *
 * @param {Object} deps
 * @param {IpcLike} deps.ipc
 * @param {NativeWavelengthModule} deps.nativeWavelength
 * @param {DeviceEventEmitterLike} deps.activityEmitter
 * @returns {() => void} Tears down this relay. `Worklet.IPC` has no `off`, so
 * a `disposed` flag drops late messages; a stale listener writing to a
 * terminated worklet's handle crashes the app.
 */
export function createIpcRelay ({ ipc, nativeWavelength, activityEmitter }) {
  const decoder = new LineDecoder()
  let disposed = false

  ipc.on('data', (chunk) => {
    if (disposed) return

    const messages = /** @type {FramedRequest[]} */ (decoder.push(chunk))

    for (const req of messages) {
      // The stream is shared with the driver's own UI protocol.
      if (typeof req.method !== 'string') continue

      dispatch(nativeWavelength, req.method, req.params)
        .then((result) => {
          if (disposed) return
          ipc.write(encodeOkResponse(req.id, result))
        })
        .catch((err) => {
          if (disposed) return
          ipc.write(encodeErrorResponse(req.id, errorMessage(err)))
        })
    }
  })

  const subscription = activityEmitter.addListener('wavelengthActivity', (event) => {
    if (disposed) return
    const { kind, payload } = /** @type {ActivityEvent} */ (event)
    ipc.write(encodeMessage({ type: 'activityEvent', kind, payload }))
  })

  return () => {
    disposed = true
    subscription.remove()
  }
}
