// wavelength-bindings and wdk-wallet-wavelength live outside this project's
// root (two directories up, at the repo root) and are pulled in as `file:`
// dependencies -- node_modules/wavelength-bindings and
// node_modules/wdk-wallet-wavelength are real symlinks pointing there.
// Metro only watches/resolves within its project root by default, so
// without watchFolders it can follow the symlink to resolve a bare import
// but fails on subpath exports resolved against files outside the root
// (e.g. `wavelength-bindings/native` -> `wavelength-bindings/src/NativeWavelength.ts`,
// "could not be found within the project or in these directories: node_modules").
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [
  path.resolve(workspaceRoot, 'wavelength-bindings'),
  path.resolve(workspaceRoot, 'wdk-wallet-wavelength')
]

// wavelength-bindings' peerDependencies (react/react-native) are
// deliberately NOT installed into its own node_modules (see its .npmrc --
// installing them there duplicates react-native and breaks codegen). Its
// source files are reached via watchFolders above, so Metro's normal
// ancestor-directory node_modules walk from their real path (under the repo
// root) never reaches this project's own node_modules and fails to resolve
// `react-native`. Adding it explicitly here is what lets those peer imports
// resolve against the one copy of react-native this app actually has.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]

module.exports = config
