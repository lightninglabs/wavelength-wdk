// Pins the wavelength daemon release this package's WASM runtime assets
// (wavewalletdk.wasm + the go-wasmsqlite bundle) should be fetched from --
// same role as wavelength-sdk's RUNTIME_MANIFEST_VERSION /
// scripts/runtime-version.mjs, which fetch-wasm-runtime.sh's release-fetch
// mode mirrors. Plain JS on purpose, same reason as that file: build tooling
// that can't import TypeScript needs to read this without type stripping.
//
// v0.1.2-rc3 is the first published Wavelength release that contains both the
// Node/Bare filesystem VFS and the external-seed lifecycle used by indexed
// accounts. Keep this pin exact: a runtime without either capability can boot
// but cannot safely provide the account contract exposed by this package.
import { pathToFileURL } from 'node:url'

export const WASM_RUNTIME_VERSION = 'v0.1.2-rc3'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(WASM_RUNTIME_VERSION ?? '')
}
