'use strict'

import { WavelengthError } from '@lightninglabs/wavelength-core'

/**
 * Fallback for the `"bare"` and `"default"` condition-map entries: any
 * Bare/Pear host whose `Bare.platform` isn't
 * `ios`/`android`/`darwin`/`linux`/`win32`, and any non-Bare runtime (plain
 * Node, a browser bundler) where no condition matched at all. `Bare` is a
 * Bare-only global, so it is read defensively -- reaching this from Node
 * must report the unsupported runtime, not a ReferenceError.
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
