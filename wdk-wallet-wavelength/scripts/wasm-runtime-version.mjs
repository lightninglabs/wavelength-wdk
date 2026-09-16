// Pins the wavelength release the WASM runtime assets are fetched from.
// Plain JS so build tooling can read it without type stripping.
//
// v0.1.2-rc3 is the first release with both the Node/Bare filesystem VFS and
// the external-seed lifecycle. Keep the pin exact: a runtime missing either
// still boots, but cannot provide this package's account contract.
import { pathToFileURL } from 'node:url'

export const WASM_RUNTIME_VERSION = 'v0.1.2-rc3'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(WASM_RUNTIME_VERSION ?? '')
}
