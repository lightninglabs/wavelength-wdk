'use strict'

const fs = require('bare-fs')
const path = require('bare-path')
const { createRequire } = require('bare-module')
const nodeRuntimeImports = require('bare-node-runtime/imports')

const { fsShimPath, sourcePath } = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'boot-config.json'), 'utf8')
)

const customImports = {
  ...nodeRuntimeImports,
  fs: { ...nodeRuntimeImports.fs, bare: fsShimPath },
  'node:fs': { ...nodeRuntimeImports['node:fs'], bare: fsShimPath }
}
globalThis.require = createRequire(/** @type {any} */ (module).url, { imports: customImports })
require('bare-node-runtime/global')

/** @type {any} */
const bareFs = globalThis.require('node:fs')
const source = bareFs.readFileSync(sourcePath, 'utf8')
;(0, eval)(source) // eslint-disable-line no-eval
