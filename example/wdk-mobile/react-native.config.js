// iOS links the daemon through the worklet's addon; linking this package too
// would put a second Go runtime in the process.
module.exports = {
  dependencies: {
    '@lightninglabs/wavelength-react-native': {
      platforms: { ios: null }
    }
  }
}
