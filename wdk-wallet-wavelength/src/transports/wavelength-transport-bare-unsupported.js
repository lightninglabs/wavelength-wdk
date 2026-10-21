'use strict'

import { WavelengthError } from '@lightninglabs/wavelength-core'

/**
 * Fallback for the `"bare"` and `"default"` conditions: an unlisted
 * `Bare.platform` or a non-Bare runtime. `Bare` is read defensively so Node
 * reports the unsupported runtime, not a ReferenceError.
 *
 * @param {unknown} [options] - Ignored.
 * @returns {never} Never returns; always throws.
 */
export default function createWavelengthTransport (options) {
  const platform = typeof Bare === 'undefined' ? undefined : Bare.platform
  const runtime = platform === undefined
    ? 'a non-Bare runtime'
    : `Bare.platform=${JSON.stringify(platform)}`

  throw new WavelengthError(
    `No Wavelength transport is implemented for ${runtime}. Supported: 'ios'/'pear' (native addon), 'android' (RN TurboModule relay), 'darwin'/'linux'/'win32' (WASM).`,
    'unsupported_facade_method'
  )
}
