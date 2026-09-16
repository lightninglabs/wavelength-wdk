// Expo config plugin replacing fix-ios-durability.sh's manual steps.
// `.cjs` not `app.plugin.js`: this package is "type":"module", and Expo's
// resolver loads plugins via synchronous require(), which can't load ESM.
// Reference it directly: "plugins": ["wavelength-bindings/app.plugin.cjs"]
'use strict'

const fs = require('fs')
const path = require('path')

// Resolved from the consuming project's own directory, not installed here --
// avoids forcing @expo/config-plugins (and its Xcode/plist tooling) onto
// every consumer of this package, including non-Expo ones like wdk-cli.
const { withPodfile, withDangerousMod } = require(require.resolve('@expo/config-plugins', { paths: [process.cwd()] }))

const PACKAGE_ROOT = __dirname
const XCFRAMEWORK_DIR = path.join(PACKAGE_ROOT, 'ios', 'Wavewalletdk.xcframework')
const ADDON_POD_PATH = path.join(PACKAGE_ROOT, 'ios')

const PODFILE_MARKER = "pod 'wavelength-bare-addon'"
const PODFILE_ANCHOR = 'use_expo_modules!'

function patchXcframeworkHeaders () {
  if (!fs.existsSync(XCFRAMEWORK_DIR)) return

  const stack = [XCFRAMEWORK_DIR]
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }

      if (entry.name !== 'Mobile.objc.h' && entry.name !== 'Universe.objc.h') continue

      const content = fs.readFileSync(fullPath, 'utf8')
      if (content.includes('@import Foundation;')) {
        fs.writeFileSync(fullPath, content.split('@import Foundation;').join('#import <Foundation/Foundation.h>'))
      }
    }
  }
}

function withWavelengthXcframeworkHeaders (config) {
  return withDangerousMod(config, ['ios', (config) => {
    patchXcframeworkHeaders()
    return config
  }])
}

function withWavelengthPodfile (config) {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents

    if (contents.includes(PODFILE_MARKER)) return config

    if (!contents.includes(PODFILE_ANCHOR)) {
      throw new Error(
        `wavelength-bindings/app.plugin.cjs: could not find "${PODFILE_ANCHOR}" in ios/Podfile -- ` +
        `add manually: pod 'wavelength-bare-addon', :path => '${ADDON_POD_PATH}'`
      )
    }

    const podBlock = [
      '',
      "  pod 'wavelength-bare-addon', :path => '" + ADDON_POD_PATH + "'"
    ].join('\n')

    config.modResults.contents = contents.replace(PODFILE_ANCHOR, PODFILE_ANCHOR + '\n' + podBlock)
    return config
  })
}

module.exports = function withWavelengthBareAddon (config) {
  config = withWavelengthXcframeworkHeaders(config)
  config = withWavelengthPodfile(config)
  return config
}
