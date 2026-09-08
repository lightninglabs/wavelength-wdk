'use strict'

// The RN-host-side half of the Bare Android IPC relay. Reads framed requests
// off Worklet.IPC, dispatches them to the "Wavelength" TurboModule, and
// writes the framed response back onto the same stream. Also subscribes to
// the wavelengthActivity device-event stream and forwards each entry as an
// unsolicited, id-less "activityEvent" message over the same connection,
// matching wavelength-transport-bare-android.js's ActivityEventMessage shape
// on the worklet side of this wire contract.
//
// Takes `ipc`, `nativeWavelength`, and `activityEmitter` as plain parameters
// rather than importing react-native/the TurboModule directly, so this file
// stays unit-testable with plain fakes.
import { encodeMessage, encodeOkResponse, encodeErrorResponse, LineDecoder } from 'wavelength-bindings/android/ipc-framing'

/**
 * The "Wavelength" TurboModule's real surface, minus the passkey methods
 * (explicitly out of scope).
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
 * `startActivity`/`stopActivity` are their own TurboModule methods, not
 * routed through the generic `call()` dispatch.
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
 * Wires one Worklet.IPC connection to one NativeWavelength TurboModule
 * instance and its activity-event stream. Call once per worklet lifetime
 * (e.g. right after `worklet.start()`).
 *
 * @param {Object} deps
 * @param {IpcLike} deps.ipc
 * @param {NativeWavelengthModule} deps.nativeWavelength
 * @param {DeviceEventEmitterLike} deps.activityEmitter
 * @returns {() => void} Tears down this relay. `Worklet.IPC` exposes no
 * `off`, so the listener itself can't be removed -- a `disposed` flag drops
 * any message that arrives after teardown instead. Needed for real: RN's
 * double-effect-mount in dev left a stale listener writing to an already
 * `worklet.terminate()`-torn-down handle, crashing on a real device.
 */
export function createIpcRelay ({ ipc, nativeWavelength, activityEmitter }) {
  const decoder = new LineDecoder()
  let disposed = false

  ipc.on('data', (chunk) => {
    if (disposed) return

    const messages = /** @type {FramedRequest[]} */ (decoder.push(chunk))

    for (const req of messages) {
      // This stream is shared with driver-wdk.mjs's own UI protocol, so a
      // message not meant for this relay (no string `method`) must be ignored.
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
