'use strict'

/**
 * Pear Runtime entry point. Pear's bare-module resolver does not support the
 * `with { imports }` syntax used in bare.js.
 */

import 'bare-node-runtime/global'

export * from './index.js'

export { default } from './index.js'
