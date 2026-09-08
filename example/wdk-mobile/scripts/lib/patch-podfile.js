// Idempotently inserts the `pod 'wavelength-bare-addon', ...` line into
// ios/Podfile. Called by fix-ios-durability.sh -- see that script and this
// directory's README.md for why this exists.
//
// Why not `sed`: BSD sed's multi-line `a\` append syntax is painful to get
// right with embedded quotes/comments; a plain string replace here is far
// less error-prone for something meant to be re-run unattended.
'use strict'

const fs = require('fs')
const path = require('path')

const PODFILE_PATH = path.join(__dirname, '../../ios/Podfile')
const MARKER = "pod 'wavelength-bare-addon'"
const ANCHOR = 'use_expo_modules!'

const POD_BLOCK = [
  '',
  '  # Vendors Wavewalletdk.xcframework, which wavelength-bindings/ios',
  "  # dynamically links against (CMakeLists.txt's -framework Wavewalletdk) but",
  '  # does not itself embed -- see wavelength-bare-addon.podspec for why this',
  '  # needs to be explicit rather than a side effect of another pod. Also',
  '  # propagates -lresolv (wavelength-bare-addon.podspec\'s s.libraries) onto',
  "  # the app's own final link -- Wavewalletdk's Go runtime needs libresolv.",
  "  pod 'wavelength-bare-addon', :path => '../../../wavelength-bindings/ios'"
].join('\n')

let content = fs.readFileSync(PODFILE_PATH, 'utf8')

// Self-heals a Podfile patched by an older version of this script, from
// before wavelength-bare-addon moved into wavelength-bindings/ios -- the
// stale `:path => '../worklet/wavelength-bare-addon'` (and any surrounding
// comments mentioning the old location) would otherwise sit there
// unnoticed, since the marker check below only looks for the pod *name*,
// not its path, and `pod install` fails on the now-nonexistent podspec.
const STALE_PATH = 'worklet/wavelength-bare-addon'
if (content.includes(STALE_PATH)) {
  content = content.split(STALE_PATH).join('wavelength-bindings/ios')
  fs.writeFileSync(PODFILE_PATH, content)
  console.log(`    corrected a stale "${STALE_PATH}" reference to wavelength-bindings/ios`)
}

if (content.includes(MARKER)) {
  console.log('    already present, skipping')
  process.exit(0)
}

if (!content.includes(ANCHOR)) {
  console.error(`    could not find anchor line "${ANCHOR}" in ios/Podfile -- add the pod line manually:`)
  console.error(`    ${POD_BLOCK.trim()}`)
  process.exit(1)
}

fs.writeFileSync(PODFILE_PATH, content.replace(ANCHOR, ANCHOR + '\n' + POD_BLOCK))
console.log('    inserted pod line -- run `pod install` inside ios/ next')
