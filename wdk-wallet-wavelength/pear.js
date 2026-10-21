'use strict'

// Pear's resolver rejects the `with { imports }` syntax used in bare.js.

import 'bare-node-runtime/global'

export * from './index.js'

export { default } from './index.js'
