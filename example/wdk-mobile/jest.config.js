// Tests live in lib/: Metro would render test files under app/ as routes.
// The wallet ships real ESM, hence the babel-jest transform exception.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/lib'],
  transformIgnorePatterns: ['node_modules/(?!(@lightninglabs/wdk-wallet-wavelength)/)'],
  // The wallet is symlinked, so it resolves outside this app where
  // babel-jest's injected @babel/runtime helpers aren't installed.
  modulePaths: ['<rootDir>/node_modules']
}
