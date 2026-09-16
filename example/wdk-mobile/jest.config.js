// Logic-only unit tests (lib/), not a full jest-expo/RNTL setup. app/ is
// Expo Router's routes dir and can't hold test files (Metro renders them as
// screens); wdk-wallet-wavelength needs babel-jest since it ships real ESM.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/lib'],
  transformIgnorePatterns: ['node_modules/(?!(wdk-wallet-wavelength)/)']
}
