'use strict'

import { Platform } from 'react-native'

// The package's entry point throws where the module is not linked (iOS), so
// it's only loaded on Android.
export default Platform.OS === 'android'
  ? require('@lightninglabs/wavelength-react-native').NativeWavelength
  : null
