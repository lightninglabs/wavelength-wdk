// wavelength-bindings/wdk-wallet-wavelength are `file:` deps symlinked from
// the repo root; Metro needs watchFolders to resolve subpath exports against
// files outside its project root (plain bare imports work without it).
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [
  path.resolve(workspaceRoot, 'wavelength-bindings'),
  path.resolve(workspaceRoot, 'wdk-wallet-wavelength')
]

// wavelength-bindings' peer imports (react/react-native, not installed in
// its own node_modules) otherwise fail to resolve from its real symlinked
// path outside this project root.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]

module.exports = config
