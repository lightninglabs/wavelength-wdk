// Stages Wavewalletdk.aar into @lightninglabs/wavelength-react-native, which
// does not ship it. Best effort on npm install; fatal from the Expo plugin.
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const CHECKSUMS = require('./aar-checksums.json')

const RN_PACKAGE = '@lightninglabs/wavelength-react-native'

// A release with no pinned checksum fails here rather than downloading an
// unverified file.
async function asset (name) {
  const { RUNTIME_MANIFEST_VERSION: version } = await import('@lightninglabs/wavelength-core')

  const sha256 = CHECKSUMS[version]?.[name]
  if (!sha256) throw new Error(`no pinned checksum for ${name} in ${version}; add it to scripts/aar-checksums.json`)

  return { url: `https://github.com/lightninglabs/wavelength/releases/download/${version}/${name}`, sha256 }
}

function sha256 (file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

// Large release assets occasionally drop mid-transfer.
async function fetchWithRetry (url, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`could not download ${url} (${res.status})`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (attempt === attempts) throw err
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
    }
  }
}

async function download ({ url, sha256: expected }, dest) {
  fs.writeFileSync(dest, await fetchWithRetry(url))

  const actual = sha256(dest)
  if (actual !== expected) {
    fs.rmSync(dest)
    throw new Error(`${url} has sha256 ${actual}, expected ${expected}`)
  }
}

// The package exports neither package.json nor a require() entry, so walk up
// the way Node would rather than resolving into it.
function findReactNativePackage (startDir) {
  for (let dir = path.resolve(startDir); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', RN_PACKAGE)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    if (dir === path.dirname(dir)) return null
  }
}

async function fetchAndroid (pkgDir) {
  const aar = await asset('Wavewalletdk.aar')
  const dest = path.join(pkgDir, 'android', 'libs', 'Wavewalletdk.aar')
  if (fs.existsSync(dest) && sha256(dest) === aar.sha256) return false

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = dest + '.download'
  await download(aar, tmp)
  fs.renameSync(tmp, dest)

  return true
}

module.exports = { RN_PACKAGE, findReactNativePackage, fetchAndroid }

// INIT_CWD finds the app even when this package lives outside it (a workspace).
// A failure must not break the install; prebuild retries.
if (require.main === module) {
  const log = (msg) => console.log(`wdk-wallet-wavelength: ${msg}`)
  const warn = (what, err) => console.warn(`wdk-wallet-wavelength: could not stage ${what} (${err.message}); expo prebuild will retry`)

  const pkgDir = findReactNativePackage(process.env.INIT_CWD || process.cwd()) || findReactNativePackage(__dirname)

  if (pkgDir) {
    fetchAndroid(pkgDir).then(
      (staged) => { if (staged) log(`staged Wavewalletdk.aar into ${RN_PACKAGE}`) },
      (err) => warn('Wavewalletdk.aar', err)
    )
  }
}
