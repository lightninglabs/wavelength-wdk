// Verifies downloaded release assets against the pinned SHA-256 manifest.
// The download has no signature and the files are later eval()'d with full
// trust, so this is the only check between a swapped asset and code
// execution in the process holding wallet secrets.
//
// Usage: node verify-wasm-runtime-checksums.mjs <stagingDir> <expectedVersion>
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [, , stagingDir, expectedVersion] = process.argv
if (!stagingDir || !expectedVersion) {
  console.error('usage: verify-wasm-runtime-checksums.mjs <stagingDir> <expectedVersion>')
  process.exit(1)
}

const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'wasm-runtime-checksums.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

if (manifest.version !== expectedVersion) {
  console.error(`error: wasm-runtime-checksums.json is pinned to ${manifest.version}, but WASM_RUNTIME_VERSION is ${expectedVersion}.`)
  console.error('       update the checksums manifest whenever the pinned release version changes.')
  process.exit(1)
}

let failed = false
for (const [file, expectedHash] of Object.entries(manifest.sha256)) {
  const actualHash = createHash('sha256').update(readFileSync(path.join(stagingDir, file))).digest('hex')
  if (actualHash !== expectedHash) {
    failed = true
    console.error(`error: checksum mismatch for ${file}`)
    console.error(`       expected ${expectedHash}`)
    console.error(`       actual   ${actualHash}`)
  }
}

if (failed) {
  console.error(`checksum verification failed for the ${expectedVersion} release -- refusing to stage a runtime whose content doesn't match what was pinned.`)
  process.exit(1)
}

console.log(`==> verified ${Object.keys(manifest.sha256).length} file(s) against wasm-runtime-checksums.json (${expectedVersion})`)
