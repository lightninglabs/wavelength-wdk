// Covers plain-JS app modules that are deliberately decoupled from
// react-native at import time (e.g. lib/ipc-relay.js) -- not a full
// jest-expo/React Native Testing Library setup, since nothing here renders
// a component or touches a native module directly. testEnvironment 'node'
// (not 'jsdom') since these are logic-only unit tests.
//
// lib/, not app/: app/ is Expo Router's routes directory -- every file in it
// is treated as a route and gets bundled/evaluated at app runtime, where
// Jest globals (describe/it/...) don't exist. ipc-relay.js/.test.js used to
// live in app/ for this jest config's convenience and broke the Android
// build as a result (Metro tried to render ipc-relay.test.js as a screen).
// Moved out; nothing route-like belongs under app/ besides actual routes.
//
// wdk-wallet-wavelength (a `file:` dependency, see package.json) ships real
// ESM (`"type": "module"`, no CJS build) and is otherwise excluded from
// transformation by Jest's default transformIgnorePatterns -- babel-jest
// (picked up automatically via babel.config.js) needs to run over it too so
// its `export`/`import` syntax gets transpiled to CommonJS the same way
// this app's own sources are, rather than reaching Node's `require()` raw.
module.exports = {
  testEnvironment: 'node',
  // Scoped to lib/ only -- wdk-wallet-wavelength is a separate package with
  // its own jest config (ESM-native, run via `npm test` from within that
  // directory); without this, root `jest` globs into it too and fails, since
  // its tests need `NODE_OPTIONS=--experimental-vm-modules`, not babel-jest.
  roots: ['<rootDir>/lib'],
  transformIgnorePatterns: ['node_modules/(?!(wdk-wallet-wavelength)/)']
}
