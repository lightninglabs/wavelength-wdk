// The wavelength release the WASM runtime assets are fetched from. It is the
// daemon release @lightninglabs/wavelength-core is paired with, so bumping
// that dependency moves every binary together. Plain JS so build tooling can
// read it without type stripping.
import { pathToFileURL } from 'node:url'

import { RUNTIME_MANIFEST_VERSION } from '@lightninglabs/wavelength-core'

export const WASM_RUNTIME_VERSION = RUNTIME_MANIFEST_VERSION

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(WASM_RUNTIME_VERSION)
}
