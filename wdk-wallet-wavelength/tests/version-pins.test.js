'use strict'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { RUNTIME_MANIFEST_VERSION } from '@lightninglabs/wavelength-core'

// The version string repeats across separately installed manifests; this
// keeps the copies from drifting apart.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MANIFESTS = [
  'wavelength-bare-addon/package.json',
  'wdk-wallet-wavelength/package.json',
  'example/wdk-cli/package.json',
  'example/wdk-mobile/package.json'
]

const require = createRequire(import.meta.url)

const SDK_PACKAGES = ['@lightninglabs/wavelength-core', '@lightninglabs/wavelength-react-native']

function lightningLabsPins () {
  return MANIFESTS.flatMap((file) => {
    const { dependencies = {}, devDependencies = {}, peerDependencies = {} } =
      JSON.parse(readFileSync(path.join(REPO_ROOT, file), 'utf8'))

    return Object.entries({ ...dependencies, ...devDependencies, ...peerDependencies })
      .filter(([name]) => SDK_PACKAGES.includes(name))
      .map(([name, version]) => ({ file, name, version }))
  })
}

test('every Lightning Labs SDK package is pinned to the same exact version', () => {
  const pins = lightningLabsPins()
  const expected = RUNTIME_MANIFEST_VERSION.replace(/^v/, '')

  expect(pins.length).toBeGreaterThan(0)
  expect(pins.filter((pin) => pin.version !== expected)).toEqual([])
})

test('the paired release has pinned checksums for every binary', () => {
  const aar = require('../scripts/aar-checksums.json')[RUNTIME_MANIFEST_VERSION]
  const xcframework = require('../../wavelength-bare-addon/scripts/checksums.json')[RUNTIME_MANIFEST_VERSION]
  const wasm = JSON.parse(readFileSync(path.join(REPO_ROOT, 'wdk-wallet-wavelength/scripts/wasm-runtime-checksums.json'), 'utf8'))[RUNTIME_MANIFEST_VERSION]

  expect(Object.keys(aar ?? {})).toEqual(['Wavewalletdk.aar'])
  expect(Object.keys(xcframework ?? {})).toEqual(['Wavewalletdk.xcframework.tar.gz'])
  expect(Object.keys(wasm ?? {})).toContain('wavewalletdk.wasm')
})
