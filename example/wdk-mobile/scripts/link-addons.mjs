// react-native-bare-kit links the addons of the package it's installed under,
// which under npm workspaces is the repo root, not this app, so link them here.
import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import link from 'bare-link'

const require = createRequire(import.meta.url)
const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const kit = path.dirname(require.resolve('react-native-bare-kit/package.json'))

// The Wavelength addon's prebuilds aren't committed. bare-link silently skips
// an addon with none, and links stale ones just as quietly; either way the iOS
// app fails only once the wallet starts. build.sh records the framework it
// built against only after every host succeeds, so a missing or mismatched
// record covers no build, a partial build, and a build for another daemon
// release. Warn rather than fail, since the build needs macOS and this also
// runs on Linux CI.
const addon = path.dirname(require.resolve('@lightninglabs/wavelength-bare-addon/package'))
const builtAgainst = readStamp(path.join(addon, 'build', 'framework.sha256'))
const staged = readStamp(path.join(addon, 'Wavewalletdk.xcframework', '.wavelength-sha256'))
const rebuild = 'On macOS, run `npm run build:native -w @lightninglabs/wavelength-bare-addon`, then `npm run postinstall` in example/wdk-mobile.'

if (!builtAgainst) {
  console.warn(`wdk-mobile: @lightninglabs/wavelength-bare-addon has no complete prebuilds, so iOS builds will not include it. ${rebuild}`)
} else if (staged && staged !== builtAgainst) {
  console.warn(`wdk-mobile: @lightninglabs/wavelength-bare-addon's prebuilds were built against a different daemon framework than the one staged. ${rebuild}`)
}

function readStamp (file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

const targets = [
  { hosts: ['ios-arm64', 'ios-arm64-simulator', 'ios-x64-simulator'], out: path.join(kit, 'ios', 'addons') },
  { hosts: ['android-arm64', 'android-arm', 'android-ia32', 'android-x64'], out: path.join(kit, 'android', 'src', 'main', 'addons') }
]

for (const opts of targets) {
  for await (const resource of link(app, opts)) console.log('Wrote', resource)
}
