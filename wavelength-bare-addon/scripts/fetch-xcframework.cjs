// Stages Wavewalletdk.xcframework. Best effort on npm install (macOS only);
// fatal from the Expo plugin.
'use strict'

const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const CHECKSUMS = require('./checksums.json')
const ARCHIVE = 'Wavewalletdk.xcframework.tar.gz'
const XCFRAMEWORK = path.join(__dirname, '..', 'Wavewalletdk.xcframework')

// Records which archive the staged framework came from, since hashing the
// unpacked directory on every install would cost more than the check saves.
const STAMP = path.join(XCFRAMEWORK, '.wavelength-sha256')

function sha256 (file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

// A release with no pinned checksum fails here rather than downloading an
// unverified framework.
async function asset () {
  const { RUNTIME_MANIFEST_VERSION: version } = await import('@lightninglabs/wavelength-core')

  const expected = CHECKSUMS[version]?.[ARCHIVE]
  if (!expected) throw new Error(`no pinned checksum for ${ARCHIVE} in ${version}; add it to scripts/checksums.json`)

  return { url: `https://github.com/lightninglabs/wavelength/releases/download/${version}/${ARCHIVE}`, sha256: expected }
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

// gobind's headers use `@import Foundation;`, which the addon's Objective-C++
// build rejects, so rewrite it to a classic import.
function patchHeaders (dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.objc.h')) continue

    const file = path.join(entry.parentPath, entry.name)
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes('@import Foundation;')) {
      fs.writeFileSync(file, content.split('@import Foundation;').join('#import <Foundation/Foundation.h>'))
    }
  }
}

async function fetchXcframework () {
  const { url, sha256: expected } = await asset()
  if (fs.existsSync(STAMP) && fs.readFileSync(STAMP, 'utf8') === expected) return false

  // Unpacked and patched beside the target, then swapped in, so a failure
  // leaves whatever was staged before intact.
  const tmp = fs.mkdtempSync(path.join(path.dirname(XCFRAMEWORK), '.fetch-'))
  try {
    const tarball = path.join(tmp, ARCHIVE)
    fs.writeFileSync(tarball, await fetchWithRetry(url))

    const actual = sha256(tarball)
    if (actual !== expected) throw new Error(`${url} has sha256 ${actual}, expected ${expected}`)

    execFileSync('tar', ['-xzf', tarball, '-C', tmp, 'Wavewalletdk.xcframework'])

    const staged = path.join(tmp, 'Wavewalletdk.xcframework')
    patchHeaders(staged)
    fs.writeFileSync(path.join(staged, '.wavelength-sha256'), expected)

    fs.rmSync(XCFRAMEWORK, { recursive: true, force: true })
    fs.renameSync(staged, XCFRAMEWORK)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  return true
}

module.exports = { fetchXcframework }

// A failure must not break the install; prebuild retries.
if (require.main === module && process.platform === 'darwin') {
  fetchXcframework().then(
    (staged) => { if (staged) console.log('wavelength-bare-addon: staged Wavewalletdk.xcframework') },
    (err) => console.warn(`wavelength-bare-addon: could not stage Wavewalletdk.xcframework (${err.message}); expo prebuild will retry`)
  )
}
