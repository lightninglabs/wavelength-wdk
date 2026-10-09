// `.cjs`: the package is "type":"module" and Expo loads plugins via
// synchronous require(), which can't load ESM.
'use strict'

const path = require('path')

const { fetchXcframework } = require('@lightninglabs/wavelength-bare-addon/fetch-xcframework')

const { RN_PACKAGE, findReactNativePackage, fetchAndroid } = require('./scripts/fetch-aar.cjs')

// Resolved from the consuming project, not a dependency here, so non-Expo
// consumers don't pull in @expo/config-plugins.
const { withPodfile, withDangerousMod } = require(require.resolve('@expo/config-plugins', { paths: [process.cwd()] }))

const ADDON_POD_PATH = path.dirname(require.resolve('@lightninglabs/wavelength-bare-addon/package'))

const PODFILE_MARKER = "pod 'wavelength-bare-addon'"
const PODFILE_ANCHOR = 'use_expo_modules!'

function withWavelengthXcframework (config) {
  return withDangerousMod(config, ['ios', async (config) => {
    await fetchXcframework()
    return config
  }])
}

function withWavelengthPodfile (config) {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents

    if (contents.includes(PODFILE_MARKER)) return config

    if (!contents.includes(PODFILE_ANCHOR)) {
      throw new Error(
        `@lightninglabs/wdk-wallet-wavelength/app.plugin.cjs: could not find "${PODFILE_ANCHOR}" in ios/Podfile -- ` +
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

function withWavelengthAndroidBinding (config) {
  return withDangerousMod(config, ['android', async (config) => {
    const pkgDir = findReactNativePackage(config.modRequest.projectRoot)
    if (!pkgDir) throw new Error(`wdk-wallet-wavelength: ${RN_PACKAGE} is not installed`)
    await fetchAndroid(pkgDir)
    return config
  }])
}

module.exports = function withWavelengthBareAddon (config) {
  config = withWavelengthXcframework(config)
  config = withWavelengthPodfile(config)
  config = withWavelengthAndroidBinding(config)
  return config
}
